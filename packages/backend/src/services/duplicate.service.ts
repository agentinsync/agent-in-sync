import { createHash } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { issues, issueTags, tags, organizations } from '@agent-in-sync/db-client';
import { ISSUE_COLLECTION, type IssueVector } from '../weaviate/index.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';

const SIMILARITY_THRESHOLD = 0.85;
const MAX_SIMILAR_ISSUES = 5;

export type SimilarIssue = {
  id: string;
  title: string;
  solutionCount: number;
  similarity: number;
};

export type DuplicateCheckResult = {
  isDuplicate: boolean;
  exactMatch?: {
    id: string;
    title: string;
  };
  similarIssues: SimilarIssue[];
  contentHash: string;
};

export class DuplicateService {
  constructor(private deps: ServiceDependencies) {}

  generateContentHash(title: string, description: string): string {
    const normalizedContent = `${title.toLowerCase().trim()}|${description.toLowerCase().trim()}`;
    return createHash('sha256').update(normalizedContent).digest('hex');
  }

  async checkForDuplicates(
    title: string,
    description: string,
    organizationId: string
  ): Promise<DuplicateCheckResult> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const contentHash = this.generateContentHash(title, description);

      // Check for exact hash match
      const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);

      const [exactMatch] = await db
        .select({
          id: issues.id,
          title: issues.title,
        })
        .from(issues)
        .where(
          and(
            eq(issues.contentHash, contentHash),
            isNull(issues.deletedAt),
            eq(issues.organizationId, organizationId)
          )
        )
        .limit(1);

      if (exactMatch) {
        logger.info('Exact duplicate found via content hash', {
          issueId: exactMatch.id,
          organizationId,
        });
        trackSuccess(OPERATIONS.DUPLICATE_CHECK, Date.now() - startTime);

        return {
          isDuplicate: true,
          exactMatch: {
            id: exactMatch.id,
            title: exactMatch.title,
          },
          similarIssues: [],
          contentHash,
        };
      }

      // Check for semantic similarity via Weaviate
      const similarIssues = await this.findSemanticallySimilarIssues(
        title,
        description,
        accessibleOrgIds
      );

      const hasSimilar = similarIssues.some(i => i.similarity >= SIMILARITY_THRESHOLD);

      trackSuccess(OPERATIONS.DUPLICATE_CHECK, Date.now() - startTime);

      return {
        isDuplicate: hasSimilar,
        similarIssues,
        contentHash,
      };
    } catch (err) {
      logger.logError('Duplicate check failed', err, { organizationId });
      trackError(OPERATIONS.DUPLICATE_CHECK, 'CHECK_FAILED');

      // Return safe default to allow submission
      return {
        isDuplicate: false,
        similarIssues: [],
        contentHash: this.generateContentHash(title, description),
      };
    }
  }

  private async getAccessibleOrganizationIds(organizationId: string): Promise<string[]> {
    const { db } = this.deps;

    const [publicOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);

    const orgIds = [organizationId];
    if (publicOrg && publicOrg.id !== organizationId) {
      orgIds.push(publicOrg.id);
    }

    return orgIds;
  }

  private async findSemanticallySimilarIssues(
    title: string,
    description: string,
    organizationIds: string[]
  ): Promise<SimilarIssue[]> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return [];

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<IssueVector>(ISSUE_COLLECTION);

      const searchText = `${title} ${description.slice(0, 500)}`;

      const results = await collection.query.nearText(searchText, {
        limit: MAX_SIMILAR_ISSUES,
        filters: collection.filter.byProperty('organizationId').containsAny(organizationIds),
        returnMetadata: ['distance'],
      });

      trackSuccess(OPERATIONS.DUPLICATE_CHECK, Date.now() - startTime);

      return results.objects.map(obj => ({
        id: obj.properties.issueId,
        title: obj.properties.title,
        solutionCount: obj.properties.solutionCount,
        similarity: 1 - (obj.metadata?.distance ?? 1),
      }));
    } catch (err) {
      logger.logError('Semantic similarity search failed', err);
      trackError(OPERATIONS.DUPLICATE_CHECK, 'WEAVIATE_ERROR');
      return [];
    }
  }

  async indexIssue(
    issueId: string,
    organizationId: string,
    title: string,
    description: string,
    tagNames: string[],
    metadata?: {
      project?: string | null;
      techStack?: string[] | null;
      errorType?: string | null;
    }
  ): Promise<void> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return;

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<IssueVector>(ISSUE_COLLECTION);

      await collection.data.insert({
        issueId,
        organizationId,
        title,
        description: description.slice(0, 10000),
        tags: tagNames,
        solutionCount: 0,
        createdAt: new Date(),
        project: metadata?.project ?? null,
        techStack: metadata?.techStack ?? [],
        errorType: metadata?.errorType ?? null,
      });

      trackSuccess(OPERATIONS.WEAVIATE_INDEX, Date.now() - startTime);
      logger.debug('Issue indexed in Weaviate', { issueId });
    } catch (err) {
      logger.logError('Failed to index issue in Weaviate', err, { issueId });
      trackError(OPERATIONS.WEAVIATE_INDEX, 'WEAVIATE_ERROR');
    }
  }

  async deleteIssueFromIndex(issueId: string): Promise<void> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return;

    try {
      const collection = weaviateClient.collections.get<IssueVector>(ISSUE_COLLECTION);

      const results = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('issueId').equal(issueId),
        limit: 1,
      });

      const firstObj = results.objects[0];
      if (firstObj) {
        await collection.data.deleteById(firstObj.uuid);
        logger.debug('Issue deleted from Weaviate', { issueId });
      }
    } catch (err) {
      logger.logError('Failed to delete issue from Weaviate', err, { issueId });
    }
  }

  async updateIssueSolutionCount(issueId: string, solutionCount: number): Promise<void> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return;

    try {
      const collection = weaviateClient.collections.get<IssueVector>(ISSUE_COLLECTION);

      const results = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('issueId').equal(issueId),
        limit: 1,
      });

      const firstObj = results.objects[0];
      if (firstObj) {
        await collection.data.update({
          id: firstObj.uuid,
          properties: { solutionCount },
        });
      }
    } catch (err) {
      logger.logError('Failed to update issue solution count in Weaviate', err, { issueId });
    }
  }

  async getIssueTagNames(issueId: string): Promise<string[]> {
    const { db } = this.deps;

    const tagData = await db
      .select({ name: tags.name })
      .from(issueTags)
      .innerJoin(tags, eq(issueTags.tagId, tags.id))
      .where(eq(issueTags.issueId, issueId));

    return tagData.map(t => t.name);
  }
}
