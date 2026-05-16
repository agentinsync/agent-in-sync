import { z } from 'zod';
import { eq, sql, inArray } from 'drizzle-orm';
import {
  issues,
  solutions,
  tags,
  issueTags,
  notifications,
  users,
  organizations,
  apiKeys,
  agents,
} from '@agent-in-sync/db-client';
import type { Transaction } from '@agent-in-sync/db-client';
import { issueMetadataSchema, type IssueMetadata } from '@agent-in-sync/shared';
import {
  SOLUTION_COLLECTION,
  type SolutionVector,
  syncSolutionAccepted,
  severityToOrder,
  complexityToOrder,
} from '../weaviate/index.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { extractMetadataFromContent } from '../utils/frontmatter.js';
import { TrustService } from './trust.service.js';
import { QuotaService } from './quota.service.js';
import { DuplicateService, type SimilarIssue } from './duplicate.service.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import { BadgeService } from './badges/badge.service.js';
import { writeAudit } from './audit.js';

export const submitSchema = z.object({
  title: z.string().min(10).max(500),
  summary: z.string().min(20).max(500),
  description: z.string().min(20).max(50000),
  tags: z.array(z.string().max(50)).min(1).max(10),
  solution: z.string().min(10).max(50000).optional(),
  metadata: issueMetadataSchema.optional(),
});

export type SubmitInput = z.infer<typeof submitSchema>;

export type SubmitResponse = {
  issue_id: string;
  solution_id?: string;
};

export type DuplicateError = Error & {
  code: 'DUPLICATE_ISSUE';
  exactMatch?: { id: string; title: string };
  similarIssues: SimilarIssue[];
};

export class SubmitService {
  private trustService: TrustService;
  private quotaService: QuotaService;
  private duplicateService: DuplicateService;

  constructor(private deps: ServiceDependencies) {
    this.trustService = new TrustService(deps);
    this.quotaService = new QuotaService(deps);
    this.duplicateService = new DuplicateService(deps);
  }

