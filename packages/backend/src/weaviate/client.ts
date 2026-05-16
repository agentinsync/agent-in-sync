import weaviate, { WeaviateClient, vectorizer, configure, tokenization } from 'weaviate-client';

let weaviateClient: WeaviateClient | null = null;

export async function getWeaviateClient(): Promise<WeaviateClient> {
  if (!weaviateClient) {
    const host = process.env.WEAVIATE_URL ?? 'http://localhost:8080';
    weaviateClient = await weaviate.connectToLocal({
      host: new URL(host).hostname,
      port: Number(new URL(host).port),
    });
  }
  return weaviateClient;
}

export async function closeWeaviateClient(): Promise<void> {
  if (weaviateClient) {
    weaviateClient.close();
    weaviateClient = null;
  }
}

export const SOLUTION_COLLECTION = 'Solution';
export const ISSUE_COLLECTION = 'Issue';
export const WIKI_PAGE_COLLECTION = 'WikiPage';

const SOLUTION_SCHEMA_VERSION = 7;
const ISSUE_SCHEMA_VERSION = 1;
const WIKI_PAGE_SCHEMA_VERSION = 2;

export async function initializeWeaviateSchema(): Promise<void> {
  const client = await getWeaviateClient();

  // Initialize Solution collection
  const solutionExists = await client.collections.exists(SOLUTION_COLLECTION);

  if (solutionExists) {
    const existingCollection = client.collections.get(SOLUTION_COLLECTION);
    const config = await existingCollection.config.get();
    const versionMatch = (config.description ?? '').match(/schema v(\d+)/);
    const existingVersion = versionMatch ? parseInt(versionMatch[1] ?? '0', 10) : 0;

    if (existingVersion < SOLUTION_SCHEMA_VERSION) {
      console.log(
        `Deleting old Weaviate collection (schema v${existingVersion} → v${SOLUTION_SCHEMA_VERSION}): ${SOLUTION_COLLECTION}`
      );
      await client.collections.delete(SOLUTION_COLLECTION);
    }
  }

  const solutionStillExists = await client.collections.exists(SOLUTION_COLLECTION);

  if (!solutionStillExists) {
    await client.collections.create({
      name: SOLUTION_COLLECTION,
      description: `Code solutions for issues (schema v${SOLUTION_SCHEMA_VERSION})`,
      vectorizers: [
        vectorizer.text2VecTransformers({
          name: 'titleVec',
          sourceProperties: ['title'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
        vectorizer.text2VecTransformers({
          name: 'summaryVec',
          sourceProperties: ['content'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
      ],
      reranker: configure.reranker.transformers(),
      properties: [
        { name: 'solutionId', dataType: 'text', skipVectorization: true },
        { name: 'issueId', dataType: 'text', skipVectorization: true },
        {
          name: 'organizationId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'title', dataType: 'text', skipVectorization: true },
        { name: 'content', dataType: 'text', skipVectorization: true },
        { name: 'tags', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'voteCount', dataType: 'int', skipVectorization: true },
        { name: 'createdAt', dataType: 'date', skipVectorization: true },
        { name: 'issueCreatedAt', dataType: 'date', skipVectorization: true },

        { name: 'project', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'techStack', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        {
          name: 'packageNames',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        {
          name: 'packageVersions',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },

        { name: 'errorType', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'errorCategory',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
          tokenization: tokenization.TRIGRAM,
        },
        { name: 'severity', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'environment', dataType: 'text', skipVectorization: true, indexFilterable: true },

        { name: 'fileTypes', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        {
          name: 'codePatterns',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'affectedArea', dataType: 'text', skipVectorization: true, indexFilterable: true },

        { name: 'frequency', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'hasMinimalRepro',
          dataType: 'boolean',
          skipVectorization: true,
          indexFilterable: true,
        },

        { name: 'rootCause', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'fixType', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'complexity', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'relatedPatterns',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'lessonsLearned', dataType: 'text[]', skipVectorization: true },

        { name: 'authorName', dataType: 'text', skipVectorization: true },
        { name: 'agentSlug', dataType: 'text', skipVectorization: true },
        { name: 'agentDisplayName', dataType: 'text', skipVectorization: true },
        { name: 'organizationName', dataType: 'text', skipVectorization: true },
        { name: 'isAccepted', dataType: 'boolean', skipVectorization: true },
        { name: 'authorTrustLevel', dataType: 'text', skipVectorization: true },

        { name: 'severityOrder', dataType: 'int', skipVectorization: true, indexFilterable: true },
        {
          name: 'complexityOrder',
          dataType: 'int',
          skipVectorization: true,
          indexFilterable: true,
        },
      ],
    });
    console.log(
      `Created Weaviate collection: ${SOLUTION_COLLECTION} (v${SOLUTION_SCHEMA_VERSION})`
    );
  }

  // Initialize Issue collection for duplicate detection
  const issueExists = await client.collections.exists(ISSUE_COLLECTION);

  if (!issueExists) {
    await client.collections.create({
      name: ISSUE_COLLECTION,
      description: `Issues for duplicate detection (schema v${ISSUE_SCHEMA_VERSION})`,
      vectorizers: vectorizer.text2VecTransformers({
        vectorizeCollectionName: false,
      }),
      properties: [
        { name: 'issueId', dataType: 'text', skipVectorization: true },
        {
          name: 'organizationId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'title', dataType: 'text' },
        { name: 'description', dataType: 'text' },
        { name: 'tags', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'solutionCount', dataType: 'int', skipVectorization: true },
        { name: 'createdAt', dataType: 'date', skipVectorization: true },
        { name: 'project', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'techStack', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'errorType', dataType: 'text', skipVectorization: true, indexFilterable: true },
      ],
    });
    console.log(`Created Weaviate collection: ${ISSUE_COLLECTION} (v${ISSUE_SCHEMA_VERSION})`);
  }

  // Initialize WikiPage collection
  const wikiPageExists = await client.collections.exists(WIKI_PAGE_COLLECTION);

  if (wikiPageExists) {
    const existingCollection = client.collections.get(WIKI_PAGE_COLLECTION);
    const config = await existingCollection.config.get();
    const versionMatch = (config.description ?? '').match(/schema v(\d+)/);
    const existingVersion = versionMatch ? parseInt(versionMatch[1] ?? '0', 10) : 0;

    if (existingVersion < WIKI_PAGE_SCHEMA_VERSION) {
      console.log(
        `Deleting old Weaviate collection (schema v${existingVersion} → v${WIKI_PAGE_SCHEMA_VERSION}): ${WIKI_PAGE_COLLECTION}`
      );
      await client.collections.delete(WIKI_PAGE_COLLECTION);
    }
  }

  const wikiPageStillExists = await client.collections.exists(WIKI_PAGE_COLLECTION);

  if (!wikiPageStillExists) {
    await client.collections.create({
      name: WIKI_PAGE_COLLECTION,
      description: `Wiki knowledge pages (schema v${WIKI_PAGE_SCHEMA_VERSION})`,
      vectorizers: [
        vectorizer.text2VecTransformers({
          name: 'titleVec',
          sourceProperties: ['title'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
        vectorizer.text2VecTransformers({
          name: 'summaryVec',
          sourceProperties: ['content'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
      ],
      reranker: configure.reranker.transformers(),
      properties: [
        { name: 'wikiPageId', dataType: 'text', skipVectorization: true },
        {
          name: 'organizationId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        {
          name: 'domainId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'slug', dataType: 'text', skipVectorization: true },
        { name: 'title', dataType: 'text', skipVectorization: true },
        { name: 'content', dataType: 'text', skipVectorization: true },
        { name: 'tags', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'project', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'voteCount', dataType: 'int', skipVectorization: true },
        { name: 'editCount', dataType: 'int', skipVectorization: true },
        { name: 'version', dataType: 'int', skipVectorization: true },
        { name: 'createdByAgentSlug', dataType: 'text', skipVectorization: true },
        { name: 'lastEditedByAgentSlug', dataType: 'text', skipVectorization: true },
        { name: 'updatedAt', dataType: 'date', skipVectorization: true },
        { name: 'createdAt', dataType: 'date', skipVectorization: true },
        {
          name: 'visibility',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
      ],
    });
    console.log(
      `Created Weaviate collection: ${WIKI_PAGE_COLLECTION} (v${WIKI_PAGE_SCHEMA_VERSION})`
    );
  }
}

export type SolutionVector = {
  solutionId: string;
  issueId: string;
  organizationId: string;
  title: string;
  content: string;
  tags: string[];
  voteCount: number;
  createdAt: Date;
  issueCreatedAt: Date;

  project: string | null;
  techStack: string[];
  packageNames: string[];
  packageVersions: string[];

  errorType: string | null;
  errorCategory: string | null;
  severity: string | null;
  environment: string | null;

  fileTypes: string[];
  codePatterns: string[];
  affectedArea: string | null;

  frequency: string | null;
  hasMinimalRepro: boolean | null;

  rootCause: string | null;
  fixType: string | null;
  complexity: string | null;
  relatedPatterns: string[];
  lessonsLearned: string[];

  authorName: string;
  agentSlug: string | null;
  agentDisplayName: string | null;
  organizationName: string;
  isAccepted: boolean;
  authorTrustLevel: string;

  severityOrder: number;
  complexityOrder: number;
};

const SEVERITY_ORDER_MAP: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

const COMPLEXITY_ORDER_MAP: Record<string, number> = {
  trivial: 1,
  simple: 2,
  medium: 3,
  complex: 4,
  'very-complex': 5,
};

export function severityToOrder(severity: string | null | undefined): number {
  return severity ? (SEVERITY_ORDER_MAP[severity] ?? 5) : 5;
}

export function complexityToOrder(complexity: string | null | undefined): number {
  return complexity ? (COMPLEXITY_ORDER_MAP[complexity] ?? 6) : 6;
}

export type IssueVector = {
  issueId: string;
  organizationId: string;
  title: string;
  description: string;
  tags: string[];
  solutionCount: number;
  createdAt: Date;
  project: string | null;
  techStack: string[];
  errorType: string | null;
};
