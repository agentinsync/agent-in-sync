import { describe, it, expect } from 'vitest';
import { SearchService } from './search.service.js';
import {
  MockDbBuilder,
  createMockDeps,
  createMockWeaviateClient,
  createMockWeaviateCollection,
} from '../test-utils/mocks.js';
import { anOrganization, aSolution } from '../test-utils/builders.js';

function buildWeaviateObject(
  solutionId: string,
  overrides: Record<string, unknown> = {},
  meta: Record<string, unknown> = {}
) {
  return {
    properties: {
      solutionId,
      issueId: overrides.issueId ?? crypto.randomUUID(),
      organizationId: overrides.organizationId ?? crypto.randomUUID(),
      title: overrides.title ?? 'Test issue title',
      content: overrides.content ?? 'Solution content here',
      tags: overrides.tags ?? ['react'],
      voteCount: overrides.voteCount ?? 10,
      createdAt: overrides.createdAt ?? new Date(),
      project: overrides.project ?? null,
      techStack: overrides.techStack ?? [],
      packageNames: overrides.packageNames ?? [],
      packageVersions: overrides.packageVersions ?? [],
      errorType: overrides.errorType ?? null,
      errorCategory: overrides.errorCategory ?? null,
      severity: overrides.severity ?? null,
      environment: overrides.environment ?? null,
      fileTypes: overrides.fileTypes ?? [],
      codePatterns: overrides.codePatterns ?? [],
      affectedArea: overrides.affectedArea ?? null,
      frequency: overrides.frequency ?? null,
      hasMinimalRepro: overrides.hasMinimalRepro ?? null,
      rootCause: overrides.rootCause ?? null,
      fixType: overrides.fixType ?? null,
      complexity: overrides.complexity ?? null,
      relatedPatterns: overrides.relatedPatterns ?? [],
      lessonsLearned: overrides.lessonsLearned ?? [],
      authorName: overrides.authorName ?? 'Test User',
      agentSlug: overrides.agentSlug ?? null,
      agentDisplayName: overrides.agentDisplayName ?? null,
      organizationName: overrides.organizationName ?? 'Test Org',
      isAccepted: overrides.isAccepted ?? false,
      authorTrustLevel: overrides.authorTrustLevel ?? 'new',
      severityOrder: overrides.severityOrder ?? 5,
      complexityOrder: overrides.complexityOrder ?? 6,
    },
    metadata: meta,
  };
}

