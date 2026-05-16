import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import {
  issues,
  solutions,
  issueTags,
  tags,
  users,
  organizations,
  apiKeys,
  agents,
} from '@agent-in-sync/db-client';
import {
  SOLUTION_COLLECTION,
  type SolutionVector,
  severityToOrder,
  complexityToOrder,
} from '../weaviate/index.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';
import { QuotaService } from './quota.service.js';
import { TrustService } from './trust.service.js';
import { writeAudit } from './audit.js';

export const suggestSchema = z.object({
  issue_id: z.string().uuid(),
  suggestion: z.string().min(10).max(50000),
});

export type SuggestInput = z.infer<typeof suggestSchema>;

export type SuggestResponse = {
  solution_id: string;
};

export class SuggestService {
  private quotaService: QuotaService;
  private trustService: TrustService;

  constructor(private deps: ServiceDependencies) {
    this.quotaService = new QuotaService(deps);
    this.trustService = new TrustService(deps);
  }

  async suggest(
    input: SuggestInput,
    userId: string,
    organizationId: string,
    apiKeyId?: string,
    agentId?: string
  ): Promise<SuggestResponse> {
    const startTime = Date.now();
    const { db, weaviateClient } = this.deps;
    const { issue_id, suggestion } = input;

    try {
      // Check quota if submitting via API key
      if (apiKeyId) {
        const quotaCheck = await this.quotaService.checkQuota(apiKeyId, 'solution');
        if (!quotaCheck.allowed) {
          const error = new Error('QUOTA_EXCEEDED') as Error & {
            quotaInfo: typeof quotaCheck;
          };
          error.quotaInfo = quotaCheck;
          throw error;
        }
      }

      const [issue] = await db
        .select({
          id: issues.id,
          title: issues.title,
          organizationId: issues.organizationId,
          project: issues.project,
          techStack: issues.techStack,
          packages: issues.packages,
          errorType: issues.errorType,
          errorCategory: issues.errorCategory,
          severity: issues.severity,
          environment: issues.environment,
          fileTypes: issues.fileTypes,
          codePatterns: issues.codePatterns,
          affectedArea: issues.affectedArea,
          frequency: issues.frequency,
          hasMinimalRepro: issues.hasMinimalRepro,
          rootCause: issues.rootCause,
          fixType: issues.fixType,
          complexity: issues.complexity,
          relatedPatterns: issues.relatedPatterns,
          lessonsLearned: issues.lessonsLearned,
          createdAt: issues.createdAt,
        })
        .from(issues)
        .where(eq(issues.id, issue_id))
        .limit(1);

      if (!issue) {
        logger.warn('Suggestion failed: issue not found', { issueId: issue_id, userId });
        trackError(OPERATIONS.SUGGEST_SOLUTION, 'ISSUE_NOT_FOUND');
        throw new Error('ISSUE_NOT_FOUND');
      }

      if (issue.organizationId !== organizationId) {
        logger.warn('Suggestion failed: issue belongs to different organization', {
          issueId: issue_id,
          userId,
          issueOrgId: issue.organizationId,
          userOrgId: organizationId,
        });
        trackError(OPERATIONS.SUGGEST_SOLUTION, 'ORG_MISMATCH');
        throw new ForbiddenError('Issue does not belong to your organization');
      }

      const created = await db.transaction(async tx => {
        const [txCreated] = await tx
          .insert(solutions)
          .values({
            issueId: issue_id,
            authorId: userId,
            authorApiKeyId: apiKeyId ?? null,
            authorAgentId: agentId ?? null,
            content: suggestion,
          })
          .returning({ id: solutions.id });

        if (!txCreated) {
          logger.error('Suggestion creation failed: database insert returned empty', {
            issueId: issue_id,
            userId,
          });
          trackError(OPERATIONS.SUGGEST_SOLUTION, 'DB_INSERT_FAILED');
          throw new Error('Failed to create suggestion');
        }

        await tx
          .update(issues)
          .set({ solutionCount: sql`${issues.solutionCount} + 1` })
          .where(eq(issues.id, issue_id));

        // Track quota and trust stats
        if (apiKeyId) {
          await this.quotaService.incrementUsage(apiKeyId, 'solution');
          await this.trustService.incrementStat(apiKeyId, 'solutionsCreated', 1);
          await this.trustService.updateUserReputationFromApiKeys(userId);
        }

        return txCreated;
      });

      // Weaviate indexing (outside transaction)
      const issueTaGs = await db
        .select({ name: tags.name })
        .from(issueTags)
        .innerJoin(tags, eq(issueTags.tagId, tags.id))
        .where(eq(issueTags.issueId, issue_id));

      const tagNames = issueTaGs.map(t => t.name);

      if (weaviateClient) {
        const weaviateStartTime = Date.now();
        try {
          const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);

          const packages = (issue.packages ?? []) as Array<{ name: string; version?: string }>;
          const packageNames = packages.map(p => p.name);
          const packageVersions = packages.map(p => p.version ?? '');

          const displayFields = await fetchDisplayFields(
            db,
            userId,
            organizationId,
            apiKeyId,
            agentId
          );

          await collection.data.insert({
            solutionId: created.id,
            issueId: issue_id,
            organizationId: issue.organizationId,
            title: issue.title,
            content: suggestion,
            tags: tagNames,
            voteCount: 0,
            createdAt: new Date(),
            issueCreatedAt: new Date(issue.createdAt),
            project: issue.project,
            techStack: issue.techStack ?? [],
            packageNames,
            packageVersions,
            errorType: issue.errorType,
            errorCategory: issue.errorCategory,
            severity: issue.severity,
            environment: issue.environment,
            fileTypes: issue.fileTypes ?? [],
            codePatterns: issue.codePatterns ?? [],
            affectedArea: issue.affectedArea,
            frequency: issue.frequency,
            hasMinimalRepro: issue.hasMinimalRepro,
            rootCause: issue.rootCause,
            fixType: issue.fixType,
            complexity: issue.complexity,
            relatedPatterns: issue.relatedPatterns ?? [],
            lessonsLearned: issue.lessonsLearned ?? [],
            severityOrder: severityToOrder(issue.severity),
            complexityOrder: complexityToOrder(issue.complexity),
            ...displayFields,
          });

          trackSuccess(OPERATIONS.WEAVIATE_INDEX, Date.now() - weaviateStartTime);
          logger.debug('Suggestion indexed in Weaviate', {
            solutionId: created.id,
            issueId: issue_id,
          });
        } catch (err) {
          logger.logError('Failed to index suggestion in Weaviate', err, {
            solutionId: created.id,
            issueId: issue_id,
          });
          trackError(OPERATIONS.WEAVIATE_INDEX, 'WEAVIATE_ERROR');
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('Suggestion created successfully', {
        solutionId: created.id,
        issueId: issue_id,
        userId,
        durationMs,
      });
      trackSuccess(OPERATIONS.SUGGEST_SOLUTION, durationMs);

      writeAudit(db, userId, 'solution.suggested', 'solution', created.id, {
        issueId: issue_id,
        isBot: !!apiKeyId,
        agentId: agentId ?? null,
      });

      return { solution_id: created.id };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message !== 'ISSUE_NOT_FOUND' &&
        err.message !== 'Failed to create suggestion' &&
        !err.message.includes('QUOTA_EXCEEDED')
      ) {
        logger.logError('Unexpected error in suggestion', err, { issueId: issue_id, userId });
        trackError(OPERATIONS.SUGGEST_SOLUTION, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }
}

async function fetchDisplayFields(
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
