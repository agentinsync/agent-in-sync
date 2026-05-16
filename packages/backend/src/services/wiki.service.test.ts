import { describe, it, expect } from 'vitest';
import { WikiService } from './wiki.service.js';
import {
  MockDbBuilder,
  createMockDeps,
  createMockWeaviateCollection,
  createMockWeaviateClient,
} from '../test-utils/mocks.js';
import { aRawSource, aWikiPage } from '../test-utils/builders.js';

const organizationId = crypto.randomUUID();
const userId = crypto.randomUUID();
const agentId = crypto.randomUUID();
const ctx = { userId, organizationId, agentId };

describe('WikiService', () => {
  describe('ingestSource', () => {
    describe('Given valid source input', () => {
      it('Then inserts a raw_sources row and returns the sourceId', async () => {
        const newSource = aRawSource().withOrganizationId(organizationId).build();

        const mockDb = new MockDbBuilder()
          .mockResult([]) // duplicate check by contentHash — none found
          .mockResult([{ id: newSource.id }]) // INSERT raw_sources RETURNING
          .mockResult(undefined) // INSERT wiki_log
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        const result = await service.ingestSource(
          {
            title: 'Express 5.x Migration Guide',
            content: 'A '.repeat(60) + 'long enough content for validation',
            sourceType: 'documentation',
            sourceUrl: 'https://expressjs.com/migration',
          },
          ctx
        );

        expect(result.sourceId).toBe(newSource.id);
        expect(result.status).toBe('ingested');
        expect(mockDb.insert).toHaveBeenCalled();
      });
    });

    describe('Given duplicate source by contentHash', () => {
      it('Then throws a duplicate error', async () => {
        const existingSource = aRawSource().build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ id: existingSource.id }]) // duplicate found
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        await expect(
          service.ingestSource(
            {
              title: 'Duplicate Source',
              content: 'A '.repeat(60) + 'duplicate content',
              sourceType: 'documentation',
            },
            ctx
          )
        ).rejects.toThrow('DUPLICATE_SOURCE');
      });
    });
  });

  describe('upsertPage', () => {
    describe('Given a new page (slug does not exist)', () => {
      it('Then creates the page with version 1', async () => {
        const pageId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no domain
          .mockResult([]) // SELECT existing page by slug — not found
          .mockResult([{ id: pageId, version: 1 }]) // INSERT wiki_pages RETURNING
          .mockResult(undefined) // INSERT wiki_log
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        const result = await service.upsertPage(
          {
            slug: 'authentication-architecture',
            title: 'Authentication Architecture',
            summary: 'How authentication works in our platform including JWT and OAuth.',
            visibility: 'domain',
            body: '# Authentication\n\n' + 'Content '.repeat(20),
          },
          ctx
        );

        expect(result.version).toBe(1);
        expect(result.status).toBe('created');
        expect(result.id).toBe(pageId);
      });
    });

    describe('Given an existing page with matching version', () => {
      it('Then updates the page and increments version', async () => {
        const existingPage = aWikiPage()
          .withOrganizationId(organizationId)
          .withVersion(3)
          .withEditCount(2)
          .build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no domain
          .mockResult([existingPage]) // SELECT existing page — found at version 3
          .mockResult([{ id: existingPage.id }]) // INSERT wiki_page_history
          .mockResult([{ id: existingPage.id, version: 4 }]) // UPDATE wiki_pages RETURNING
          .mockResult(undefined) // INSERT wiki_log
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        const result = await service.upsertPage(
          {
            slug: 'authentication-architecture',
            title: 'Authentication Architecture (updated)',
            summary: 'Updated authentication architecture documentation.',
            visibility: 'domain',
            body: '# Authentication v2\n\n' + 'Updated content '.repeat(10),
            version: 3,
            editSummary: 'Added OAuth2 PKCE section',
          },
          ctx
        );

        expect(result.version).toBe(4);
        expect(result.status).toBe('updated');
      });
    });

    describe('Given an existing page with version mismatch', () => {
      it('Then throws a VERSION_CONFLICT error', async () => {
        const existingPage = aWikiPage().withOrganizationId(organizationId).withVersion(5).build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no domain
          .mockResult([existingPage]) // SELECT existing page — version is 5
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        await expect(
          service.upsertPage(
            {
              slug: 'authentication-architecture',
              title: 'Stale Update',
              summary: 'This should fail because version is stale.',
              visibility: 'domain',
              body: '# Stale\n\n' + 'Content '.repeat(20),
              version: 3, // stale — current is 5
            },
            ctx
          )
        ).rejects.toThrow('VERSION_CONFLICT');
      });
    });

    describe('Given an existing page but no version provided', () => {
      it('Then throws a VERSION_REQUIRED error', async () => {
        const existingPage = aWikiPage().withOrganizationId(organizationId).build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no domain
          .mockResult([existingPage]) // SELECT existing page — found
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        await expect(
          service.upsertPage(
            {
              slug: 'authentication-architecture',
              title: 'Missing Version',
              summary: 'Should fail without version on update.',
              visibility: 'domain',
              body: '# No version\n\n' + 'Content '.repeat(20),
            },
            ctx
          )
        ).rejects.toThrow('VERSION_REQUIRED');
      });
    });
  });

  describe('search', () => {
    describe('Given a query that matches wiki pages in Weaviate', () => {
      it('Then returns compact results with relevance scores', async () => {
        const mockCollection = createMockWeaviateCollection();
        mockCollection.query.hybrid.mockResolvedValue({
          objects: [
            {
              properties: {
                wikiPageId: 'page-1',
                slug: 'auth-architecture',
                title: 'Authentication Architecture',
                content: 'How authentication works in our platform.',
                voteCount: 8,
                editCount: 3,
                version: 4,
                project: 'backend',
                tags: ['auth', 'jwt'],
                updatedAt: '2026-04-01T00:00:00Z',
              },
              metadata: { rerankScore: 2.5 },
            },
          ],
        });

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no verified domain
          .build();

        const mockWeaviate = createMockWeaviateClient(mockCollection);
        const service = new WikiService(createMockDeps(mockDb, mockWeaviate));

        const result = await service.search(
          { query: 'how does authentication work', limit: 3, offset: 0, scope: 'all' },
          ctx
        );

        expect(result.results).toHaveLength(1);
        expect(result.results[0]!.slug).toBe('auth-architecture');
        expect(result.results[0]!.relevance).toBeGreaterThan(0);
        expect(result.hasMore).toBe(false);
        expect(mockCollection.query.hybrid).toHaveBeenCalledWith(
          'how does authentication work',
          expect.objectContaining({
            alpha: expect.any(Number),
            fusionType: 'RelativeScore',
            autoLimit: 1,
          })
        );
      });
    });

    describe('Given scope is org_only', () => {
      it('Then does not resolve public org ID', async () => {
        const mockCollection = createMockWeaviateCollection();
        mockCollection.query.hybrid.mockResolvedValue({ objects: [] });

        // No mockResult for getPublicOrgId — should not be called
        const mockDb = new MockDbBuilder().build();

        const mockWeaviate = createMockWeaviateClient(mockCollection);
        const service = new WikiService(createMockDeps(mockDb, mockWeaviate));

        const result = await service.search(
          { query: 'internal topic', limit: 3, offset: 0, scope: 'org_only' },
          ctx
        );

        expect(result.results).toEqual([]);
        expect(mockCollection.query.hybrid).toHaveBeenCalled();
      });
    });

    describe('Given no Weaviate client', () => {
      it('Then returns empty results', async () => {
        const mockDb = new MockDbBuilder().build();
        const service = new WikiService(createMockDeps(mockDb));

        const result = await service.search(
          { query: 'test query', limit: 3, offset: 0, scope: 'all' },
          ctx
        );

        expect(result.results).toEqual([]);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('Given minRelevance filters out low-scoring results', () => {
      it('Then returns only results above the threshold', async () => {
        const mockCollection = createMockWeaviateCollection();
        mockCollection.query.hybrid.mockResolvedValue({
          objects: [
            {
              properties: {
                slug: 'high-score',
                title: 'High Score Page',
                content: 'Very relevant content.',
                voteCount: 5,
                editCount: 1,
                version: 1,
                tags: [],
                updatedAt: '2026-04-01T00:00:00Z',
              },
              metadata: { score: 0.9 },
            },
            {
              properties: {
                slug: 'low-score',
                title: 'Low Score Page',
                content: 'Barely relevant.',
                voteCount: 0,
                editCount: 0,
                version: 1,
                tags: [],
                updatedAt: '2026-04-01T00:00:00Z',
              },
              metadata: { score: 0.2 },
            },
          ],
        });

        const mockDb = new MockDbBuilder()
          .mockResult([{ domainId: null, status: null }]) // getVerifiedDomainId — no verified domain
          .build();

        const mockWeaviate = createMockWeaviateClient(mockCollection);
        const service = new WikiService(createMockDeps(mockDb, mockWeaviate));

        const result = await service.search(
          {
            query: 'test',
            limit: 10,
            offset: 0,
            scope: 'all',
            minRelevance: 0.5,
          },
          ctx
        );

        expect(result.results).toHaveLength(1);
        expect(result.results[0]!.slug).toBe('high-score');
      });
    });
  });

  describe('addSourceRefs', () => {
    it('Then inserts source references for a wiki page', async () => {
      const pageId = crypto.randomUUID();
      const sourceId = crypto.randomUUID();

      const mockDb = new MockDbBuilder()
        .mockResult(undefined) // INSERT wiki_page_sources ON CONFLICT DO NOTHING
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      await service.addSourceRefs(pageId, [{ type: 'raw_source', id: sourceId }]);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('linkPages', () => {
    it('Then inserts a link between two pages', async () => {
      const sourcePageId = crypto.randomUUID();
      const targetPageId = crypto.randomUUID();

      const mockDb = new MockDbBuilder()
        .mockResult(undefined) // INSERT wiki_page_links ON CONFLICT DO NOTHING
        .mockResult(undefined) // INSERT wiki_log
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      await service.linkPages(sourcePageId, targetPageId, 'related', {
        organizationId,
        agentId,
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('lint', () => {
    describe('Given stale pages exist', () => {
      it('Then returns stale pages in lint results', async () => {
        const stalePage = aWikiPage().withSlug('old-page').withTitle('Old Page').build();
        stalePage.updatedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

        const mockDb = new MockDbBuilder()
          .mockResult([stalePage]) // SELECT stale pages
          .mockResult([]) // SELECT all pages for orphans
          .mockResult([]) // SELECT linked target IDs for orphans
          .mockResult(undefined) // INSERT wiki_log
          .build();

        const service = new WikiService(createMockDeps(mockDb));

        const result = await service.lint(organizationId, {
          scope: 'full',
          checks: ['stale', 'orphans'],
        });

        expect(result.stale).toHaveLength(1);
        expect(result.stale![0]!.slug).toBe('old-page');
        expect(result.orphans).toHaveLength(0);
      });
    });
  });
});