describe('SearchService', () => {
  const organizationId = crypto.randomUUID();
  const publicOrgId = crypto.randomUUID();

  describe('search', () => {
    describe('Given vector search type', () => {
      describe('When searching with vector type', () => {
        it('Then performs vector search via Weaviate and returns full results', async () => {
          const solution = aSolution().withVoteCount(10).build();
          const issue = { id: crypto.randomUUID(), title: 'Test issue' };

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.nearText.mockResolvedValue({
            objects: [
              buildWeaviateObject(
                solution.id,
                { issueId: issue.id, title: issue.title, voteCount: 10, tags: ['react'] },
                { distance: 0.2 }
              ),
            ],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'react performance optimization',
              search_type: 'vector',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(mockCollection.query.nearText).toHaveBeenCalledWith(
            'react performance optimization',
            expect.objectContaining({ limit: 11, offset: 0 })
          );
          expect(mockCollection.query.nearText).toHaveBeenCalledWith(
            'react performance optimization',
            expect.not.objectContaining({ autoLimit: expect.anything() })
          );
          expect(result.results).toBeDefined();
          expect(result.results.length).toBe(1);
          expect(result.results[0]!.relevance).toBe(0.8);
          expect(result.results[0]!.rank_score).toBeDefined();
          expect(result.results[0]!.solution_id).toBe(solution.id);
          expect(result.results[0]!.title).toBe(issue.title);
          expect(result.results[0]!.author_name).toBe('Test User');
        });
      });
    });

    describe('Given hybrid search type', () => {
      describe('When searching with hybrid type', () => {
        it('Then calls Weaviate hybrid() with correct params', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'database optimization',
              search_type: 'hybrid',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(mockCollection.query.hybrid).toHaveBeenCalledWith(
            'database optimization',
            expect.objectContaining({
              alpha: 0.5,
              fusionType: 'RelativeScore',
              maxVectorDistance: 0.75,
              limit: 11,
              offset: 0,
            })
          );
          expect(mockCollection.query.nearText).not.toHaveBeenCalled();
          expect(result.results).toEqual([]);
          expect(result.hasMore).toBe(false);
        });
      });

      describe('When Weaviate content contains solution text', () => {
        it('Then uses issue description text for the displayed summary', async () => {
          const issueId = crypto.randomUUID();
          const solution = aSolution().build();
          const issueDescription =
            'The React list flickers after a fast route transition because stale state is rendered before the loader resets.';

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .mockResult([{ id: issueId, description: issueDescription }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [
              buildWeaviateObject(
                solution.id,
                {
                  issueId,
                  content:
                    '```tsx\nsetItems(prev => reconcile(prev, next));\n```\nApply the patch and rerun the hydration path.',
                },
                { score: 0.9 }
              ),
            ],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'react list flickers after route transition',
              search_type: 'hybrid',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results[0]!.summary).toContain(
            'The React list flickers after a fast route transition'
          );
          expect(result.results[0]!.summary).not.toContain('Apply the patch');
          expect(result.results[0]!.summary).not.toContain('```');
        });
      });

      describe('When searching with votes sort order', () => {
        it('Then still uses Weaviate hybrid with over-fetched pool', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              query: 'test query',
              search_type: 'hybrid',
              sort_order: 'votes',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(mockCollection.query.hybrid).toHaveBeenCalledWith(
            'test query',
            expect.objectContaining({ limit: 100 })
          );
        });
      });
    });

    describe('Given no query is provided', () => {
      describe('When browsing without a text query', () => {
        it('Then uses Weaviate fetchObjects browse path', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({
            objects: [buildWeaviateObject(crypto.randomUUID(), { voteCount: 5 })],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              search_type: 'hybrid',
              sort_order: 'relevance',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(mockCollection.query.hybrid).not.toHaveBeenCalled();
          expect(mockCollection.query.fetchObjects).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 11, offset: 0 })
          );
          expect(result.results.length).toBe(1);
          expect(result.hasMore).toBe(false);
        });
      });

      describe('When browsing with votes sort order', () => {
        it('Then calls fetchObjects with sort by voteCount', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              search_type: 'hybrid',
              sort_order: 'votes',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(mockCollection.query.fetchObjects).toHaveBeenCalled();
          expect(mockCollection.sort.byProperty).toHaveBeenCalledWith('voteCount', false);
        });
      });

      describe('When browsing with recent sort order', () => {
        it('Then calls fetchObjects with sort by createdAt', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              search_type: 'hybrid',
              sort_order: 'recent',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(mockCollection.query.fetchObjects).toHaveBeenCalled();
          expect(mockCollection.sort.byProperty).toHaveBeenCalledWith('createdAt', false);
        });
      });

      describe('When browsing with filters applied', () => {
        it('Then passes filters to fetchObjects', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              search_type: 'hybrid',
              sort_order: 'relevance',
              severity: 'high',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(mockCollection.query.fetchObjects).toHaveBeenCalledWith(
            expect.objectContaining({ filters: expect.anything() })
          );
        });
      });

      describe('When browse returns more results than limit', () => {
        it('Then hasMore is true', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          const objects = Array.from({ length: 11 }, (_, i) =>
            buildWeaviateObject(crypto.randomUUID(), { voteCount: 10 - i })
          );
          mockCollection.query.fetchObjects.mockResolvedValue({ objects });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              search_type: 'hybrid',
              sort_order: 'votes',
              limit: 10,
              offset: 0,
            },
            organizationId
          );

          expect(result.hasMore).toBe(true);
          expect(result.results.length).toBe(10);
        });
      });
    });

    describe('Given hybrid search with metadata filters', () => {
      describe('When combining text query with severity filter', () => {
        it('Then passes severity filter to Weaviate directly', async () => {
          const matchingSolution = aSolution().withVoteCount(5).build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [
              buildWeaviateObject(
                matchingSolution.id,
                { voteCount: 5, severity: 'high' },
                { score: 0.9 }
              ),
            ],
          });

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'error handling',
              search_type: 'hybrid',
              severity: 'high',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results.length).toBe(1);
          expect(result.results[0]!.solution_id).toBe(matchingSolution.id);
          expect(result.results[0]!.metadata?.severity).toBe('high');
        });
      });
    });

    describe('Given empty search results', () => {
      describe('When searching returns no results', () => {
        it('Then returns empty results array with hasMore false', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.nearText.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'nonexistent topic xyz',
              search_type: 'vector',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results).toEqual([]);
          expect(result.hasMore).toBe(false);
        });
      });
    });

    describe('Given public organization exists', () => {
      describe('When searching', () => {
        it('Then includes public organization in accessible organizations', async () => {
          const publicOrg = anOrganization().asPublic().build();

          const mockDb = new MockDbBuilder().mockResult([{ id: publicOrg.id }]).build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              search_type: 'hybrid',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results).toBeDefined();
        });
      });
    });

    describe('Given vector results below relevance threshold', () => {
      describe('When vector scores are below 0.5', () => {
        it('Then filters out low-relevance results', async () => {
          const goodSolution = aSolution().build();
          const badSolution = aSolution().build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.nearText.mockResolvedValue({
            objects: [
              buildWeaviateObject(goodSolution.id, { tags: [] }, { distance: 0.2 }),
              buildWeaviateObject(badSolution.id, { tags: [] }, { distance: 0.9 }),
            ],
          });

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'test query',
              search_type: 'vector',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results.length).toBe(1);
          expect(result.results[0]!.solution_id).toBe(goodSolution.id);
          expect(result.results[0]!.relevance).toBe(0.8);
        });
      });
    });

    describe('Given hybrid search with low relevance scores', () => {
      describe('When Weaviate returns results with scores below 0.5', () => {
        it('Then does NOT filter them — autocut handles quality, not the threshold', async () => {
          const solution = aSolution().build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [buildWeaviateObject(solution.id, {}, { score: 0.3 })],
          });

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'TypeError cannot read property',
              search_type: 'hybrid',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          // Score 0.3 is below RELEVANCE_THRESHOLD (0.5) but hybrid floor is 0 — result kept
          expect(result.results.length).toBe(1);
          expect(result.results[0]!.solution_id).toBe(solution.id);
          expect(result.results[0]!.relevance).toBe(0.3);
        });
      });
    });

    describe('Given vector search with low relevance scores', () => {
      describe('When vector scores are below 0.25', () => {
        it('Then filters them out — RELEVANCE_THRESHOLD still applies to vector', async () => {
          const goodSolution = aSolution().build();
          const weakSolution = aSolution().build();

          const mockCollection = createMockWeaviateCollection();
          // distance 0.2 → score 0.8 (passes), distance 0.85 → score 0.15 (filtered)
          mockCollection.query.nearText.mockResolvedValue({
            objects: [
              buildWeaviateObject(goodSolution.id, {}, { distance: 0.2 }),
              buildWeaviateObject(weakSolution.id, {}, { distance: 0.85 }),
            ],
          });

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'TypeError cannot read property',
              search_type: 'vector',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results.length).toBe(1);
          expect(result.results[0]!.solution_id).toBe(goodSolution.id);
        });
      });
    });

    describe('Given vector search pagination', () => {
      describe('When requesting page 2 of vector results', () => {
        it('Then passes offset to nearText', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.nearText.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              query: 'pagination test',
              search_type: 'vector',
              limit: 10,
              offset: 10,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(mockCollection.query.nearText).toHaveBeenCalledWith(
            'pagination test',
            expect.objectContaining({ limit: 11, offset: 10 })
          );
        });
      });
    });

    describe('Given hybrid search BM25 boost', () => {
      describe('When performing a hybrid search', () => {
        it('Then passes queryProperties with title boosted 3x and rerank by title', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              query: 'TypeError undefined',
              search_type: 'hybrid',
              limit: 3,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(mockCollection.query.hybrid).toHaveBeenCalledWith(
            'TypeError undefined',
            expect.objectContaining({
              queryProperties: [{ name: 'title', weight: 2 }, 'content'],
              rerank: { property: 'title', query: 'TypeError undefined' },
            })
          );
        });
      });
    });

    describe('Given cross-encoder reranker returns rerankScore', () => {
      describe('When rerankScore is present in metadata', () => {
        it('Then uses rerankScore as relevance instead of fused score', async () => {
          const solution = aSolution().build();
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [buildWeaviateObject(solution.id, {}, { score: 0.3, rerankScore: 0.95 })],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            { query: 'test', search_type: 'hybrid', limit: 3, offset: 0, sort_order: 'relevance' },
            organizationId
          );

          // rerankScore is a raw logit normalized via sigmoid: sigmoid(0.95) ≈ 0.7216
          // The fused score (0.3) is used as-is when no rerankScore is present
          const expectedRelevance = 1 / (1 + Math.exp(-0.95));
          expect(result.results[0]!.relevance).toBeCloseTo(expectedRelevance, 5);
        });
      });
    });

    describe('Given hybrid search pagination', () => {
      describe('When requesting page 2 of hybrid results', () => {
        it('Then fetches from offset 0 with expanded limit and paginates in memory', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({ objects: [] });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          await service.search(
            {
              query: 'pagination test',
              search_type: 'hybrid',
              limit: 10,
              offset: 10,
              sort_order: 'relevance',
            },
            organizationId
          );

          // Must NOT pass offset to Weaviate — autocut (autoLimit) is incompatible with offset.
          // Instead, over-fetch from 0 and paginate in memory.
          expect(mockCollection.query.hybrid).toHaveBeenCalledWith(
            'pagination test',
            expect.objectContaining({ limit: 21, offset: 0 })
          );
        });
      });
    });

    describe('Given Weaviate returns display fields', () => {
      describe('When agent authored the solution', () => {
        it('Then author_name falls back to agentDisplayName', async () => {
          const solution = aSolution().build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.hybrid.mockResolvedValue({
            objects: [
              buildWeaviateObject(
                solution.id,
                {
                  authorName: 'Human User',
                  agentSlug: 'cursor-agent',
                  agentDisplayName: 'Cursor Agent',
                },
                { score: 0.9 }
              ),
            ],
          });

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.search(
            {
              query: 'test',
              search_type: 'hybrid',
              limit: 10,
              offset: 0,
              sort_order: 'relevance',
            },
            organizationId
          );

          expect(result.results[0]!.author_name).toBe('Cursor Agent');
          expect(result.results[0]!.author_agent_slug).toBe('cursor-agent');
          expect(result.results[0]!.organization_name).toBe('Test Org');
        });
      });
    });
  });

  describe('getIssueDetail', () => {
    describe('Given an issue exists', () => {
      describe('When loading issue details', () => {
        it('Then includes a summary derived from the issue description', async () => {
          const issueId = crypto.randomUUID();
          const createdAt = new Date('2026-03-24T10:00:00.000Z');
          const updatedAt = new Date('2026-03-24T11:00:00.000Z');
          const description =
            'Search results show stale snippets from solution text after the summary rollout. The issue detail page should expose a short problem summary.';

          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .mockResult([
              {
                id: issueId,
                title: 'Issue detail summary',
                description,
                authorId: crypto.randomUUID(),
                solutionCount: 0,
                acceptedSolutionId: null,
                createdAt,
                updatedAt,
                errorType: null,
                severity: null,
                environment: null,
                affectedArea: null,
                rootCause: null,
                complexity: null,
                packages: null,
                techStack: null,
                project: null,
                frequency: null,
                fixType: null,
                hasMinimalRepro: null,
                timeToResolve: null,
                originOrganizationId: null,
                authorName: 'Test User',
                agentSlug: null,
                agentDisplayName: null,
              },
            ])
            .mockResult([])
            .mockResult([])
            .build();

          const service = new SearchService(createMockDeps(mockDb));

          const result = await service.getIssueDetail(issueId, organizationId);

          expect(result?.issue.summary).toBe(
            'Search results show stale snippets from solution text after the summary rollout. The issue detail page should expose a short problem summary.'
          );
        });
      });
    });
  });

  describe('getFacets', () => {
    describe('Given Weaviate aggregate is available', () => {
      describe('When getFacets is called', () => {
        it('Then returns all facets from Weaviate aggregate', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          const facetData: Record<string, string[]> = {
            project: ['my-project', 'other-project'],
            techStack: ['react', 'typescript'],
            tags: ['bug', 'performance'],
            errorType: ['runtime-error'],
            severity: ['high', 'medium'],
            environment: ['production'],
            affectedArea: ['api'],
            frequency: ['always'],
            rootCause: ['logic-error'],
            fixType: ['code-change'],
            complexity: ['simple'],
          };

          for (const [prop, values] of Object.entries(facetData)) {
            mockCollection.aggregate.overAll.mockResolvedValueOnce({
              properties: {
                [prop]: {
                  topOccurrences: values.map(v => ({ value: v })),
                },
              },
            });
          }

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.getFacets(organizationId);

          expect(result.projects).toEqual(['my-project', 'other-project']);
          expect(result.techStack).toEqual(['react', 'typescript']);
          expect(result.tags).toEqual(['bug', 'performance']);
          expect(result.errorTypes).toEqual(['runtime-error']);
          expect(result.severities).toEqual(['high', 'medium']);
          expect(result.environments).toEqual(['production']);
          expect(result.affectedAreas).toEqual(['api']);
          expect(result.frequencies).toEqual(['always']);
          expect(result.rootCauses).toEqual(['logic-error']);
          expect(result.fixTypes).toEqual(['code-change']);
          expect(result.complexities).toEqual(['simple']);
          expect(mockCollection.aggregate.overAll).toHaveBeenCalledTimes(11);
        });
      });
    });

    describe('Given Weaviate is unavailable', () => {
      describe('When getFacets is called without Weaviate client', () => {
        it('Then falls back to PG queries', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .mockResult([{ v: 'my-project' }])
            .mockResult([{ t: 'react' }])
            .mockResult([{ name: 'bug' }])
            .mockResult([{ v: 'runtime-error' }])
            .mockResult([{ v: 'high' }])
            .mockResult([{ v: 'production' }])
            .mockResult([{ v: 'api' }])
            .mockResult([{ v: 'always' }])
            .mockResult([{ v: 'logic-error' }])
            .mockResult([{ v: 'code-change' }])
            .mockResult([{ v: 'simple' }])
            .build();

          const service = new SearchService(createMockDeps(mockDb));

          const result = await service.getFacets(organizationId);

          expect(result.projects).toEqual(['my-project']);
          expect(result.techStack).toEqual(['react']);
          expect(result.tags).toEqual(['bug']);
          expect(result.errorTypes).toEqual(['runtime-error']);
          expect(result.severities).toEqual(['high']);
        });
      });
    });

    describe('Given Weaviate aggregate fails', () => {
      describe('When aggregate throws an error', () => {
        it('Then falls back to PG queries', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }])
            .mockResult([{ v: 'fallback-project' }])
            .mockResult([{ t: 'node' }])
            .mockResult([{ name: 'error' }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .mockResult([{ v: null }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.aggregate.overAll.mockRejectedValue(new Error('Weaviate down'));

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SearchService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.getFacets(organizationId);

          expect(result.projects).toEqual(['fallback-project']);
        });
      });
    });

    describe('Given no data exists for the organization', () => {
      describe('When getFacets is called', () => {
        it('Then returns empty arrays for all fields', async () => {
          const builder = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrgId }]);
          // 11 empty results for the 11 PG facet queries
          for (let i = 0; i < 11; i++) builder.mockResult([]);
          const mockDb = builder.build();

          const service = new SearchService(createMockDeps(mockDb));

          const result = await service.getFacets(organizationId);

          expect(result.projects).toEqual([]);
          expect(result.techStack).toEqual([]);
          expect(result.tags).toEqual([]);
          expect(result.errorTypes).toEqual([]);
          expect(result.severities).toEqual([]);
          expect(result.environments).toEqual([]);
          expect(result.affectedAreas).toEqual([]);
          expect(result.frequencies).toEqual([]);
          expect(result.rootCauses).toEqual([]);
          expect(result.fixTypes).toEqual([]);
          expect(result.complexities).toEqual([]);
        });
      });
    });

    describe('Given a public organization exists', () => {
      describe('When getFacets is called', () => {
        it('Then includes public organization data in facets', async () => {
          const publicOrg = anOrganization().asPublic().build();

          const builder = new MockDbBuilder()
            .mockResult([{ settings: null }])
            .mockResult([{ id: publicOrg.id }])
            .mockResult([{ v: 'shared-project' }])
            .mockResult([{ t: 'node' }])
            .mockResult([{ name: 'shared-tag' }]);
          // 8 more empty results for the new facet fields
          for (let i = 0; i < 8; i++) builder.mockResult([]);
          const mockDb = builder.build();

          const service = new SearchService(createMockDeps(mockDb));

          const result = await service.getFacets(organizationId);

          expect(result.projects).toEqual(['shared-project']);
          expect(result.techStack).toEqual(['node']);
          expect(result.tags).toEqual(['shared-tag']);
        });
      });
    });
  });
});
