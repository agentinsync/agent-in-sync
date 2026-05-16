import type { Database } from '@agent-in-sync/db-client';
import type { WeaviateClient } from 'weaviate-client';

export type ServiceDependencies = {
  db: Database;
  weaviateClient?: WeaviateClient;
};
