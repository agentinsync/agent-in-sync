# Cross-Org Wiki Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `visibility` field (`private | domain | public`, default `domain`) to wiki pages so agents from sibling organizations on the same verified company domain can read and edit each other's wikis.

**Architecture:** Wiki pages get a `visibility` column in PostgreSQL and two new fields (`visibility`, `domainId`) in the Weaviate `WikiPage` collection. The `WikiService` resolves the accessible org scope at search/edit time by looking up the requesting org's verified domain. The `super-admin` router gets a new endpoint to manually verify domains. MCP tools are updated to expose `visibility` as an optional parameter.

**Tech Stack:** Drizzle ORM (schema + migration), Weaviate v4 SDK (collection properties + filter), Express (new route), Zod (shared schemas), Vitest + supertest (tests).

---

## File Map

| File                                                    | Action             | What changes                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db-client/src/schema.ts`                      | Modify             | Add `wikiVisibilityEnum`, `visibility` column on `wiki_pages`, add `'super_admin'` to `verificationMethodEnum`                                                                               |
| `packages/db-client/drizzle/`                           | Create (generated) | Migration SQL + journal update                                                                                                                                                               |
| `packages/shared/src/schemas/wiki.ts`                   | Modify             | Add `WIKI_VISIBILITY_VALUES`, `wikiVisibilitySchema`, `visibility` to upsert/response/search schemas                                                                                         |
| `packages/backend/src/services/wiki.service.ts`         | Modify             | Add `getVerifiedDomainId()`, `isSameVerifiedDomain()`, `checkEditPermission()`, `checkVisibilityChangePermission()`. Update `search()`, `upsertPage()`, `getPage()`, `_syncPageToWeaviate()` |
| `packages/backend/src/services/domain.service.ts`       | Modify             | Add `verifyByAdmin(domainId)` method                                                                                                                                                         |
| `packages/backend/src/routes/super-admin.route.ts`      | Modify             | Add `POST /domains/:domainId/verify` endpoint                                                                                                                                                |
| `packages/backend/src/weaviate/wiki-sync.ts`            | Modify             | Add `visibility` and `domainId` to `WikiPageVector` type                                                                                                                                     |
| `packages/backend/src/weaviate/client.ts`               | Modify             | Add `visibility` + `domainId` properties to `WikiPage` collection, bump `WIKI_PAGE_SCHEMA_VERSION` to `2`                                                                                    |
| `packages/mcp-server/src/tools.ts`                      | Modify             | Add `visibility` param to `update_wiki_page`, remove `excludePublicOrg` from `query_wiki`                                                                                                    |
| `packages/mcp-server/src/handlers.ts`                   | Modify             | Pass `visibility` through from MCP to REST, remove `excludePublicOrg`                                                                                                                        |
| `packages/backend/src/routes/wiki.route.ts`             | Modify             | Accept `visibility` in body; pass to service                                                                                                                                                 |
| `packages/backend/src/services/wiki.service.test.ts`    | Modify/Create      | Tests for visibility-scoped search, edit permissions, visibility change restriction                                                                                                          |
| `packages/backend/src/routes/super-admin.route.test.ts` | Modify/Create      | Test for domain verify endpoint                                                                                                                                                              |

---

## Task 1: Schema — add `visibility` to `wiki_pages` and `super_admin` to verification method

**Files:**

- Modify: `packages/db-client/src/schema.ts`
- Create: `packages/db-client/drizzle/` (generated migration — do NOT hand-write)

- [ ] **Step 1: Add `wikiVisibilityEnum` and `visibility` column**

  In `packages/db-client/src/schema.ts`, find `wikiPages` table definition. Add the new enum just before it (group enums together where they already live) and add the column:

  ```typescript
  // Add near other pgEnum declarations (e.g., near contentStatusEnum)
  export const wikiVisibilityEnum = pgEnum('wiki_visibility', ['private', 'domain', 'public']);
  ```

  In the `wikiPages` table columns (after `status`):

  ```typescript
  visibility: wikiVisibilityEnum('visibility').notNull().default('domain'),
  ```

- [ ] **Step 2: Add `super_admin` to `verificationMethodEnum`**

  Find the existing enum (currently `['social_proof', 'dns_txt', 'sso']`) and change it to:

  ```typescript
  export const verificationMethodEnum = pgEnum('verification_method', [
    'social_proof',
    'dns_txt',
    'sso',
    'super_admin',
  ]);
  ```

- [ ] **Step 3: Generate migration**

  ```bash
  pnpm --filter @agent-in-sync/db-client db:generate
  ```

  Expected: new `.sql` file in `packages/db-client/drizzle/` and updated `drizzle/meta/_journal.json`.

- [ ] **Step 4: Verify migration content**

  Open the generated SQL file. It must contain:
  - `CREATE TYPE "public"."wiki_visibility" AS ENUM('private', 'domain', 'public');`
  - `ALTER TABLE "wiki_pages" ADD COLUMN "visibility" "wiki_visibility" DEFAULT 'domain' NOT NULL;`
  - The `verification_method` enum ALTER (Drizzle handles enum extension).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/db-client/src/schema.ts packages/db-client/drizzle/
  git commit -m "feat: add wiki_visibility enum + column, super_admin verification method"
  ```

