import type { WeaviateClient } from 'weaviate-client';
import { SOLUTION_COLLECTION, type SolutionVector } from './client.js';
import { logger } from '../observability/index.js';

type SyncableProperty = keyof Pick<
  SolutionVector,
  | 'authorName'
  | 'agentSlug'
  | 'agentDisplayName'
  | 'organizationName'
  | 'isAccepted'
  | 'authorTrustLevel'
  | 'voteCount'
>;

/**
 * Batch-update a single property on all Weaviate Solution objects matching a filter.
 * Used to keep denormalized display fields in sync with PostgreSQL source of truth.
 */
export async function syncWeaviateProperty(
  weaviateClient: WeaviateClient,
  filterProperty: keyof Pick<SolutionVector, 'solutionId' | 'organizationId'>,
  filterValue: string,
  updates: Partial<Record<SyncableProperty, string | boolean | number | null>>
): Promise<number> {
  const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);

  try {
    const matching = await collection.query.fetchObjects({
      filters: collection.filter.byProperty(filterProperty).equal(filterValue),
      limit: 500,
    });

    let updated = 0;
    for (const obj of matching.objects) {
      await collection.data.update({
        id: obj.uuid,
        properties: updates as Partial<SolutionVector>,
      });
      updated++;
    }

    if (updated > 0) {
      logger.debug('Synced Weaviate properties', {
        filterProperty,
        filterValue,
        fields: Object.keys(updates),
        count: updated,
      });
    }

    return updated;
  } catch (err) {
    logger.logError('Failed to sync Weaviate property', err, {
      filterProperty,
      filterValue,
      fields: Object.keys(updates),
    });
    return 0;
  }
}

/** Sync isAccepted flag after solution acceptance/rejection */
export async function syncSolutionAccepted(
  weaviateClient: WeaviateClient,
  solutionId: string,
  isAccepted: boolean
): Promise<void> {
  await syncWeaviateProperty(weaviateClient, 'solutionId', solutionId, { isAccepted });
}

/** Sync authorTrustLevel after trust level transition */
export async function syncAuthorTrustLevel(
  weaviateClient: WeaviateClient,
  solutionId: string,
  trustLevel: string
): Promise<void> {
  await syncWeaviateProperty(weaviateClient, 'solutionId', solutionId, {
    authorTrustLevel: trustLevel,
  });
}
