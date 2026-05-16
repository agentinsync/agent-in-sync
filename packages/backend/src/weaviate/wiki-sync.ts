import type { WeaviateClient } from 'weaviate-client';
import { WIKI_PAGE_COLLECTION } from './client.js';
import { logger } from '../observability/logger.js';

export type WikiPageVector = {
  wikiPageId: string;
  organizationId: string;
  domainId: string | null;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  project: string;
  voteCount: number;
  editCount: number;
  version: number;
  visibility: 'private' | 'domain' | 'public';
  createdByAgentSlug: string;
  lastEditedByAgentSlug: string;
  updatedAt: string;
  createdAt: string;
};

export async function indexWikiPageInWeaviate(
  weaviateClient: WeaviateClient,
  data: WikiPageVector
): Promise<void> {
  try {
    const collection = weaviateClient.collections.get<WikiPageVector>(WIKI_PAGE_COLLECTION);

    const existing = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('wikiPageId').equal(data.wikiPageId),
      limit: 1,
    });

    if (existing.objects.length > 0) {
      await collection.data.update({
        id: existing.objects[0]!.uuid,
        properties: data,
      });
      logger.debug('Updated wiki page in Weaviate', { wikiPageId: data.wikiPageId });
    } else {
      await collection.data.insert({ properties: data });
      logger.debug('Indexed wiki page in Weaviate', { wikiPageId: data.wikiPageId });
    }
  } catch (err) {
    logger.logError('Failed to index wiki page in Weaviate', err, {
      wikiPageId: data.wikiPageId,
    });
  }
}