---

## Task 2: Shared Zod schemas — add `visibility`

**Files:**

- Modify: `packages/shared/src/schemas/wiki.ts`

- [ ] **Step 1: Write the failing test**

  In `packages/shared/src/schemas/wiki.test.ts` (create if missing):

  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    upsertWikiPageInputSchema,
    wikiPageResponseSchema,
    wikiSearchInputSchema,
  } from './wiki.js';

  describe('wiki visibility schemas', () => {
    it('accepts valid visibility values in upsert', () => {
      const base = {
        slug: 'test-page',
        title: 'Test Page Title Here',
        summary: 'A plain text summary for search indexing.',
        body: 'A'.repeat(100),
      };
      expect(upsertWikiPageInputSchema.parse({ ...base, visibility: 'private' }).visibility).toBe(
        'private'
      );
      expect(upsertWikiPageInputSchema.parse({ ...base, visibility: 'domain' }).visibility).toBe(
        'domain'
      );
      expect(upsertWikiPageInputSchema.parse({ ...base, visibility: 'public' }).visibility).toBe(
        'public'
      );
    });

    it('defaults visibility to domain when omitted in upsert', () => {
      const result = upsertWikiPageInputSchema.parse({
        slug: 'test-page',
        title: 'Test Page Title Here',
        summary: 'A plain text summary for search indexing.',
        body: 'A'.repeat(100),
      });
      expect(result.visibility).toBe('domain');
    });

    it('rejects invalid visibility values', () => {
      expect(() =>
        upsertWikiPageInputSchema.parse({
          slug: 'test-page',
          title: 'Test Page Title Here',
          summary: 'A plain text summary for search indexing.',
          body: 'A'.repeat(100),
          visibility: 'internal',
        })
      ).toThrow();
    });

    it('includes visibility in wiki page response', () => {
      const result = wikiPageResponseSchema.parse({
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'test-page',
        title: 'Test',
        summary: null,
        body: 'body',
        version: 1,
        voteCount: 0,
        editCount: 0,
        status: 'approved',
        visibility: 'domain',
        project: null,
        tags: null,
        createdByAgentSlug: null,
        lastEditedByAgentSlug: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(result.visibility).toBe('domain');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm --filter @agent-in-sync/shared test -- src/schemas/wiki.test.ts
  ```

  Expected: FAIL — `visibility` field not defined.

- [ ] **Step 3: Add visibility to shared schemas**

  In `packages/shared/src/schemas/wiki.ts`:

  At the top of the file, after existing `SOURCE_TYPES` constant:

  ```typescript
  export const WIKI_VISIBILITY_VALUES = ['private', 'domain', 'public'] as const;
  export const wikiVisibilitySchema = z.enum(WIKI_VISIBILITY_VALUES);
  export type WikiVisibility = z.infer<typeof wikiVisibilitySchema>;
  ```

  In `upsertWikiPageInputSchema`, add inside `.object({...})` before `.strict()`:

  ```typescript
  visibility: wikiVisibilitySchema.optional().default('domain'),
  ```

  In `wikiPageResponseSchema`, add:

  ```typescript
  visibility: wikiVisibilitySchema,
  ```

  In `wikiSearchInputSchema`, replace `excludePublicOrg` with `scope`:

  ```typescript
  // Remove: excludePublicOrg: z.boolean().optional().default(false),
  // Add:
  scope: z.enum(['org_only', 'all']).optional().default('all'),
  ```

  Update `WikiSearchInput` type (auto-derived from schema via `z.infer`).

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @agent-in-sync/shared test -- src/schemas/wiki.test.ts
  ```

  Expected: PASS (all 4 tests).

- [ ] **Step 5: Run full shared test suite**

  ```bash
  pnpm --filter @agent-in-sync/shared test
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/shared/src/schemas/wiki.ts packages/shared/src/schemas/wiki.test.ts
  git commit -m "feat: add visibility to wiki shared schemas, replace excludePublicOrg with scope"
  ```

---

## Task 3: Weaviate — add `visibility` and `domainId` fields, bump schema version

**Files:**

- Modify: `packages/backend/src/weaviate/wiki-sync.ts`
- Modify: `packages/backend/src/weaviate/client.ts`

- [ ] **Step 1: Update `WikiPageVector` type**

  In `packages/backend/src/weaviate/wiki-sync.ts`, add two fields to the `WikiPageVector` type:

  ```typescript
  export type WikiPageVector = {
    wikiPageId: string;
    organizationId: string;
    domainId: string | null; // ← add
    slug: string;
    title: string;
    content: string;
    tags: string[];
    project: string;
    voteCount: number;
    editCount: number;
    version: number;
    visibility: 'private' | 'domain' | 'public'; // ← add
    createdByAgentSlug: string;
    lastEditedByAgentSlug: string;
    updatedAt: string;
    createdAt: string;
  };
  ```

- [ ] **Step 2: Add new properties to WikiPage collection + bump version**

  In `packages/backend/src/weaviate/client.ts`:

  Change:

  ```typescript
  const WIKI_PAGE_SCHEMA_VERSION = 1;
  ```

  To:

  ```typescript
  const WIKI_PAGE_SCHEMA_VERSION = 2;
  ```

  In the `WikiPage` collection `properties` array (after the `'organizationId'` property), add:

  ```typescript
  {
    name: 'domainId',
    dataType: 'text' as const,
    skipVectorization: true,
    indexFilterable: true,
  },
  ```

  And after the `'createdAt'` property (at the end of the array), add:

  ```typescript
  {
    name: 'visibility',
    dataType: 'text' as const,
    skipVectorization: true,
    indexFilterable: true,
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  pnpm --filter @agent-in-sync/backend typecheck
  ```

  Expected: PASS. (If `indexWikiPageInWeaviate` callers now fail because they're missing `visibility`/`domainId`, that will be fixed in Task 4.)

- [ ] **Step 4: Commit**

  ```bash
  git add packages/backend/src/weaviate/wiki-sync.ts packages/backend/src/weaviate/client.ts
  git commit -m "feat: add visibility + domainId to WikiPage Weaviate collection (schema v2)"
  ```

---

## Task 4: WikiService — domain helpers and permission checks

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`

This task adds the private helper methods used by subsequent tasks. No existing public methods are changed yet.

- [ ] **Step 1: Write failing tests for the helpers**

  In `packages/backend/src/services/wiki.service.test.ts` (add to existing file or create):

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { WikiService } from './wiki.service.js';

  // Minimal mock dependencies
  const makeService = (
    orgDomainId: string | null,
    domainStatus: 'pending' | 'verified' = 'verified'
  ) => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ domainId: orgDomainId, status: domainStatus }]),
          }),
        }),
      }),
    } as any;
    return new WikiService({ db, weaviateClient: null });
  };

  describe('WikiService permission helpers', () => {
    it('getVerifiedDomainId returns domainId when domain is verified', async () => {
      const service = makeService('domain-abc', 'verified');
      // Access private method for testing
      const result = await (service as any).getVerifiedDomainId('org-123');
      expect(result).toBe('domain-abc');
    });

    it('getVerifiedDomainId returns null when domain is pending', async () => {
      const service = makeService('domain-abc', 'pending');
      const result = await (service as any).getVerifiedDomainId('org-123');
      expect(result).toBeNull();
    });

    it('getVerifiedDomainId returns null when org has no domain', async () => {
      const service = makeService(null, 'verified');
      const result = await (service as any).getVerifiedDomainId('org-123');
      expect(result).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: FAIL — `getVerifiedDomainId` not defined.

- [ ] **Step 3: Add helper methods to WikiService**

  In `packages/backend/src/services/wiki.service.ts`, add these private methods at the bottom of the class (before the closing `}`), following the existing helper pattern of `getPublicOrgId`:

  ```typescript
  // Returns the verified domainId for an org, or null if the org has no verified domain.
  private async getVerifiedDomainId(orgId: string): Promise<string | null> {
    const { db } = this.deps;
    const [row] = await db
      .select({ domainId: organizations.domainId, status: domains.status })
      .from(organizations)
      .leftJoin(domains, eq(organizations.domainId, domains.id))
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!row?.domainId || row.status !== 'verified') return null;
    return row.domainId;
  }

  private async isSameVerifiedDomain(ownerOrgId: string, requesterOrgId: string): Promise<boolean> {
    if (ownerOrgId === requesterOrgId) return true;
    const ownerDomainId = await this.getVerifiedDomainId(ownerOrgId);
    if (!ownerDomainId) return false;
    const requesterDomainId = await this.getVerifiedDomainId(requesterOrgId);
    return ownerDomainId === requesterDomainId;
  }

  private async checkEditPermission(
    page: { organizationId: string; visibility: string },
    ctx: WikiAuthContext
  ): Promise<void> {
    if (page.organizationId === ctx.organizationId) return;
    if (page.visibility === 'public') return;
    if (page.visibility === 'domain') {
      const sameDomain = await this.isSameVerifiedDomain(page.organizationId, ctx.organizationId);
      if (sameDomain) return;
    }
    const err = new Error('EDIT_FORBIDDEN');
    throw err;
  }

  private checkVisibilityChangePermission(
    page: { organizationId: string },
    ctx: WikiAuthContext
  ): void {
    if (page.organizationId !== ctx.organizationId) {
      throw new Error('VISIBILITY_CHANGE_FORBIDDEN');
    }
  }
  ```

  Also add the required imports at the top of the file (if not already imported):

  ```typescript
  import { organizations, domains } from '@agent-in-sync/db-client';
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Typecheck**

  ```bash
  pnpm --filter @agent-in-sync/backend typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/services/wiki.service.ts packages/backend/src/services/wiki.service.test.ts
  git commit -m "feat: add domain lookup + edit permission helpers to WikiService"
  ```

---

## Task 5: WikiService — visibility-scoped search

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`

- [ ] **Step 1: Write failing tests**

  Add to `packages/backend/src/services/wiki.service.test.ts`:

  ```typescript
  describe('WikiService search scope', () => {
    it('includes domain-visible peer org pages when domain is verified', async () => {
      // This test verifies the Weaviate filter construction.
      // We'll use a spy on the internal Weaviate call.
      const hybridSpy = vi.fn().mockResolvedValue({ objects: [] });
      const filterSpy = {
        byProperty: vi.fn().mockReturnValue({
          equal: vi.fn().mockReturnValue('mock-filter'),
          containsAny: vi.fn().mockReturnValue('mock-filter'),
        }),
      };
      const collectionMock = {
        query: { hybrid: hybridSpy },
        filter: filterSpy,
        multiTargetVector: { manualWeights: vi.fn().mockReturnValue('weights') },
      };
      const weaviateClient = {
        collections: { get: vi.fn().mockReturnValue(collectionMock) },
      } as any;

      // getVerifiedDomainId will be called — mock organizations + domains DB
      const db = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ domainId: 'domain-xyz', status: 'verified' }]),
            }),
          }),
        }),
      } as any;

      const service = new WikiService({ db, weaviateClient });
      await service.search(
        { query: 'auth', limit: 5, offset: 0, scope: 'all' },
        { userId: 'u1', organizationId: 'org-a', agentId: undefined }
      );

      // Hybrid must have been called (Weaviate search happened)
      expect(hybridSpy).toHaveBeenCalled();
      // The filter passed must include the domain filter, not just org filter
      const callArgs = hybridSpy.mock.calls[0]?.[1];
      expect(callArgs?.filters).toBeDefined();
    });

    it('excludes domain pages when scope is org_only', async () => {
      const hybridSpy = vi.fn().mockResolvedValue({ objects: [] });
      const filterEqualSpy = vi.fn().mockReturnValue('org-filter');
      const collectionMock = {
        query: { hybrid: hybridSpy },
        filter: { byProperty: vi.fn().mockReturnValue({ equal: filterEqualSpy }) },
        multiTargetVector: { manualWeights: vi.fn().mockReturnValue('weights') },
      };
      const weaviateClient = {
        collections: { get: vi.fn().mockReturnValue(collectionMock) },
      } as any;
      const db = { select: vi.fn() } as any;

      const service = new WikiService({ db, weaviateClient });
      await service.search(
        { query: 'auth', scope: 'org_only' },
        { userId: 'u1', organizationId: 'org-a', agentId: undefined }
      );

      expect(hybridSpy).toHaveBeenCalled();
      // When scope is org_only, only the org filter should be used
      const callArgs = hybridSpy.mock.calls[0]?.[1];
      expect(callArgs?.filters).toBe('org-filter');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: FAIL — `search()` signature mismatch, `scope` not handled.

- [ ] **Step 3: Update `search()` in WikiService**

  Replace the current `search(input: WikiSearchInput, organizationId: string)` method signature and body:

  ```typescript
  async search(
    input: WikiSearchInput,
    ctx: WikiAuthContext
  ): Promise<{ results: WikiSearchResult[]; hasMore: boolean }> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return { results: [], hasMore: false };

    const organizationId = ctx.organizationId;
    const limit = input.limit ?? 10;
    const fetchLimit = limit + 1;

    try {
      const collection = weaviateClient.collections.get<WikiPageVector>(WIKI_PAGE_COLLECTION);

      let searchFilter: FilterValue;

      if (input.scope === 'org_only') {
        searchFilter = collection.filter.byProperty('organizationId').equal(organizationId);
      } else {
        const verifiedDomainId = await this.getVerifiedDomainId(organizationId);

        const ownOrgFilter = collection.filter.byProperty('organizationId').equal(organizationId);
        const publicFilter = collection.filter.byProperty('visibility').equal('public');

        if (verifiedDomainId) {
          const domainFilter = Filters.and(
            collection.filter.byProperty('visibility').equal('domain'),
            collection.filter.byProperty('domainId').equal(verifiedDomainId)
          );
          searchFilter = Filters.or(ownOrgFilter, domainFilter, publicFilter);
        } else {
          searchFilter = Filters.or(ownOrgFilter, publicFilter);
        }
      }

      const results = await collection.query.hybrid(input.query, {
        alpha: WIKI_HYBRID_ALPHA,
        fusionType: 'RelativeScore',
        autoLimit: 1,
        maxVectorDistance: WIKI_MAX_VECTOR_DISTANCE,
        queryProperties: [{ name: 'title', weight: 2 }, 'content'],
        targetVector: collection.multiTargetVector.manualWeights({
          titleVec: 0.4,
          summaryVec: 0.6,
        }),
        rerank: { property: 'title', query: input.query },
        limit: fetchLimit,
        offset: input.offset ?? 0,
        filters: searchFilter,
        returnMetadata: ['score', 'rerankScore'],
      });

      const minScore = input.minRelevance ?? 0;

      const mapped: WikiSearchResult[] = results.objects
        .map(obj => {
          const raw = obj.metadata?.rerankScore ?? obj.metadata?.score ?? 0;
          const relevance = obj.metadata?.rerankScore != null ? 1 / (1 + Math.exp(-raw)) : raw;
          return {
            slug: obj.properties.slug,
            title: obj.properties.title,
            summary: obj.properties.content ?? null,
            voteCount: obj.properties.voteCount ?? 0,
            editCount: obj.properties.editCount ?? 0,
            version: obj.properties.version ?? 1,
            project: obj.properties.project ?? null,
            tags: obj.properties.tags ?? null,
            relevance,
            updatedAt: obj.properties.updatedAt ?? '',
          };
        })
        .filter(r => r.relevance >= minScore);

      const hasMore = mapped.length > limit;

      logger.info('Wiki search completed', {
        query: input.query,
        resultCount: Math.min(mapped.length, limit),
        hasMore,
        scope: input.scope ?? 'all',
      });

      return { results: mapped.slice(0, limit), hasMore };
    } catch (err) {
      logger.logError('Wiki search failed', err, { query: input.query });
      return { results: [], hasMore: false };
    }
  }
  ```

  Add the import at the top of the file:

  ```typescript
  import { Filters, type FilterValue } from 'weaviate-client';
  ```

  Update callers of `search()` in `wiki.route.ts` to pass `ctx` instead of `organizationId` — that is handled in Task 8.

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/backend/src/services/wiki.service.ts packages/backend/src/services/wiki.service.test.ts
  git commit -m "feat: visibility-scoped wiki search (domain-aware Weaviate filter)"
  ```

---

## Task 6: WikiService — cross-org `upsertPage` lookup and permission

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`

- [ ] **Step 1: Write failing tests**

  Add to `packages/backend/src/services/wiki.service.test.ts`:

  ```typescript
  describe('WikiService upsertPage cross-org', () => {
    it('throws EDIT_FORBIDDEN when editing domain-visible page from different domain', async () => {
      // ownerOrg is on domain-A; requesterOrg is on domain-B
      const db = {
        select: vi
          .fn()
          // First call: look up page across accessible scope — returns page from org-A with visibility: 'domain'
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: 'page-1',
                      organizationId: 'org-a',
                      version: 1,
                      title: 'Test',
                      summary: 'summary',
                      body: 'body',
                      visibility: 'domain',
                      techStack: [],
                      editCount: 0,
                      voteCount: 0,
                      createdAt: new Date(),
                    },
                  ]),
                }),
              }),
            }),
          })
          // Second call: getVerifiedDomainId for org-a → domain-A
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ domainId: 'domain-A', status: 'verified' }]),
              }),
            }),
          })
          // Third call: getVerifiedDomainId for requester org-b → domain-B
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ domainId: 'domain-B', status: 'verified' }]),
              }),
            }),
          }),
      } as any;

      const service = new WikiService({ db, weaviateClient: null });
      await expect(
        service.upsertPage(
          {
            slug: 'test-page',
            title: 'Test Page Title',
            summary: 'Summary text here please',
            body: 'A'.repeat(100),
            version: 1,
          },
          { userId: 'u2', organizationId: 'org-b', agentId: undefined }
        )
      ).rejects.toThrow('EDIT_FORBIDDEN');
    });

    it('throws VISIBILITY_CHANGE_FORBIDDEN when non-owner tries to change visibility', async () => {
      const db = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: 'page-1',
                      organizationId: 'org-a',
                      version: 1,
                      title: 'Test',
                      summary: null,
                      body: 'body',
                      visibility: 'domain',
                      techStack: [],
                      editCount: 0,
                      voteCount: 0,
                      createdAt: new Date(),
                    },
                  ]),
                }),
              }),
            }),
          })
          // Same domain verification (domain-A for both orgs)
          .mockReturnValue({
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ domainId: 'domain-A', status: 'verified' }]),
              }),
            }),
          }),
      } as any;

      const service = new WikiService({ db, weaviateClient: null });
      await expect(
        service.upsertPage(
          {
            slug: 'test-page',
            title: 'Test Page Title',
            summary: 'Summary text here please',
            body: 'A'.repeat(100),
            version: 1,
            visibility: 'private',
          },
          { userId: 'u2', organizationId: 'org-b', agentId: undefined }
        )
      ).rejects.toThrow('VISIBILITY_CHANGE_FORBIDDEN');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Update `upsertPage` — cross-org lookup + permission checks**

  Replace the existing page lookup at the start of `upsertPage()` (the `const [existing] = await db.select(...)` block) with a cross-org aware version:

  ```typescript
  async upsertPage(
    input: UpsertWikiPageInput,
    ctx: WikiAuthContext
  ): Promise<{ id: string; version: number; status: 'created' | 'updated' }> {
    const { db } = this.deps;

    const verifiedDomainId = await this.getVerifiedDomainId(ctx.organizationId);

    // Look up page by slug across accessible scope. Own org takes priority.
    const [existing] = await db
      .select({
        id: wikiPages.id,
        organizationId: wikiPages.organizationId,
        version: wikiPages.version,
        title: wikiPages.title,
        summary: wikiPages.summary,
        body: wikiPages.body,
        visibility: wikiPages.visibility,
        techStack: wikiPages.techStack,
        editCount: wikiPages.editCount,
        voteCount: wikiPages.voteCount,
        createdAt: wikiPages.createdAt,
      })
      .from(wikiPages)
      .leftJoin(organizations, eq(wikiPages.organizationId, organizations.id))
      .where(
        and(
          eq(wikiPages.slug, input.slug),
          or(
            eq(wikiPages.organizationId, ctx.organizationId),
            verifiedDomainId
              ? and(
                  eq(wikiPages.visibility, 'domain'),
                  eq(organizations.domainId, verifiedDomainId)
                )
              : sql`false`,
            eq(wikiPages.visibility, 'public')
          )
        )
      )
      .orderBy(sql`(${wikiPages.organizationId} = ${ctx.organizationId}) DESC`)
      .limit(1);
  ```

  After retrieving `existing`, add permission checks before the update path:

  ```typescript
  if (existing) {
    // Check edit permission for cross-org pages
    await this.checkEditPermission(existing, ctx);

    // Check visibility change permission (only owner org can change visibility)
    if (input.visibility !== undefined && input.visibility !== existing.visibility) {
      this.checkVisibilityChangePermission(existing, ctx);
    }
  }
  ```

  In the INSERT path (creating new page), add `visibility` to the inserted values:

  ```typescript
  visibility: input.visibility ?? 'domain',
  ```

  In the UPDATE path, add `visibility` to the SET clause (only if owner):

  ```typescript
  // In the .set({ ... }) object, add:
  ...(input.visibility !== undefined && existing!.organizationId === ctx.organizationId
    ? { visibility: input.visibility }
    : {}),
  ```

  Add `sql` to the imports from `drizzle-orm`:

  ```typescript
  import { and, eq, or, sql, lt, desc } from 'drizzle-orm';
  ```

- [ ] **Step 4: Update `_syncPageToWeaviate` to pass `visibility` and `domainId`**

  Find the private `_syncPageToWeaviate` method in wiki.service.ts. Update it to accept and pass `visibility` and `domainId`:

  ```typescript
  private async _syncPageToWeaviate(
    page: {
      id: string;
      slug: string;
      title: string;
      body: string;
      project: string | null;
      tags: string[] | null;
      voteCount: number;
      editCount: number;
      version: number;
      visibility: string;        // ← add
      domainId: string | null;   // ← add
      createdAt: Date;
      updatedAt: Date;
    },
    ctx: WikiAuthContext
  ): Promise<void> {
  ```

  Inside the method where `indexWikiPageInWeaviate` is called, add the new fields:

  ```typescript
  visibility: page.visibility as 'private' | 'domain' | 'public',
  domainId: page.domainId ?? null,
  ```

  Update the two call sites where `_syncPageToWeaviate` is called (in the INSERT and UPDATE paths) to pass `visibility` and `domainId`:

  ```typescript
  visibility: input.visibility ?? 'domain',
  domainId: verifiedDomainId,  // already fetched above
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Typecheck**

  ```bash
  pnpm --filter @agent-in-sync/backend typecheck
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/backend/src/services/wiki.service.ts packages/backend/src/services/wiki.service.test.ts
  git commit -m "feat: cross-org upsertPage lookup, edit/visibility-change permission guards"
  ```

---

## Task 7: DomainService — `verifyByAdmin` method

**Files:**

- Modify: `packages/backend/src/services/domain.service.ts`

- [ ] **Step 1: Write failing test**

  In `packages/backend/src/services/domain.service.test.ts` (add to existing or create):

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { DomainService } from './domain.service.js';

  describe('DomainService.verifyByAdmin', () => {
    it('sets status to verified with super_admin method', async () => {
      const updateSpy = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: 'domain-1', status: 'verified', verificationMethod: 'super_admin' },
            ]),
        }),
      });
      const db = { update: updateSpy } as any;
      const service = new DomainService({ db });

      await service.verifyByAdmin('domain-1');

      expect(updateSpy).toHaveBeenCalled();
      const setCall = updateSpy.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'verified',
          verificationMethod: 'super_admin',
        })
      );
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/domain.service.test.ts
  ```

  Expected: FAIL — `verifyByAdmin` not defined.

- [ ] **Step 3: Add `verifyByAdmin` to DomainService**

  In `packages/backend/src/services/domain.service.ts`, add after the existing `verifyDomain()` method:

  ```typescript
  async verifyByAdmin(domainId: string): Promise<void> {
    const { db } = this.deps;
    await db
      .update(domains)
      .set({
        status: 'verified',
        verificationMethod: 'super_admin',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/services/domain.service.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/backend/src/services/domain.service.ts packages/backend/src/services/domain.service.test.ts
  git commit -m "feat: add verifyByAdmin to DomainService (super_admin verification method)"
  ```

---

## Task 8: Super admin route — domain verify endpoint + wiki route fixes

**Files:**

- Modify: `packages/backend/src/routes/super-admin.route.ts`
- Modify: `packages/backend/src/routes/wiki.route.ts`

- [ ] **Step 1: Write failing test for the super-admin endpoint**

  In `packages/backend/src/routes/super-admin.route.test.ts` (add to existing or create):

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import request from 'supertest';
  import express from 'express';
  import { createSuperAdminRouter } from './super-admin.route.js';

  describe('POST /domains/:domainId/verify', () => {
    it('calls verifyByAdmin and returns 200', async () => {
      const verifyByAdminSpy = vi.fn().mockResolvedValue(undefined);
      const findByIdSpy = vi
        .fn()
        .mockResolvedValue({ id: 'domain-1', name: 'acme.com', status: 'pending' });

      const app = express();
      app.use(express.json());
      // Bypass auth middleware for test
      app.use((req, _res, next) => {
        (req as any).isSuperAdmin = true;
        next();
      });
      app.use(
        '/super-admin',
        createSuperAdminRouter({
          domainService: { verifyByAdmin: verifyByAdminSpy, findById: findByIdSpy } as any,
          // other services as needed — pass minimal mocks
        } as any)
      );

      const res = await request(app).post('/super-admin/domains/domain-1/verify').send();

      expect(res.status).toBe(200);
      expect(verifyByAdminSpy).toHaveBeenCalledWith('domain-1');
      expect(res.body).toMatchObject({
        domainId: 'domain-1',
        status: 'verified',
        verificationMethod: 'super_admin',
      });
    });

    it('returns 404 when domain not found', async () => {
      const findByIdSpy = vi.fn().mockResolvedValue(null);
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).isSuperAdmin = true;
        next();
      });
      app.use(
        '/super-admin',
        createSuperAdminRouter({
          domainService: { findById: findByIdSpy, verifyByAdmin: vi.fn() } as any,
        } as any)
      );

      const res = await request(app).post('/super-admin/domains/nonexistent/verify').send();
      expect(res.status).toBe(404);
    });
  });
  ```

  > **Note:** Adjust the router factory name (`createSuperAdminRouter`) to match whatever function the route file exports. If it's not a factory, adapt the test to mount the router directly.

- [ ] **Step 2: Run test to confirm failure**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/routes/super-admin.route.test.ts
  ```

  Expected: FAIL — endpoint not found.

- [ ] **Step 3: Add the endpoint to super-admin route**

  In `packages/backend/src/routes/super-admin.route.ts`, add after the existing domain endpoints (near `GET /domains` and `PATCH /domains/:domainId`):

  ```typescript
  // POST /domains/:domainId/verify — super admin manual domain verification
  router.post('/domains/:domainId/verify', async (req, res) => {
    const { domainId } = req.params;

    const domain = await domainService.findById(domainId);
    if (!domain) {
      return res.status(404).json({ error: 'DOMAIN_NOT_FOUND' });
    }

    await domainService.verifyByAdmin(domainId);

    return res.json({
      domainId,
      status: 'verified',
      verificationMethod: 'super_admin',
    });
  });
  ```

- [ ] **Step 4: Fix `wiki.route.ts` — pass ctx to search, accept visibility**

  In `packages/backend/src/routes/wiki.route.ts`:

  Find the `POST /search` handler. Change:

  ```typescript
  const result = await wikiService.search(parsed, req.organizationId);
  ```

  To:

  ```typescript
  const result = await wikiService.search(parsed, {
    userId: req.userId,
    organizationId: req.organizationId,
    agentId: req.agentId,
  });
  ```

  Find the `PUT /pages/:slug` and `POST /pages` handlers. Make sure `visibility` from the request body is passed through to `wikiService.upsertPage(input, ctx)`. Since `input` is parsed from the body via `upsertWikiPageInputSchema` and `visibility` is now in that schema, no change needed if the schema parse covers it. Verify the body parse includes `visibility`:

  ```typescript
  const parsed = upsertWikiPageInputSchema.parse(req.body); // now includes visibility
  ```

  Also update the `GET /pages/:slug` response to include `visibility` in the returned object:

  ```typescript
  // In the response mapping for getPage(), add:
  visibility: page.visibility,
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm --filter @agent-in-sync/backend test -- src/routes/super-admin.route.test.ts
  pnpm --filter @agent-in-sync/backend test -- src/routes/wiki.route.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Full backend test suite**

  ```bash
  pnpm --filter @agent-in-sync/backend test
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/backend/src/routes/super-admin.route.ts packages/backend/src/routes/wiki.route.ts packages/backend/src/routes/super-admin.route.test.ts
  git commit -m "feat: super admin domain verify endpoint, wire visibility through wiki route"
  ```

---

## Task 9: MCP tools — `visibility` in `update_wiki_page`, remove `excludePublicOrg` from `query_wiki`

**Files:**

- Modify: `packages/mcp-server/src/tools.ts`
- Modify: `packages/mcp-server/src/handlers.ts`

- [ ] **Step 1: Update `update_wiki_page` tool schema**

  In `packages/mcp-server/src/tools.ts`, find the `update_wiki_page` tool definition. Add `visibility` to its `inputSchema.properties`:

  ```typescript
  visibility: {
    type: 'string',
    enum: ['private', 'domain', 'public'],
    description:
      'Visibility scope for this page. Only the page\'s owning org can change this. ' +
      'private = your org only. domain = all orgs on the same verified company domain (default). ' +
      'public = any agent with a valid API key.',
  },
  ```

  (`visibility` should NOT be in `required` — it is optional.)

- [ ] **Step 2: Update `query_wiki` tool schema**

  In the `query_wiki` tool definition, remove the `excludePublicOrg` property entirely from `inputSchema.properties` (and from `required` if it was there). Update the tool `description` to note automatic scoping:

  ```typescript
  description:
    'Search the organization wiki for existing knowledge pages. Automatically searches your org, ' +
    'all domain-visible pages from sibling orgs on your verified domain, and all public pages. ' +
    'Returns compact results. Use get_wiki_page for full content.',
  ```

- [ ] **Step 3: Update `handlers.ts`**

  In `packages/mcp-server/src/handlers.ts`, find the handler for `update_wiki_page`. Pass `visibility` through to the REST body:

  ```typescript
  body: {
    ...existingBody,
    ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
  },
  ```

  Find the handler for `query_wiki`. Remove the `excludePublicOrg` field from the body sent to the backend. If `scope` needs to be passed (from any existing `excludePublicOrg` logic), map it:

  ```typescript
  // Remove: excludePublicOrg: args.excludePublicOrg,
  // No replacement needed — default 'all' scope is the new default
  ```

- [ ] **Step 4: Typecheck MCP server**

  ```bash
  pnpm --filter @agent-in-sync/mcp-server typecheck
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/mcp-server/src/tools.ts packages/mcp-server/src/handlers.ts
  git commit -m "feat: add visibility to update_wiki_page MCP tool, remove excludePublicOrg from query_wiki"
  ```

---

## Task 10: Final verification

- [ ] **Step 1: Full typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: PASS across all packages.

- [ ] **Step 2: Full test suite**

  ```bash
  pnpm test
  ```

  Expected: PASS.

- [ ] **Step 3: Lint**

  ```bash
  pnpm lint
  ```

  Expected: PASS. Fix any issues with `pnpm lint:fix`.

- [ ] **Step 4: Manual smoke test**

  Start the stack:

  ```bash
  docker-compose up -d postgres weaviate t2v-transformers reranker-transformers
  pnpm --filter @agent-in-sync/db-client db:push
  pnpm --filter @agent-in-sync/backend dev
  ```

  Verify:
  1. Creating a wiki page omitting `visibility` → response includes `"visibility": "domain"`
  2. Creating a wiki page with `"visibility": "private"` → response includes `"visibility": "private"`
  3. `POST /api/v1/super-admin/domains/:domainId/verify` returns `200` with `verificationMethod: "super_admin"`
  4. `POST /api/v1/wiki/search` with `{ "query": "test" }` — no errors, returns results from accessible scope

- [ ] **Step 5: Final commit if any cleanup**

  ```bash
  git add -p
  git commit -m "chore: final cleanup for cross-org wiki visibility"
  ```

---

## Self-Review Checklist

**Spec coverage:**

- [x] `visibility` enum (`private | domain | public`) on `wiki_pages` — Task 1
- [x] Default: `domain` — Task 1 (schema default) + Task 2 (Zod default)
- [x] Edit permissions follow visibility scope — Task 6 (`checkEditPermission`)
- [x] Only owner org can change `visibility` — Task 6 (`checkVisibilityChangePermission`)
- [x] Search scope: own + domain-visible + public — Task 5
- [x] `super_admin` verification method — Task 1 (schema) + Task 7 (service) + Task 8 (route)
- [x] `domainId` in Weaviate for efficient domain filtering — Task 3
- [x] MCP `update_wiki_page` exposes `visibility` — Task 9
- [x] MCP `query_wiki` removes `excludePublicOrg` — Task 9
- [x] Optimistic locking still works cross-org — existing `version` mechanism, no changes needed

**Type consistency:**

- `WikiPageVector.visibility` — defined in Task 3, used in Task 6 (`_syncPageToWeaviate`)
- `WikiPageVector.domainId` — defined in Task 3, used in Task 6
- `WikiAuthContext` — no new fields added; `domainId` is looked up internally via `getVerifiedDomainId()`
- `WikiSearchInput.scope` — defined in Task 2, consumed in Task 5 (`search()`)
- `UpsertWikiPageInput.visibility` — defined in Task 2, consumed in Task 6 (`upsertPage()`)
