import { vi } from 'vitest';
import type { ServiceDependencies } from '../services/dependencies.js';

export type MockSortChain = {
  byProperty: ReturnType<typeof vi.fn>;
  byCreationTime: ReturnType<typeof vi.fn>;
};

export type MockWeaviateCollection = {
  data: {
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  query: {
    nearText: ReturnType<typeof vi.fn>;
    hybrid: ReturnType<typeof vi.fn>;
    fetchObjects: ReturnType<typeof vi.fn>;
  };
  aggregate: {
    overAll: ReturnType<typeof vi.fn>;
  };
  metrics: {
    aggregate: ReturnType<typeof vi.fn>;
  };
  filter: {
    byProperty: ReturnType<typeof vi.fn>;
  };
  sort: MockSortChain;
  multiTargetVector: {
    manualWeights: ReturnType<typeof vi.fn>;
  };
};

export type MockWeaviateClient = {
  collections: {
    get: ReturnType<typeof vi.fn>;
  };
};

export type QueryResult = unknown[] | undefined;

export type MockDb = {
  select: ReturnType<typeof vi.fn>;
  selectDistinct: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
  finally: ReturnType<typeof vi.fn>;
};

export class MockDbBuilder {
  private chain: Record<
    string,
    ReturnType<typeof vi.fn> | ((resolve: (v: unknown) => void) => void)
  > = {};
  private results: QueryResult[] = [];
  private resultIndex = 0;

  constructor() {
    const chainMethods = [
      'select',
      'selectDistinct',
      'from',
      'where',
      'offset',
      'innerJoin',
      'leftJoin',
      'insert',
      'values',
      'update',
      'set',
      'delete',
      'orderBy',
      'groupBy',
      'onConflictDoNothing',
    ];

    for (const method of chainMethods) {
      this.chain[method] = vi.fn().mockImplementation(() => this.chain);
    }

    this.chain.limit = vi.fn().mockImplementation(() => {
      const result = this.getNextResult();
      const limitChain = { ...this.chain };
      Object.assign(limitChain, {
        then: (resolve: (value: unknown) => void) => resolve(result),
        catch: () => limitChain,
        finally: (fn: () => void) => {
          fn();
          return limitChain;
        },
        offset: vi.fn().mockImplementation(() => {
          return Promise.resolve(result);
        }),
      });
      return limitChain;
    });

    this.chain.returning = vi.fn().mockImplementation(() => {
      return Promise.resolve(this.getNextResult());
    });

    this.chain.transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      return fn(this.chain);
    });

    this.chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
      resolve(this.getNextResult());
    });
    this.chain.catch = vi.fn().mockImplementation(() => this.chain);
    this.chain.finally = vi.fn().mockImplementation((fn: () => void) => {
      fn();
      return this.chain;
    });
  }

  private getNextResult(): QueryResult {
    if (this.resultIndex < this.results.length) {
      return this.results[this.resultIndex++];
    }
    return [];
  }

  mockResult(result: QueryResult): this {
    this.results.push(result);
    return this;
  }

  build(): MockDb {
    return this.chain as MockDb;
  }
}

export function createMockDb(): MockDb {
  return new MockDbBuilder().build();
}

function createMockFilterChain(): Record<string, ReturnType<typeof vi.fn>> {
  const filterChain: Record<string, ReturnType<typeof vi.fn>> = {};
  filterChain.equal = vi.fn().mockReturnValue(filterChain);
  filterChain.containsAny = vi.fn().mockReturnValue(filterChain);
  filterChain.isNull = vi.fn().mockReturnValue(filterChain);
  filterChain.and = vi.fn().mockReturnValue(filterChain);
  filterChain.or = vi.fn().mockReturnValue(filterChain);
  return filterChain;
}

function createMockSortChain(): MockSortChain {
  const sortChain: MockSortChain = {} as MockSortChain;
  sortChain.byProperty = vi.fn().mockReturnValue(sortChain);
  sortChain.byCreationTime = vi.fn().mockReturnValue(sortChain);
  return sortChain;
}

export function createMockWeaviateCollection(): MockWeaviateCollection & {
  data: { deleteById: ReturnType<typeof vi.fn> };
} {
  const filterChain = createMockFilterChain();
  const metricsChain = { text: vi.fn().mockReturnValue({}) };
  return {
    data: {
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    },
    query: {
      nearText: vi.fn().mockResolvedValue({ objects: [] }),
      hybrid: vi.fn().mockResolvedValue({ objects: [] }),
      fetchObjects: vi.fn().mockResolvedValue({ objects: [] }),
    },
    aggregate: {
      overAll: vi.fn().mockResolvedValue({ properties: {} }),
    },
    metrics: {
      aggregate: vi.fn().mockReturnValue(metricsChain),
    },
    filter: {
      byProperty: vi.fn().mockReturnValue(filterChain),
    },
    sort: createMockSortChain(),
    multiTargetVector: {
      manualWeights: vi.fn().mockImplementation((weights: Record<string, number>) => ({
        combination: 'manual-weights',
        targetVectors: Object.keys(weights),
        weights,
      })),
    },
  };
}

export function createMockWeaviateClient(collection?: MockWeaviateCollection): MockWeaviateClient {
  const mockCollection = collection ?? createMockWeaviateCollection();
  return {
    collections: {
      get: vi.fn().mockReturnValue(mockCollection),
    },
  };
}

export function createMockDeps(
  mockDb?: MockDb,
  mockWeaviateClient?: MockWeaviateClient
): ServiceDependencies {
  return {
    db: (mockDb ?? createMockDb()) as unknown as ServiceDependencies['db'],
    weaviateClient: mockWeaviateClient as unknown as ServiceDependencies['weaviateClient'],
  };
}