  private async ensureTagsExist(
    db: ServiceDependencies['db'] | Transaction,
    tagNames: string[]
  ): Promise<string[]> {
    const normalized = [...new Set(tagNames.map(normalizeTag))];

    const existing = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.name, normalized));

    const existingNames = new Set(existing.map(t => t.name));
    const newNames = normalized.filter(n => !existingNames.has(n));

    if (newNames.length > 0) {
      await db.insert(tags).values(newNames.map(name => ({ name, usageCount: 1 })));
    }

    if (existing.length > 0) {
      await db
        .update(tags)
        .set({ usageCount: sql`${tags.usageCount} + 1` })
        .where(
          inArray(
            tags.id,
            existing.map(t => t.id)
          )
        );
    }

    const allTags = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.name, normalized));
    return allTags.map(t => t.id);
  }

  private async indexSolutionInWeaviate(
    solutionId: string,
    issueId: string,
    organizationId: string,
    userId: string,
    title: string,
    content: string,
    tagNames: string[],
    metadata: IssueMetadata | null,
    issueCreatedAt: Date,
    apiKeyId?: string,
    agentId?: string
  ): Promise<void> {
    const { db, weaviateClient } = this.deps;
    if (!weaviateClient) return;

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);

      const packageNames = metadata?.packages?.map(p => p.name) ?? [];
      const packageVersions = metadata?.packages?.map(p => `${p.name}@${p.version}`) ?? [];
      if (metadata?.packages) {
        for (const pkg of metadata.packages) {
          const majorVersion = pkg.version.split('.')[0];
          packageVersions.push(`${pkg.name}@${majorVersion}`);
        }
      }

      const displayFields = await this.fetchDisplayFields(
        db,
        userId,
        organizationId,
        apiKeyId,
        agentId
      );

      await collection.data.insert({
        solutionId,
        issueId,
        organizationId,
        title,
        content,
        tags: tagNames,
        voteCount: 0,
        createdAt: new Date(),
        issueCreatedAt,
        project: metadata?.project ?? null,
        techStack: metadata?.techStack ?? [],
        packageNames,
        packageVersions,
        errorType: metadata?.errorType ?? null,
        errorCategory: metadata?.errorCategory ?? null,
        severity: metadata?.severity ?? null,
        environment: metadata?.environment ?? null,
        fileTypes: metadata?.fileTypes ?? [],
        codePatterns: metadata?.codePatterns ?? [],
        affectedArea: metadata?.affectedArea ?? null,
        frequency: metadata?.frequency ?? null,
        hasMinimalRepro: metadata?.hasMinimalRepro ?? null,
        rootCause: metadata?.rootCause ?? null,
        fixType: metadata?.fixType ?? null,
        complexity: metadata?.complexity ?? null,
        relatedPatterns: metadata?.relatedPatterns ?? [],
        lessonsLearned: metadata?.lessonsLearned ?? [],
        severityOrder: severityToOrder(metadata?.severity),
        complexityOrder: complexityToOrder(metadata?.complexity),
        ...displayFields,
      });

      await db
        .update(solutions)
        .set({ weaviateIndexedAt: new Date() })
        .where(eq(solutions.id, solutionId));

      trackSuccess(OPERATIONS.WEAVIATE_INDEX, Date.now() - startTime);
      logger.debug('Solution indexed in Weaviate', { solutionId, issueId });
    } catch (err) {
      logger.logError('Failed to index solution in Weaviate', err, { solutionId, issueId });
      trackError(OPERATIONS.WEAVIATE_INDEX, 'WEAVIATE_ERROR');
    }
  }

  async submit(
    input: SubmitInput,
    userId: string,
    organizationId: string,
    apiKeyId?: string,
    agentId?: string
  ): Promise<SubmitResponse> {
    const startTime = Date.now();
    const {
      title,
      summary,
      description,
      tags: tagNames,
      solution,
      metadata: explicitMetadata,
    } = input;

    try {
      // Check quota if submitting via API key
      if (apiKeyId) {
        const quotaCheck = await this.quotaService.checkQuota(apiKeyId, 'issue');
        if (!quotaCheck.allowed) {
          const error = new Error('QUOTA_EXCEEDED') as Error & {
            quotaInfo: typeof quotaCheck;
          };
          error.quotaInfo = quotaCheck;
          throw error;
        }
      }

      const { metadata, cleanDescription } = extractMetadataFromContent(
        description,
        explicitMetadata
      );

      // Check for duplicates
      const duplicateCheck = await this.duplicateService.checkForDuplicates(
        title,
        cleanDescription,
        organizationId
      );

      if (duplicateCheck.isDuplicate) {
        const error = new Error('DUPLICATE_ISSUE') as DuplicateError;
        error.code = 'DUPLICATE_ISSUE';
        error.exactMatch = duplicateCheck.exactMatch;
        error.similarIssues = duplicateCheck.similarIssues;
        throw error;
      }

      const result = await this.deps.db.transaction(async tx => {
        const tagIds = await this.ensureTagsExist(tx, tagNames);

        const [createdIssue] = await tx
          .insert(issues)
          .values({
            organizationId,
            authorId: userId,
            authorApiKeyId: apiKeyId ?? null,
            authorAgentId: agentId ?? null,
            title,
            description: cleanDescription,
            solutionCount: solution ? 1 : 0,
            contentHash: duplicateCheck.contentHash,

            project: metadata?.project ?? null,
            techStack: metadata?.techStack ?? null,
            packages: metadata?.packages ?? null,
            errorType: metadata?.errorType ?? null,
            errorCategory: metadata?.errorCategory ?? null,
            severity: metadata?.severity ?? null,
            environment: metadata?.environment ?? null,
            fileTypes: metadata?.fileTypes ?? null,
            codePatterns: metadata?.codePatterns ?? null,
            affectedArea: metadata?.affectedArea ?? null,
            frequency: metadata?.frequency ?? null,
            hasMinimalRepro: metadata?.hasMinimalRepro ?? null,
            stepsToReproduce: metadata?.stepsToReproduce ?? null,
            rootCause: metadata?.rootCause ?? null,
            fixType: metadata?.fixType ?? null,
            complexity: metadata?.complexity ?? null,
            timeToResolve: metadata?.timeToResolve ?? null,
            lessonsLearned: metadata?.lessonsLearned ?? null,
            relatedPatterns: metadata?.relatedPatterns ?? null,
            customMetadata: metadata?.customMetadata ?? null,
          })
          .returning({ id: issues.id, createdAt: issues.createdAt });

        if (!createdIssue) {
          logger.error('Issue creation failed: database insert returned empty', {
            userId,
            organizationId,
          });
          trackError(OPERATIONS.SUBMIT_ISSUE, 'DB_INSERT_FAILED');
          throw new Error('Failed to create issue');
        }

        if (tagIds.length > 0) {
          await tx
            .insert(issueTags)
            .values(tagIds.map(tagId => ({ issueId: createdIssue.id, tagId })));
        }

        let solutionId: string | undefined;

        if (solution) {
          // Check solution quota if API key provided
          if (apiKeyId) {
            const solutionQuotaCheck = await this.quotaService.checkQuota(apiKeyId, 'solution');
            if (!solutionQuotaCheck.allowed) {
              const error = new Error('SOLUTION_QUOTA_EXCEEDED') as Error & {
                quotaInfo: typeof solutionQuotaCheck;
              };
              error.quotaInfo = solutionQuotaCheck;
              throw error;
            }
          }

          const [createdSolution] = await tx
            .insert(solutions)
            .values({
              issueId: createdIssue.id,
              authorId: userId,
              authorApiKeyId: apiKeyId ?? null,
              authorAgentId: agentId ?? null,
              content: solution,
            })
            .returning({ id: solutions.id });

          if (!createdSolution) {
            logger.error('Solution creation failed during submit', {
              issueId: createdIssue.id,
              userId,
            });
            trackError(OPERATIONS.SUBMIT_ISSUE, 'SOLUTION_INSERT_FAILED');
            throw new Error('Failed to create solution');
          }

          solutionId = createdSolution.id;

          // Increment solution quota usage
          if (apiKeyId) {
            await this.quotaService.incrementUsage(apiKeyId, 'solution');
            await this.trustService.incrementStat(apiKeyId, 'solutionsCreated', 1);
          }
        }

        // Increment issue quota usage and trust stats
        if (apiKeyId) {
          await this.quotaService.incrementUsage(apiKeyId, 'issue');
          await this.trustService.incrementStat(apiKeyId, 'issuesCreated', 1);
          await this.trustService.updateUserReputationFromApiKeys(userId);
        }

        return { issueId: createdIssue.id, issueCreatedAt: createdIssue.createdAt, solutionId };
      });

      // Non-blocking badge evaluation (outside transaction)
      if (apiKeyId) {
        new BadgeService(this.deps).evaluateForApiKey(apiKeyId).catch(() => {});
      }

      // Index the issue in Weaviate for duplicate detection (outside transaction)
      await this.duplicateService.indexIssue(
        result.issueId,
        organizationId,
        title,
        cleanDescription,
        tagNames.map(t => t.toLowerCase().trim()),
        {
          project: metadata?.project,
          techStack: metadata?.techStack,
          errorType: metadata?.errorType,
        }
      );

      if (solution && result.solutionId) {
        await this.indexSolutionInWeaviate(
          result.solutionId,
          result.issueId,
          organizationId,
          userId,
          title,
          summary,
          tagNames.map(t => t.toLowerCase().trim()),
          metadata,
          new Date(result.issueCreatedAt),
          apiKeyId,
          agentId
        );
      }

      const durationMs = Date.now() - startTime;
      logger.info('Issue submitted successfully', {
        issueId: result.issueId,
        solutionId: result.solutionId,
        userId,
        organizationId,
        tagCount: tagNames.length,
        hasSolution: !!solution,
        hasMetadata: !!metadata,
        durationMs,
      });
      trackSuccess(OPERATIONS.SUBMIT_ISSUE, durationMs, { hasSolution: String(!!solution) });

      writeAudit(this.deps.db, userId, 'issue.created', 'issue', result.issueId, {
        organizationId,
        isBot: !!apiKeyId,
        agentId: agentId ?? null,
        hasSolution: !!solution,
      });
      if (solution && result.solutionId) {
        writeAudit(this.deps.db, userId, 'solution.submitted', 'solution', result.solutionId, {
          issueId: result.issueId,
          isBot: !!apiKeyId,
          agentId: agentId ?? null,
        });
      }

      return {
        issue_id: result.issueId,
        solution_id: result.solutionId,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        !err.message.startsWith('Failed to create') &&
        !err.message.includes('QUOTA_EXCEEDED') &&
        !err.message.includes('DUPLICATE_ISSUE')
      ) {
        logger.logError('Unexpected error in submit', err, { userId, organizationId });
        trackError(OPERATIONS.SUBMIT_ISSUE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async getIssue(
    issueId: string
  ): Promise<{ id: string; authorId: string; organizationId: string } | null> {
    const { db } = this.deps;
    const [issue] = await db
      .select({ id: issues.id, authorId: issues.authorId, organizationId: issues.organizationId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .limit(1);
    return issue ?? null;
  }

  async getSolution(
    solutionId: string
  ): Promise<{ id: string; authorId: string; issueId: string } | null> {
    const { db } = this.deps;
    const [solution] = await db
      .select({ id: solutions.id, authorId: solutions.authorId, issueId: solutions.issueId })
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);
    return solution ?? null;
  }

  async deleteIssue(issueId: string): Promise<boolean> {
    const startTime = Date.now();
    const { db, weaviateClient } = this.deps;

    try {
      const [issue] = await db
        .select({ id: issues.id, authorId: issues.authorId })
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1);

      if (!issue) {
        return false;
      }

      if (weaviateClient) {
        try {
          const issueSolutions = await db
            .select({ id: solutions.id })
            .from(solutions)
            .where(eq(solutions.issueId, issueId));

          const collection = weaviateClient.collections.get(SOLUTION_COLLECTION);
          for (const sol of issueSolutions) {
            await collection.data.deleteById(sol.id);
          }
        } catch (err) {
          logger.logError('Failed to delete solutions from Weaviate', err, { issueId });
        }

        // Delete issue from Weaviate Issue collection
        await this.duplicateService.deleteIssueFromIndex(issueId);
      }

      await db.delete(issues).where(eq(issues.id, issueId));

      const durationMs = Date.now() - startTime;
      logger.info('Issue deleted successfully', { issueId, durationMs });
      trackSuccess(OPERATIONS.SUBMIT_ISSUE, durationMs);

      writeAudit(db, issue.authorId, 'issue.deleted', 'issue', issueId, { issueId });

      return true;
    } catch (err) {
      logger.logError('Failed to delete issue', err, { issueId });
      trackError(OPERATIONS.SUBMIT_ISSUE, 'DELETE_FAILED');
      throw err;
    }
  }

  async deleteSolution(solutionId: string): Promise<boolean> {
    const startTime = Date.now();
    const { db, weaviateClient } = this.deps;

    try {
      const [solution] = await db
        .select({ id: solutions.id, issueId: solutions.issueId, authorId: solutions.authorId })
        .from(solutions)
        .where(eq(solutions.id, solutionId))
        .limit(1);

      if (!solution) {
        return false;
      }

      if (weaviateClient) {
        try {
          const collection = weaviateClient.collections.get(SOLUTION_COLLECTION);
          await collection.data.deleteById(solutionId);
        } catch (err) {
          logger.logError('Failed to delete solution from Weaviate', err, { solutionId });
        }
      }

      await db.delete(solutions).where(eq(solutions.id, solutionId));

      await db
        .update(issues)
        .set({ solutionCount: sql`GREATEST(${issues.solutionCount} - 1, 0)` })
        .where(eq(issues.id, solution.issueId));

      const durationMs = Date.now() - startTime;
      logger.info('Solution deleted successfully', {
        solutionId,
        issueId: solution.issueId,
        durationMs,
      });
      trackSuccess(OPERATIONS.SUBMIT_ISSUE, durationMs);

      writeAudit(db, solution.authorId, 'solution.deleted', 'solution', solutionId, {
        issueId: solution.issueId,
      });

      return true;
    } catch (err) {
      logger.logError('Failed to delete solution', err, { solutionId });
      trackError(OPERATIONS.SUBMIT_ISSUE, 'DELETE_FAILED');
      throw err;
    }
  }

  async acceptSolution(
    solutionId: string,
    userId: string,
    organizationId: string
  ): Promise<{ accepted: boolean }> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [solution] = await db
        .select({
          id: solutions.id,
          issueId: solutions.issueId,
          authorId: solutions.authorId,
          authorApiKeyId: solutions.authorApiKeyId,
          isAccepted: solutions.isAccepted,
        })
        .from(solutions)
        .where(eq(solutions.id, solutionId))
        .limit(1);

      if (!solution) {
        throw new NotFoundError('Solution');
      }

      const [issue] = await db
        .select({
          id: issues.id,
          authorId: issues.authorId,
          organizationId: issues.organizationId,
          acceptedSolutionId: issues.acceptedSolutionId,
        })
        .from(issues)
        .where(eq(issues.id, solution.issueId))
        .limit(1);

      if (!issue) {
        throw new NotFoundError('Issue');
      }

      if (issue.organizationId !== organizationId) {
        throw new ForbiddenError('ORG_MISMATCH', 'Solution does not belong to your organization');
      }

      if (issue.authorId !== userId) {
        throw new ForbiddenError('NOT_ISSUE_AUTHOR', 'Only the issue author can accept a solution');
      }

      if (solution.isAccepted) {
        return { accepted: true };
      }

      await this.deps.db.transaction(async tx => {
        // If there was a previously accepted solution, unaccept it
        if (issue.acceptedSolutionId && issue.acceptedSolutionId !== solutionId) {
          const [prevSolution] = await tx
            .select({ authorApiKeyId: solutions.authorApiKeyId, authorId: solutions.authorId })
            .from(solutions)
            .where(eq(solutions.id, issue.acceptedSolutionId))
            .limit(1);

          await tx
            .update(solutions)
            .set({ isAccepted: false })
            .where(eq(solutions.id, issue.acceptedSolutionId));

          // Decrement accepted count for previous solution author
          if (prevSolution?.authorApiKeyId) {
            await this.trustService.incrementStat(
              prevSolution.authorApiKeyId,
              'acceptedSolutions',
              -1
            );
            await this.trustService.checkTrustLevelTransition(prevSolution.authorApiKeyId);
            await this.trustService.updateUserReputationFromApiKeys(prevSolution.authorId);
          }
        }

        // Accept the new solution
        await tx.update(solutions).set({ isAccepted: true }).where(eq(solutions.id, solutionId));

        await tx
          .update(issues)
          .set({ acceptedSolutionId: solutionId })
          .where(eq(issues.id, solution.issueId));

        // Increment accepted count for solution author
        if (solution.authorApiKeyId) {
          await this.trustService.incrementStat(solution.authorApiKeyId, 'acceptedSolutions', 1);
          await this.trustService.checkTrustLevelTransition(solution.authorApiKeyId);
          await this.trustService.updateUserReputationFromApiKeys(solution.authorId);

          // Create notification for the solution author
          await tx.insert(notifications).values({
            userId: solution.authorId,
            apiKeyId: solution.authorApiKeyId,
            type: 'solution_accepted',
            title: 'Solution accepted',
            message: 'Your solution was marked as accepted by the issue author.',
            metadata: { solutionId, issueId: solution.issueId },
          });
        }
      });

      // Non-blocking badge evaluation (outside transaction)
      if (solution.authorApiKeyId) {
        new BadgeService(this.deps).evaluateForApiKey(solution.authorApiKeyId).catch(() => {});
      }

      // Sync acceptance status to Weaviate
      if (this.deps.weaviateClient) {
        syncSolutionAccepted(this.deps.weaviateClient, solutionId, true).catch(() => {});
        if (issue.acceptedSolutionId && issue.acceptedSolutionId !== solutionId) {
          syncSolutionAccepted(this.deps.weaviateClient, issue.acceptedSolutionId, false).catch(
            () => {}
          );
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('Solution accepted', {
        solutionId,
        issueId: solution.issueId,
        userId,
        solutionAuthorId: solution.authorId,
        durationMs,
      });
      trackSuccess(OPERATIONS.SOLUTION_ACCEPT, durationMs);

      writeAudit(this.deps.db, userId, 'solution.accepted', 'solution', solutionId, {
        issueId: solution.issueId,
        solutionAuthorId: solution.authorId,
      });

      return { accepted: true };
    } catch (err) {
      if (!(err instanceof NotFoundError) && !(err instanceof ForbiddenError)) {
        logger.logError('Failed to accept solution', err, { solutionId, userId });
        trackError(OPERATIONS.SOLUTION_ACCEPT, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  private async fetchDisplayFields(
    db: ServiceDependencies['db'],
    userId: string,
    organizationId: string,
    apiKeyId?: string,
    agentId?: string
  ) {
    const [[userRow], [orgRow], agentRow, apiKeyRow] = await Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
      db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
      agentId
        ? db
            .select({ slug: agents.slug, displayName: agents.displayName })
            .from(agents)
            .where(eq(agents.id, agentId))
            .limit(1)
            .then(rows => rows[0])
        : Promise.resolve(undefined),
      apiKeyId
        ? db
            .select({ trustLevel: apiKeys.trustLevel })
            .from(apiKeys)
            .where(eq(apiKeys.id, apiKeyId))
            .limit(1)
            .then(rows => rows[0])
        : Promise.resolve(undefined),
    ]);

    return {
      authorName: userRow?.name ?? 'Unknown',
      agentSlug: agentRow?.slug ?? null,
      agentDisplayName: agentRow?.displayName ?? null,
      organizationName: orgRow?.name ?? 'Unknown',
      isAccepted: false,
      authorTrustLevel: apiKeyRow?.trustLevel ?? 'new',
    };
  }
}

export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[.\s]+/g, '-');
}
