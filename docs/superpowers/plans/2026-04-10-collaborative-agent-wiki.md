# Collaborative Agent Wiki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collaborative, multi-agent wiki to AgentInSync where agents ingest sources, build interlinked knowledge pages, and maintain quality via voting and lint — all without an LLM on the backend.

**Architecture:** 7 new PostgreSQL tables + 1 new Weaviate collection (`WikiPage`). A new `WikiService` handles all wiki operations. 5 new MCP tools (`ingest_source`, `query_wiki`, `get_wiki_page`, `update_wiki_page`, `lint_wiki`) follow existing two-step search pattern. Wiki pages use optimistic locking (integer version) for safe concurrent edits. Search uses Weaviate hybrid with denormalized display fields (no PG round-trip for search results).

**Tech Stack:** Drizzle ORM, Weaviate (hybrid search, named vectors, reranker, autocut), Zod, Express 4.x, Vitest, MCP SDK

**Spec:** `design-log/051-collaborative-agent-wiki.md`

---

## Scope Note

This plan covers 3 independently-shippable phases. Each phase produces working, testable software and should be merged before starting the next:

- **Phase A (Tasks 1–5):** Schema + WikiService core (ingest, CRUD, optimistic locking) + REST routes + tests
- **Phase B (Tasks 6–8):** Weaviate collection + hybrid search + MCP tools
- **Phase C (Tasks 9–11):** Cross-references, provenance, voting, lint, SKILL.md

---

## File Map

### New files

| File                                                 | Responsibility                               |
| ---------------------------------------------------- | -------------------------------------------- |
| `packages/shared/src/schemas/wiki.ts`                | Zod schemas for all wiki operations          |
| `packages/backend/src/services/wiki.service.ts`      | WikiService: ingest, page CRUD, search, lint |
| `packages/backend/src/services/wiki.service.test.ts` | Tests for WikiService                        |
| `packages/backend/src/routes/wiki.route.ts`          | REST endpoints for wiki                      |
| `packages/backend/src/weaviate/wiki-sync.ts`         | Weaviate sync handler for wiki pages         |

### Modified files

| File                                          | Change                                   |
| --------------------------------------------- | ---------------------------------------- |
| `packages/db-client/src/schema.ts`            | Add 7 tables, 3 enums, relations         |
| `packages/shared/src/index.ts`                | Export wiki schemas                      |
| `packages/backend/src/services/index.ts`      | Export WikiService, add to Services type |
| `packages/backend/src/server.ts`              | Register wiki routes                     |
| `packages/backend/src/weaviate/client.ts`     | WikiPage collection init                 |
| `packages/backend/src/test-utils/builders.ts` | WikiPage, RawSource builders             |
| `packages/mcp-server/src/tools.ts`            | 5 new tool definitions                   |
| `packages/mcp-server/src/handlers.ts`         | 5 new handler functions                  |
| `packages/mcp-server/src/formatters.ts`       | Wiki search markdown formatter           |

---

## Phase A: Schema + Service Core + Routes

### Task 1: Database Schema — Enums and Tables

**Files:**

- Modify: `packages/db-client/src/schema.ts` (append after existing tables, ~line 955+)

- [ ] **Step 1: Add the 3 new enums**

Append after the last existing enum (`contentStatusEnum`) in `schema.ts`:

```typescript
// === Wiki enums ===

export const sourceTypeEnum = pgEnum('source_type', [
  'documentation',
  'meeting_notes',
  'slack_thread',
  'article',
  'architecture',
  'runbook',
  'other',
]);

export const sourceRefTypeEnum = pgEnum('source_ref_type', [
  'raw_source',
  'issue',
  'solution',
  'wiki_page',
]);

export const wikiOperationEnum = pgEnum('wiki_operation', [
  'ingest',
  'page_created',
  'page_updated',
  'page_linked',
  'lint_pass',
  'contradiction',
]);
```

- [ ] **Step 2: Add `raw_sources` table**

```typescript
export const rawSources = pgTable(
  'raw_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorAgentId: uuid('author_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    sourceUrl: text('source_url'),
    contentHash: text('content_hash'),
    project: varchar('project', { length: 200 }),
    techStack: text('tech_stack').array(),
    tags: text('tags').array(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('raw_sources_org_idx').on(table.organizationId),
    index('raw_sources_hash_idx').on(table.contentHash),
    index('raw_sources_type_idx').on(table.sourceType),
  ]
);
```

- [ ] **Step 3: Add `wiki_pages` table**

```typescript
export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdByAgentId: uuid('created_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    lastEditedByAgentId: uuid('last_edited_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary'),
    body: text('body').notNull(),
    version: integer('version').notNull().default(1),
    voteCount: integer('vote_count').notNull().default(0),
    editCount: integer('edit_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    status: contentStatusEnum('status').notNull().default('approved'),
    project: varchar('project', { length: 200 }),
    techStack: text('tech_stack').array(),
    lastLintedAt: timestamp('last_linted_at'),
    weaviateIndexedAt: timestamp('weaviate_indexed_at'),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_pages_org_slug_idx').on(table.organizationId, table.slug),
    index('wiki_pages_org_idx').on(table.organizationId),
    index('wiki_pages_vote_count_idx').on(table.voteCount),
    index('wiki_pages_updated_at_idx').on(table.updatedAt),
    index('wiki_pages_project_idx').on(table.project),
  ]
);
```

- [ ] **Step 4: Add `wiki_page_history`, `wiki_page_links`, `wiki_page_sources`, `wiki_log`, `wiki_page_votes` tables**

```typescript
export const wikiPageHistory = pgTable(
  'wiki_page_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    body: text('body').notNull(),
    editedByUserId: uuid('edited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    editedByAgentId: uuid('edited_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    editSummary: text('edit_summary'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('wiki_page_history_page_idx').on(table.wikiPageId),
    index('wiki_page_history_version_idx').on(table.wikiPageId, table.version),
  ]
);

export const wikiPageLinks = pgTable(
  'wiki_page_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    targetPageId: uuid('target_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    relationship: varchar('relationship', { length: 50 }).notNull().default('related'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_page_links_unique').on(table.sourcePageId, table.targetPageId),
    index('wiki_page_links_target_idx').on(table.targetPageId),
  ]
);

export const wikiPageSources = pgTable(
  'wiki_page_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    sourceType: sourceRefTypeEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_page_sources_unique').on(table.wikiPageId, table.sourceType, table.sourceId),
    index('wiki_page_sources_page_idx').on(table.wikiPageId),
    index('wiki_page_sources_source_idx').on(table.sourceType, table.sourceId),
  ]
);

export const wikiLog = pgTable(
  'wiki_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    operation: wikiOperationEnum('operation').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    summary: text('summary').notNull(),
    relatedPageIds: uuid('related_page_ids').array(),
    relatedSourceIds: uuid('related_source_ids').array(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('wiki_log_org_idx').on(table.organizationId),
    index('wiki_log_created_at_idx').on(table.createdAt),
    index('wiki_log_operation_idx').on(table.operation),
  ]
);

export const wikiPageVotes = pgTable(
  'wiki_page_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    direction: voteDirectionEnum('direction').notNull(),
    context: text('context'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [uniqueIndex('wiki_page_votes_page_user_idx').on(table.wikiPageId, table.userId)]
);
```

- [ ] **Step 5: Add relations for new tables**

```typescript
export const rawSourcesRelations = relations(rawSources, ({ one }) => ({
  organization: one(organizations, {
    fields: [rawSources.organizationId],
    references: [organizations.id],
  }),
  author: one(users, { fields: [rawSources.authorId], references: [users.id] }),
  authorAgent: one(agents, { fields: [rawSources.authorAgentId], references: [agents.id] }),
}));

export const wikiPagesRelations = relations(wikiPages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [wikiPages.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, { fields: [wikiPages.createdByUserId], references: [users.id] }),
  createdByAgent: one(agents, { fields: [wikiPages.createdByAgentId], references: [agents.id] }),
  lastEditedByAgent: one(agents, {
    fields: [wikiPages.lastEditedByAgentId],
    references: [agents.id],
  }),
  history: many(wikiPageHistory),
  outboundLinks: many(wikiPageLinks, { relationName: 'sourceLinks' }),
  inboundLinks: many(wikiPageLinks, { relationName: 'targetLinks' }),
  sources: many(wikiPageSources),
  votes: many(wikiPageVotes),
}));

export const wikiPageHistoryRelations = relations(wikiPageHistory, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageHistory.wikiPageId],
    references: [wikiPages.id],
  }),
  editedByUser: one(users, {
    fields: [wikiPageHistory.editedByUserId],
    references: [users.id],
  }),
  editedByAgent: one(agents, {
    fields: [wikiPageHistory.editedByAgentId],
    references: [agents.id],
  }),
}));

export const wikiPageLinksRelations = relations(wikiPageLinks, ({ one }) => ({
  sourcePage: one(wikiPages, {
    fields: [wikiPageLinks.sourcePageId],
    references: [wikiPages.id],
    relationName: 'sourceLinks',
  }),
  targetPage: one(wikiPages, {
    fields: [wikiPageLinks.targetPageId],
    references: [wikiPages.id],
    relationName: 'targetLinks',
  }),
}));

export const wikiPageSourcesRelations = relations(wikiPageSources, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageSources.wikiPageId],
    references: [wikiPages.id],
  }),
}));

export const wikiLogRelations = relations(wikiLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [wikiLog.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, { fields: [wikiLog.agentId], references: [agents.id] }),
}));

export const wikiPageVotesRelations = relations(wikiPageVotes, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageVotes.wikiPageId],
    references: [wikiPages.id],
  }),
  user: one(users, { fields: [wikiPageVotes.userId], references: [users.id] }),
  agent: one(agents, { fields: [wikiPageVotes.agentId], references: [agents.id] }),
}));
```

- [ ] **Step 6: Push schema to database**

Run: `pnpm --filter @agent-in-sync/db-client db:push`
Expected: Schema applied successfully, 7 new tables created

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm --filter @agent-in-sync/db-client typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```
feat: add wiki schema — 7 tables, 3 enums, relations
```

---

### Task 2: Shared Zod Schemas

**Files:**

- Create: `packages/shared/src/schemas/wiki.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create wiki Zod schemas**

Create `packages/shared/src/schemas/wiki.ts`:

```typescript
import { z } from 'zod';

// === Enums ===

export const SOURCE_TYPES = [
  'documentation',
  'meeting_notes',
  'slack_thread',
  'article',
  'architecture',
  'runbook',
  'other',
] as const;
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const SOURCE_REF_TYPES = ['raw_source', 'issue', 'solution', 'wiki_page'] as const;
export const sourceRefTypeSchema = z.enum(SOURCE_REF_TYPES);
export type SourceRefType = z.infer<typeof sourceRefTypeSchema>;

export const WIKI_OPERATIONS = [
  'ingest',
  'page_created',
  'page_updated',
  'page_linked',
  'lint_pass',
  'contradiction',
] as const;

// === Source Ref ===

export const sourceRefSchema = z.object({
  type: sourceRefTypeSchema,
  id: z.string().uuid(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

// === Ingest Source ===

export const ingestSourceInputSchema = z
  .object({
    title: z.string().min(10).max(500),
    content: z.string().min(100).max(100000),
    sourceType: sourceTypeSchema,
    sourceUrl: z.string().url().optional(),
    project: z.string().max(200).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .strict();
export type IngestSourceInput = z.infer<typeof ingestSourceInputSchema>;

export const ingestSourceResponseSchema = z.object({
  sourceId: z.string().uuid(),
  status: z.literal('ingested'),
});

// === Wiki Page ===

export const wikiPageSlugSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens');

export const upsertWikiPageInputSchema = z
  .object({
    slug: wikiPageSlugSchema,
    title: z.string().min(10).max(500),
    summary: z.string().min(20).max(500),
    body: z.string().min(100).max(100000),
    version: z.number().int().positive().optional(),
    editSummary: z.string().max(500).optional(),
    sourcedFrom: z.array(sourceRefSchema).max(50).optional(),
    linkedPages: z.array(z.string().max(200)).max(50).optional(),
    project: z.string().max(200).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .strict();
export type UpsertWikiPageInput = z.infer<typeof upsertWikiPageInputSchema>;

export const wikiPageResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string(),
  version: z.number(),
  voteCount: z.number(),
  editCount: z.number(),
  status: z.string(),
  project: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  createdByAgentSlug: z.string().nullable(),
  lastEditedByAgentSlug: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// === Wiki Search ===

export const wikiSearchInputSchema = z
  .object({
    query: z.string().min(1).max(1000),
    project: z.string().optional(),
    tags: z.array(z.string()).max(10).optional(),
    limit: z.number().int().positive().max(50).optional().default(10),
    offset: z.number().int().nonnegative().optional().default(0),
    excludePublicOrg: z.boolean().optional().default(false),
    minRelevance: z.number().min(0).max(1).optional(),
  })
  .strict();
export type WikiSearchInput = z.infer<typeof wikiSearchInputSchema>;

export const wikiSearchResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  voteCount: z.number(),
  editCount: z.number(),
  version: z.number(),
  project: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  relevance: z.number().nullable(),
  updatedAt: z.string(),
});
export type WikiSearchResult = z.infer<typeof wikiSearchResultSchema>;

export const wikiSearchResponseSchema = z.object({
  results: z.array(wikiSearchResultSchema),
  hasMore: z.boolean(),
});

// === Wiki Lint ===

export const LINT_CHECKS = ['stale', 'orphans', 'gaps', 'source_drift'] as const;

export const wikiLintInputSchema = z
  .object({
    scope: z.enum(['full', 'recent']).optional().default('full'),
    checks: z.array(z.enum(LINT_CHECKS)).optional(),
    project: z.string().optional(),
  })
  .strict();
export type WikiLintInput = z.infer<typeof wikiLintInputSchema>;
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './schemas/wiki.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @agent-in-sync/shared typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat: add Zod schemas for wiki operations
```

---

### Task 3: Test Builders for Wiki Entities

**Files:**

- Modify: `packages/backend/src/test-utils/builders.ts`

- [ ] **Step 1: Add RawSource and WikiPage builder types and classes**

Append to `builders.ts` before the export block:

```typescript
type RawSourceData = {
  id: string;
  organizationId: string;
  authorId: string;
  authorAgentId: string | null;
  title: string;
  content: string;
  sourceType: string;
  sourceUrl: string | null;
  contentHash: string | null;
  project: string | null;
  createdAt: Date;
};

type WikiPageData = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  createdByAgentId: string | null;
  lastEditedByAgentId: string | null;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  version: number;
  voteCount: number;
  editCount: number;
  viewCount: number;
  status: string;
  project: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class RawSourceBuilder {
  private data: RawSourceData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    authorAgentId: null,
    title: 'Test Source Document',
    content: 'This is a test source document with enough content to pass validation.',
    sourceType: 'documentation',
    sourceUrl: null,
    contentHash: null,
    project: null,
    createdAt: new Date(),
  };

  withOrganizationId(id: string): this {
    this.data.organizationId = id;
    return this;
  }
  withAuthorId(id: string): this {
    this.data.authorId = id;
    return this;
  }
  withTitle(title: string): this {
    this.data.title = title;
    return this;
  }
  withSourceType(type: string): this {
    this.data.sourceType = type;
    return this;
  }
  withSourceUrl(url: string): this {
    this.data.sourceUrl = url;
    return this;
  }
  withContentHash(hash: string): this {
    this.data.contentHash = hash;
    return this;
  }
  build(): RawSourceData {
    return { ...this.data };
  }
}

class WikiPageBuilder {
  private data: WikiPageData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    createdByUserId: crypto.randomUUID(),
    createdByAgentId: null,
    lastEditedByAgentId: null,
    slug: 'test-wiki-page',
    title: 'Test Wiki Page',
    summary: 'A test wiki page summary for search indexing.',
    body: '# Test Wiki Page\n\nThis is a test wiki page body with enough content to pass validation checks.',
    version: 1,
    voteCount: 0,
    editCount: 0,
    viewCount: 0,
    status: 'approved',
    project: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }
  withOrganizationId(id: string): this {
    this.data.organizationId = id;
    return this;
  }
  withCreatedByUserId(id: string): this {
    this.data.createdByUserId = id;
    return this;
  }
  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }
  withTitle(title: string): this {
    this.data.title = title;
    return this;
  }
  withSummary(summary: string): this {
    this.data.summary = summary;
    return this;
  }
  withBody(body: string): this {
    this.data.body = body;
    return this;
  }
  withVersion(v: number): this {
    this.data.version = v;
    return this;
  }
  withVoteCount(n: number): this {
    this.data.voteCount = n;
    return this;
  }
  withProject(p: string): this {
    this.data.project = p;
    return this;
  }
  build(): WikiPageData {
    return { ...this.data };
  }
}
```

- [ ] **Step 2: Export the new builders**

Add to the export section at the bottom of `builders.ts`:

```typescript
export const aRawSource = () => new RawSourceBuilder();
export const aWikiPage = () => new WikiPageBuilder();
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @agent-in-sync/backend typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat: add test builders for wiki entities
```

---

### Task 4: WikiService — Source Ingestion

**Files:**

- Create: `packages/backend/src/services/wiki.service.ts`
- Create: `packages/backend/src/services/wiki.service.test.ts`

- [ ] **Step 1: Write failing test for ingestSource**

Create `packages/backend/src/services/wiki.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WikiService } from './wiki.service.js';
import { MockDbBuilder, createMockDeps, createMockWeaviateClient } from '../test-utils/mocks.js';
import { aRawSource } from '../test-utils/builders.js';

const organizationId = crypto.randomUUID();
const userId = crypto.randomUUID();
const agentId = crypto.randomUUID();

describe('WikiService', () => {
  describe('ingestSource', () => {
    describe('Given valid source input', () => {
      it('Then inserts a raw_sources row and returns the sourceId', async () => {
        const newSource = aRawSource().withOrganizationId(organizationId).build();

        const mockDb = new MockDbBuilder()
          .mockResult([]) // duplicate check by contentHash
          .mockResult([{ id: newSource.id }]) // INSERT raw_sources
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
          { userId, organizationId, agentId }
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
            { userId, organizationId, agentId }
          )
        ).rejects.toThrow();
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: FAIL — `Cannot find module './wiki.service.js'`

- [ ] **Step 3: Implement WikiService with ingestSource**

Create `packages/backend/src/services/wiki.service.ts`:

```typescript
import { eq, and, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { rawSources, wikiLog } from '@agent-in-sync/db-client';
import type { IngestSourceInput } from '@agent-in-sync/shared';
import type { ServiceDependencies } from './dependencies.js';
import { logger } from '../observability/logger.js';

export type WikiAuthContext = {
  userId: string;
  organizationId: string;
  agentId?: string;
};

export class WikiService {
  constructor(private deps: ServiceDependencies) {}

  async ingestSource(
    input: IngestSourceInput,
    ctx: WikiAuthContext
  ): Promise<{ sourceId: string; status: 'ingested' }> {
    const { db } = this.deps;

    const contentHash = createHash('sha256')
      .update(input.title + '\n' + input.content)
      .digest('hex');

    // Duplicate check
    const [existing] = await db
      .select({ id: rawSources.id })
      .from(rawSources)
      .where(
        and(
          eq(rawSources.contentHash, contentHash),
          eq(rawSources.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (existing) {
      const err = new Error('DUPLICATE_SOURCE');
      (err as any).existingSourceId = existing.id;
      throw err;
    }

    const normalizedTags = input.tags?.map(t => t.toLowerCase().trim());

    const [inserted] = await db
      .insert(rawSources)
      .values({
        organizationId: ctx.organizationId,
        authorId: ctx.userId,
        authorAgentId: ctx.agentId ?? null,
        title: input.title,
        content: input.content,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        contentHash,
        project: input.project ?? null,
        tags: normalizedTags ?? null,
      })
      .returning({ id: rawSources.id });

    // Log the operation
    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'ingest',
      agentId: ctx.agentId ?? null,
      summary: `Ingested source: ${input.title}`,
      relatedSourceIds: [inserted!.id],
    });

    logger.info('Source ingested', { sourceId: inserted!.id, sourceType: input.sourceType });

    return { sourceId: inserted!.id, status: 'ingested' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```
feat: WikiService.ingestSource with duplicate detection
```

---

### Task 5: WikiService — Page Upsert with Optimistic Locking

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`
- Modify: `packages/backend/src/services/wiki.service.test.ts`

- [ ] **Step 1: Write failing tests for upsertPage**

Append to `wiki.service.test.ts`:

```typescript
describe('upsertPage', () => {
  describe('Given a new page (slug does not exist)', () => {
    it('Then creates the page with version 1', async () => {
      const mockDb = new MockDbBuilder()
        .mockResult([]) // SELECT existing page by slug — not found
        .mockResult([{ id: crypto.randomUUID(), version: 1 }]) // INSERT wiki_pages
        .mockResult(undefined) // INSERT wiki_log
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      const result = await service.upsertPage(
        {
          slug: 'authentication-architecture',
          title: 'Authentication Architecture',
          summary: 'How authentication works in our platform including JWT and OAuth.',
          body: '# Authentication\n\n' + 'Content '.repeat(20),
        },
        { userId, organizationId, agentId }
      );

      expect(result.version).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('Given an existing page with matching version', () => {
    it('Then updates the page and increments version', async () => {
      const existingPage = aWikiPage().withOrganizationId(organizationId).withVersion(3).build();

      const mockDb = new MockDbBuilder()
        .mockResult([existingPage]) // SELECT existing page — found
        .mockResult([{ id: existingPage.id }]) // INSERT wiki_page_history
        .mockResult([{ id: existingPage.id, version: 4 }]) // UPDATE wiki_pages WHERE version = 3
        .mockResult(undefined) // INSERT wiki_log
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      const result = await service.upsertPage(
        {
          slug: 'authentication-architecture',
          title: 'Authentication Architecture (updated)',
          summary: 'Updated authentication architecture documentation.',
          body: '# Authentication v2\n\n' + 'Updated content '.repeat(10),
          version: 3,
          editSummary: 'Added OAuth2 PKCE section',
        },
        { userId, organizationId, agentId }
      );

      expect(result.version).toBe(4);
    });
  });

  describe('Given an existing page with version mismatch', () => {
    it('Then throws a VersionConflictError', async () => {
      const existingPage = aWikiPage().withOrganizationId(organizationId).withVersion(5).build();

      const mockDb = new MockDbBuilder()
        .mockResult([existingPage]) // SELECT existing page — version is 5
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      await expect(
        service.upsertPage(
          {
            slug: 'authentication-architecture',
            title: 'Stale Update',
            summary: 'This should fail because version is stale.',
            body: '# Stale\n\n' + 'Content '.repeat(20),
            version: 3, // stale — current is 5
          },
          { userId, organizationId, agentId }
        )
      ).rejects.toThrow('VERSION_CONFLICT');
    });
  });

  describe('Given an existing page but no version provided', () => {
    it('Then throws a version required error', async () => {
      const existingPage = aWikiPage().withOrganizationId(organizationId).build();

      const mockDb = new MockDbBuilder()
        .mockResult([existingPage]) // SELECT existing page — found
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      await expect(
        service.upsertPage(
          {
            slug: 'authentication-architecture',
            title: 'Missing Version',
            summary: 'Should fail without version on update.',
            body: '# No version\n\n' + 'Content '.repeat(20),
            // version omitted
          },
          { userId, organizationId, agentId }
        )
      ).rejects.toThrow('VERSION_REQUIRED');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: FAIL — `service.upsertPage is not a function`

- [ ] **Step 3: Implement upsertPage with optimistic locking**

Add to `WikiService` in `wiki.service.ts`:

```typescript
import { wikiPages, wikiPageHistory } from '@agent-in-sync/db-client';
import type { UpsertWikiPageInput } from '@agent-in-sync/shared';

// Inside WikiService class:

  async upsertPage(
    input: UpsertWikiPageInput,
    ctx: WikiAuthContext
  ): Promise<{ id: string; version: number; status: 'created' | 'updated' }> {
    const { db } = this.deps;

    // Check if page exists
    const [existing] = await db
      .select({
        id: wikiPages.id,
        version: wikiPages.version,
        title: wikiPages.title,
        body: wikiPages.body,
      })
      .from(wikiPages)
      .where(
        and(eq(wikiPages.organizationId, ctx.organizationId), eq(wikiPages.slug, input.slug))
      )
      .limit(1);

    if (!existing) {
      // CREATE — no version needed
      const normalizedTags = input.tags?.map(t => t.toLowerCase().trim());

      const [inserted] = await db
        .insert(wikiPages)
        .values({
          organizationId: ctx.organizationId,
          createdByUserId: ctx.userId,
          createdByAgentId: ctx.agentId ?? null,
          lastEditedByAgentId: ctx.agentId ?? null,
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          body: input.body,
          version: 1,
          project: input.project ?? null,
          techStack: normalizedTags ?? null,
        })
        .returning({ id: wikiPages.id, version: wikiPages.version });

      await db.insert(wikiLog).values({
        organizationId: ctx.organizationId,
        operation: 'page_created',
        agentId: ctx.agentId ?? null,
        summary: `Created wiki page: ${input.title}`,
        relatedPageIds: [inserted!.id],
      });

      logger.info('Wiki page created', { slug: input.slug, pageId: inserted!.id });
      return { id: inserted!.id, version: 1, status: 'created' };
    }

    // UPDATE — version required for optimistic locking
    if (input.version == null) {
      throw new Error('VERSION_REQUIRED');
    }

    if (input.version !== existing.version) {
      const err = new Error('VERSION_CONFLICT');
      (err as any).currentVersion = existing.version;
      (err as any).currentBody = existing.body;
      throw err;
    }

    // Save current version to history before overwriting
    await db.insert(wikiPageHistory).values({
      wikiPageId: existing.id,
      version: existing.version,
      title: existing.title,
      body: existing.body,
      editedByUserId: ctx.userId,
      editedByAgentId: ctx.agentId ?? null,
      editSummary: input.editSummary ?? null,
    });

    const normalizedTags = input.tags?.map(t => t.toLowerCase().trim());
    const newVersion = existing.version + 1;

    const [updated] = await db
      .update(wikiPages)
      .set({
        title: input.title,
        summary: input.summary,
        body: input.body,
        version: newVersion,
        lastEditedByAgentId: ctx.agentId ?? null,
        editCount: sql`${wikiPages.editCount} + 1`,
        project: input.project ?? null,
        techStack: normalizedTags ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wikiPages.id, existing.id),
          eq(wikiPages.version, existing.version) // optimistic lock
        )
      )
      .returning({ id: wikiPages.id, version: wikiPages.version });

    if (!updated) {
      // Race condition — another update snuck in between our read and write
      throw new Error('VERSION_CONFLICT');
    }

    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'page_updated',
      agentId: ctx.agentId ?? null,
      summary: `Updated wiki page: ${input.title}${input.editSummary ? ` — ${input.editSummary}` : ''}`,
      relatedPageIds: [existing.id],
    });

    logger.info('Wiki page updated', { slug: input.slug, version: newVersion });
    return { id: existing.id, version: newVersion, status: 'updated' };
  }

  async getPage(
    organizationId: string,
    slug: string
  ): Promise<{
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    body: string;
    version: number;
    voteCount: number;
    editCount: number;
    project: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const { db } = this.deps;

    const [page] = await db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.organizationId, organizationId), eq(wikiPages.slug, slug)))
      .limit(1);

    return page ?? null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run full lint and typecheck**

Run: `pnpm --filter @agent-in-sync/backend typecheck && pnpm --filter @agent-in-sync/backend lint`
Expected: No errors

- [ ] **Step 6: Commit**

```
feat: WikiService.upsertPage with optimistic locking + getPage
```

---

### Task 6: Wiki REST Routes

**Files:**

- Create: `packages/backend/src/routes/wiki.route.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/src/services/index.ts`

- [ ] **Step 1: Create wiki route file**

Create `packages/backend/src/routes/wiki.route.ts`:

```typescript
import { Router } from 'express';
import { requireAuth, requireOrganization } from '../middleware/auth.js';
import { WikiService } from '../services/wiki.service.js';
import { createServiceDependencies } from '../services/index.js';
import { ingestSourceInputSchema, upsertWikiPageInputSchema } from '@agent-in-sync/shared';
import { logger } from '../observability/logger.js';

const router = Router();

// POST /api/v1/wiki/sources — Ingest a raw source
router.post('/sources', requireAuth, requireOrganization, async (req, res) => {
  try {
    const parseResult = ingestSourceInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    const deps = await createServiceDependencies();
    const wiki = new WikiService(deps);

    const result = await wiki.ingestSource(parseResult.data, {
      userId: req.userId!,
      organizationId: req.organizationId!,
      agentId: req.agentId,
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err.message === 'DUPLICATE_SOURCE') {
      res.status(409).json({ error: 'Duplicate source', existingSourceId: err.existingSourceId });
      return;
    }
    logger.logError('Wiki source ingest failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/wiki/pages/:slug — Create or update a wiki page
router.put('/pages/:slug', requireAuth, requireOrganization, async (req, res) => {
  try {
    const parseResult = upsertWikiPageInputSchema.safeParse({
      ...req.body,
      slug: req.params.slug,
    });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    const deps = await createServiceDependencies();
    const wiki = new WikiService(deps);

    const result = await wiki.upsertPage(parseResult.data, {
      userId: req.userId!,
      organizationId: req.organizationId!,
      agentId: req.agentId,
    });

    res.status(result.status === 'created' ? 201 : 200).json(result);
  } catch (err: any) {
    if (err.message === 'VERSION_REQUIRED') {
      res.status(400).json({ error: 'version is required when updating an existing page' });
      return;
    }
    if (err.message === 'VERSION_CONFLICT') {
      res.status(409).json({
        error: 'Version conflict — page was updated by another agent',
        currentVersion: err.currentVersion,
      });
      return;
    }
    logger.logError('Wiki page upsert failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/wiki/pages/:slug — Get full wiki page
router.get('/pages/:slug', requireAuth, requireOrganization, async (req, res) => {
  try {
    const deps = await createServiceDependencies();
    const wiki = new WikiService(deps);

    const page = await wiki.getPage(req.organizationId!, req.params.slug!);
    if (!page) {
      res.status(404).json({ error: 'Wiki page not found' });
      return;
    }

    res.json(page);
  } catch (err: any) {
    logger.logError('Wiki page get failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const wikiRouter: Router = router;
```

- [ ] **Step 2: Register wiki routes in server.ts**

Add to `packages/backend/src/server.ts` alongside the other route registrations:

```typescript
import { wikiRouter } from './routes/wiki.route.js';

// In the route registration section:
app.use('/api/v1/wiki', apiLimiter, wikiRouter);
app.use('/api/wiki', apiLimiter, wikiRouter);
```

- [ ] **Step 3: Export WikiService from services/index.ts**

Add to `packages/backend/src/services/index.ts`:

```typescript
export * from './wiki.service.js';
```

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm --filter @agent-in-sync/backend typecheck && pnpm --filter @agent-in-sync/backend lint`
Expected: No errors

- [ ] **Step 5: Run all backend tests to verify no regressions**

Run: `pnpm --filter @agent-in-sync/backend test`
Expected: All existing tests pass + wiki tests pass

- [ ] **Step 6: Commit**

```
feat: wiki REST routes — ingest source, upsert page, get page
```

---

## Phase B: Weaviate Search + MCP Tools

### Task 7: WikiPage Weaviate Collection

**Files:**

- Modify: `packages/backend/src/weaviate/client.ts`
- Create: `packages/backend/src/weaviate/wiki-sync.ts`

- [ ] **Step 1: Add WikiPage collection initialization**

Add to `packages/backend/src/weaviate/client.ts` after the Issue collection setup:

```typescript
import { configure } from 'weaviate-client';

export const WIKI_PAGE_COLLECTION = 'WikiPage';
export const WIKI_PAGE_SCHEMA_VERSION = 1;

// Inside initializeWeaviate():

// Initialize WikiPage collection
const wikiPageExists = await client.collections.exists(WIKI_PAGE_COLLECTION);

if (wikiPageExists) {
  const existingCollection = client.collections.get(WIKI_PAGE_COLLECTION);
  const config = await existingCollection.config.get();
  const existingVersion = (config.description ?? '').match(/v(\d+)/)?.[1];
  if (existingVersion !== String(WIKI_PAGE_SCHEMA_VERSION)) {
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
    description: `v${WIKI_PAGE_SCHEMA_VERSION}`,
    vectorizers: [
      vectorizer.text2VecTransformers({
        name: 'titleVec',
        sourceProperties: ['title'],
        vectorizeCollectionName: false,
        vectorIndexConfig: configure.vectorIndex.hnsw({ efConstruction: 256, maxConnections: 32 }),
      }),
      vectorizer.text2VecTransformers({
        name: 'summaryVec',
        sourceProperties: ['content'],
        vectorizeCollectionName: false,
        vectorIndexConfig: configure.vectorIndex.hnsw({ efConstruction: 256, maxConnections: 32 }),
      }),
    ],
    reranker: reranker.transformers(),
    properties: [
      { name: 'wikiPageId', dataType: 'text', skipVectorization: true },
      { name: 'organizationId', dataType: 'text', skipVectorization: true },
      { name: 'slug', dataType: 'text', skipVectorization: true },
      { name: 'title', dataType: 'text', skipVectorization: true },
      { name: 'content', dataType: 'text', skipVectorization: true },
      { name: 'tags', dataType: 'text[]', skipVectorization: true },
      { name: 'project', dataType: 'text', skipVectorization: true },
      { name: 'voteCount', dataType: 'int', skipVectorization: true },
      { name: 'editCount', dataType: 'int', skipVectorization: true },
      { name: 'version', dataType: 'int', skipVectorization: true },
      { name: 'createdByAgentSlug', dataType: 'text', skipVectorization: true },
      { name: 'lastEditedByAgentSlug', dataType: 'text', skipVectorization: true },
      { name: 'updatedAt', dataType: 'date', skipVectorization: true },
      { name: 'createdAt', dataType: 'date', skipVectorization: true },
    ],
  });
  console.log(
    `Created Weaviate collection: ${WIKI_PAGE_COLLECTION} (v${WIKI_PAGE_SCHEMA_VERSION})`
  );
}
```

- [ ] **Step 2: Create wiki-sync.ts**

Create `packages/backend/src/weaviate/wiki-sync.ts`:

```typescript
import type { WeaviateClient } from 'weaviate-client';
import { WIKI_PAGE_COLLECTION } from './client.js';
import { logger } from '../observability/logger.js';

export type WikiPageVector = {
  wikiPageId: string;
  organizationId: string;
  slug: string;
  title: string;
  content: string; // plain-text summary, NOT the markdown body
  tags: string[];
  project: string;
  voteCount: number;
  editCount: number;
  version: number;
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

    // Check if already indexed
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
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @agent-in-sync/backend typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat: WikiPage Weaviate collection + sync handler
```

---

### Task 8: WikiService — Hybrid Search

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`
- Modify: `packages/backend/src/services/wiki.service.test.ts`

- [ ] **Step 1: Write failing test for wiki search**

Append to `wiki.service.test.ts`:

```typescript
import { createMockWeaviateCollection } from '../test-utils/mocks.js';

describe('search', () => {
  describe('Given a query that matches wiki pages', () => {
    it('Then returns compact results from Weaviate with relevance scores', async () => {
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
        .mockResult([{ id: crypto.randomUUID() }]) // getAccessibleOrganizationIds
        .build();

      const mockWeaviate = createMockWeaviateClient(mockCollection);
      const service = new WikiService({ db: mockDb as any, weaviateClient: mockWeaviate as any });

      const result = await service.search(
        { query: 'how does authentication work', limit: 3, offset: 0, excludePublicOrg: false },
        organizationId
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.slug).toBe('auth-architecture');
      expect(result.results[0]!.relevance).toBeGreaterThan(0);
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

  describe('Given no Weaviate client', () => {
    it('Then returns empty results', async () => {
      const mockDb = new MockDbBuilder().mockResult([{ id: crypto.randomUUID() }]).build();

      const service = new WikiService({ db: mockDb as any, weaviateClient: undefined });

      const result = await service.search(
        { query: 'test query', limit: 3, offset: 0, excludePublicOrg: false },
        organizationId
      );

      expect(result.results).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: FAIL — `service.search is not a function`

- [ ] **Step 3: Implement wiki hybrid search**

Add to `WikiService` in `wiki.service.ts`:

```typescript
import { WIKI_PAGE_COLLECTION } from '../weaviate/client.js';
import type { WikiPageVector } from '../weaviate/wiki-sync.js';
import type { WikiSearchInput, WikiSearchResult } from '@agent-in-sync/shared';
import { organizations } from '@agent-in-sync/db-client';
import { inArray } from 'drizzle-orm';

const WIKI_HYBRID_ALPHA = 0.7;
const WIKI_MAX_VECTOR_DISTANCE = 0.8;

// Inside WikiService class:

  private publicOrgId: string | null | undefined = undefined;

  private async getPublicOrgId(): Promise<string | null> {
    if (this.publicOrgId !== undefined) return this.publicOrgId;
    const { db } = this.deps;
    const [publicOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);
    this.publicOrgId = publicOrg?.id ?? null;
    return this.publicOrgId;
  }

  async search(
    input: WikiSearchInput,
    organizationId: string
  ): Promise<{ results: WikiSearchResult[]; hasMore: boolean }> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return { results: [], hasMore: false };

    // Resolve accessible org IDs
    const orgIds = [organizationId];
    if (!input.excludePublicOrg) {
      const publicOrgId = await this.getPublicOrgId();
      if (publicOrgId && publicOrgId !== organizationId) {
        orgIds.push(publicOrgId);
      }
    }

    const limit = input.limit ?? 10;
    const fetchLimit = limit + 1;

    try {
      const collection = weaviateClient.collections.get<WikiPageVector>(WIKI_PAGE_COLLECTION);

      // Build org filter
      const orgFilter =
        orgIds.length === 1
          ? collection.filter.byProperty('organizationId').equal(orgIds[0]!)
          : collection.filter.byProperty('organizationId').containsAny(orgIds);

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
        filters: orgFilter,
        returnMetadata: ['score', 'rerankScore'],
      });

      const minScore = input.minRelevance ?? 0;

      const mapped: WikiSearchResult[] = results.objects
        .map(obj => {
          const raw = obj.metadata?.rerankScore ?? obj.metadata?.score ?? 0;
          const relevance =
            obj.metadata?.rerankScore != null ? 1 / (1 + Math.exp(-raw)) : raw;

          return {
            slug: obj.properties.slug,
            title: obj.properties.title,
            summary: obj.properties.content, // Weaviate 'content' = plain-text summary
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
      return {
        results: mapped.slice(0, limit),
        hasMore,
      };
    } catch (err) {
      logger.logError('Wiki search failed', err, { queryLength: input.query.length });
      return { results: [], hasMore: false };
    }
  }
```

- [ ] **Step 4: Wire Weaviate indexing into upsertPage**

Add at the end of `upsertPage`, after the wiki_log insert, for both CREATE and UPDATE paths:

```typescript
// Non-blocking Weaviate indexing
if (this.deps.weaviateClient) {
  indexWikiPageInWeaviate(this.deps.weaviateClient, {
    wikiPageId: /* inserted.id or existing.id */,
    organizationId: ctx.organizationId,
    slug: input.slug,
    title: input.title,
    content: input.summary, // plain-text summary → Weaviate 'content'
    tags: normalizedTags ?? [],
    project: input.project ?? '',
    voteCount: 0, // new page starts at 0; update: keep existing
    editCount: /* 0 for create, existing.editCount + 1 for update */,
    version: /* 1 for create, newVersion for update */,
    createdByAgentSlug: '', // resolve from agentId if available
    lastEditedByAgentSlug: '',
    updatedAt: new Date().toISOString(),
    createdAt: /* new Date() for create, existing.createdAt for update */,
  }).catch(() => {}); // non-blocking
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```
feat: WikiService.search — Weaviate hybrid with autocut, reranker, named vectors
```

---

### Task 9: MCP Tool Definitions + Handlers

**Files:**

- Modify: `packages/mcp-server/src/tools.ts`
- Modify: `packages/mcp-server/src/handlers.ts`
- Modify: `packages/mcp-server/src/formatters.ts`

- [ ] **Step 1: Add 5 wiki tool definitions to tools.ts**

Append to the `toolDefinitions` array in `packages/mcp-server/src/tools.ts`:

```typescript
  {
    name: 'ingest_source',
    description:
      'Ingest a document into the organization knowledge base. The source is stored ' +
      'immutably for provenance tracking. After ingesting, use query_wiki to check ' +
      'for existing related pages, then update_wiki_page to integrate the knowledge. ' +
      'PREREQUISITE: registered agent profile.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Source document title (10-500 chars)' },
        content: { type: 'string', description: 'Full document content in Markdown (100-100000 chars)' },
        source_type: {
          type: 'string',
          enum: ['documentation', 'meeting_notes', 'slack_thread', 'article', 'architecture', 'runbook', 'other'],
          description: 'Type of source document',
        },
        source_url: { type: 'string', description: 'Original URL for verification (optional)' },
        project: { type: 'string', description: 'Project this source relates to (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional, max 10)' },
      },
      required: ['title', 'content', 'source_type'],
    },
  },
  {
    name: 'query_wiki',
    description:
      'Search the organization wiki for existing knowledge pages. Returns a compact ' +
      'result list with summaries. Use get_wiki_page to read the full content of a ' +
      'promising result. Use BEFORE starting a non-trivial task.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (natural language)' },
        project: { type: 'string', description: 'Filter by project name (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' },
        limit: { type: 'number', description: 'Max results (1-10, default 3). Keep low to save context.' },
        excludePublicOrg: {
          type: 'boolean',
          description: 'If true, restricts search to your private org only.',
        },
        minRelevance: { type: 'number', description: 'Minimum relevance score (0-1).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_wiki_page',
    description:
      'Fetch full content of a wiki page by slug. Returns the complete Markdown body, ' +
      'source citations, cross-references, and edit history. Use after query_wiki.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'Wiki page slug (from query_wiki results)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'update_wiki_page',
    description:
      'Create or update a wiki page. When updating, you MUST pass the version number you read. ' +
      'If another agent updated the page since you read it, you will get a 409 Conflict — ' +
      're-read, merge your changes, and retry. PREREQUISITE: registered agent profile.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'URL-friendly page identifier' },
        version: { type: 'number', description: 'Current version number (required for updates, omit for creates)' },
        title: { type: 'string', description: 'Page title (10-500 chars)' },
        summary: { type: 'string', description: 'Plain-text summary (20-500 chars, NO Markdown)' },
        body: { type: 'string', description: 'Full page content in Markdown (100-100000 chars)' },
        edit_summary: { type: 'string', description: 'Brief description of what changed' },
        sourced_from: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['raw_source', 'issue', 'solution', 'wiki_page'] },
              id: { type: 'string' },
            },
            required: ['type', 'id'],
          },
          description: 'Sources that informed this page (provenance tracking)',
        },
        linked_pages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Slugs of related wiki pages to cross-reference',
        },
        project: { type: 'string', description: 'Project this page relates to (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional, max 10)' },
      },
      required: ['slug', 'title', 'summary', 'body'],
    },
  },
  {
    name: 'lint_wiki',
    description:
      'Health-check the organization wiki. Identifies stale pages, orphans, knowledge gaps, ' +
      'and pages whose sources have been updated. Returns actionable suggestions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scope: { type: 'string', enum: ['full', 'recent'], description: 'Audit scope (default: full)' },
        checks: {
          type: 'array',
          items: { type: 'string', enum: ['stale', 'orphans', 'gaps', 'source_drift'] },
          description: 'Which checks to run (default: all)',
        },
        project: { type: 'string', description: 'Limit lint to a specific project (optional)' },
      },
      required: [],
    },
  },
```

- [ ] **Step 2: Add wiki search markdown formatter**

Add to `packages/mcp-server/src/formatters.ts`:

```typescript
export type WikiSearchResponse = {
  results: Array<{
    slug: string;
    title: string;
    summary: string | null;
    voteCount: number;
    editCount: number;
    version: number;
    project: string | null;
    tags: string[] | null;
    relevance: number | null;
    updatedAt: string;
  }>;
  hasMore: boolean;
};

export function formatWikiSearchResultsMarkdown(response: WikiSearchResponse): string {
  const { results, hasMore } = response;

  if (results.length === 0) {
    return '## Wiki Search Results\n\nNo wiki pages found.\n';
  }

  const lines: string[] = [];
  lines.push(`## Wiki Search Results (${results.length} pages)`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    lines.push('');
    lines.push('---');
    lines.push(`### ${i + 1}. ${r.title}`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Slug | \`${r.slug}\` |`);
    lines.push(`| Votes | ${r.voteCount} |`);
    lines.push(`| Edits | ${r.editCount} |`);
    lines.push(`| Version | ${r.version} |`);
    if (r.relevance != null) lines.push(`| Relevance | ${Math.round(r.relevance * 100)}% |`);
    if (r.project) lines.push(`| Project | ${r.project} |`);
    if (r.tags?.length) lines.push(`| Tags | ${r.tags.join(', ')} |`);
    lines.push(`| Updated | ${r.updatedAt} |`);
    if (r.summary) {
      lines.push('');
      lines.push(`> ${r.summary}`);
    }
  }

  if (hasMore) {
    lines.push('');
    lines.push('_More results available. Refine your query or increase limit._');
  }

  lines.push('');
  lines.push('💡 Use `get_wiki_page` with the slug to read the full page content.');

  return lines.join('\n');
}
```

- [ ] **Step 3: Add handler functions**

Add to `packages/mcp-server/src/handlers.ts`:

```typescript
import { WikiService } from '@agent-in-sync/backend/services';
import { formatWikiSearchResultsMarkdown } from './formatters.js';
import {
  ingestSourceInputSchema,
  upsertWikiPageInputSchema,
  wikiSearchInputSchema,
  wikiLintInputSchema,
} from '@agent-in-sync/shared';

const MCP_WIKI_DEFAULT_LIMIT = 3;
const MCP_WIKI_MAX_LIMIT = 10;

async function handleIngestSource(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult('Agent profile required. Use setup_agent_identity first.');
  }

  const input = ingestSourceInputSchema.parse({
    title: args.title,
    content: args.content,
    sourceType: args.source_type,
    sourceUrl: args.source_url,
    project: args.project,
    tags: args.tags,
  });

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  const result = await wiki.ingestSource(input, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    agentId: ctx.agentId,
  });

  return textResult(result);
}

async function handleQueryWiki(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(
    Math.max(Number(args.limit ?? MCP_WIKI_DEFAULT_LIMIT), 1),
    MCP_WIKI_MAX_LIMIT
  );

  const input = wikiSearchInputSchema.parse({
    query: args.query,
    project: args.project,
    tags: args.tags,
    limit,
    offset: 0,
    excludePublicOrg: args.excludePublicOrg ?? false,
    minRelevance: args.minRelevance,
  });

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  const result = await wiki.search(input, ctx.organizationId);
  return markdownResult(formatWikiSearchResultsMarkdown(result));
}

async function handleGetWikiPage(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const slug = String(args.slug);

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  const page = await wiki.getPage(ctx.organizationId, slug);
  if (!page) {
    return errorResult(`Wiki page not found: ${slug}`);
  }

  return textResult(page);
}

async function handleUpdateWikiPage(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult('Agent profile required. Use setup_agent_identity first.');
  }

  const input = upsertWikiPageInputSchema.parse({
    slug: args.slug,
    title: args.title,
    summary: args.summary,
    body: args.body,
    version: args.version,
    editSummary: args.edit_summary,
    sourcedFrom: args.sourced_from,
    linkedPages: args.linked_pages,
    project: args.project,
    tags: args.tags,
  });

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  try {
    const result = await wiki.upsertPage(input, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      agentId: ctx.agentId,
    });
    return textResult(result);
  } catch (err: any) {
    if (err.message === 'VERSION_CONFLICT') {
      return errorResult({
        error:
          'Version conflict — page was updated by another agent. Re-read the page, merge your changes with the new content, and retry with the new version number.',
        currentVersion: err.currentVersion,
      });
    }
    if (err.message === 'VERSION_REQUIRED') {
      return errorResult('version is required when updating an existing page');
    }
    throw err;
  }
}

async function handleLintWiki(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  // Lint implementation deferred to Phase C — return placeholder
  return textResult({ message: 'Wiki lint not yet implemented' });
}
```

- [ ] **Step 4: Wire handlers into the tool dispatch**

In the `handleToolCall` switch/map in `handlers.ts`, add:

```typescript
case 'ingest_source': return handleIngestSource(args, ctx);
case 'query_wiki': return handleQueryWiki(args, ctx);
case 'get_wiki_page': return handleGetWikiPage(args, ctx);
case 'update_wiki_page': return handleUpdateWikiPage(args, ctx);
case 'lint_wiki': return handleLintWiki(args, ctx);
```

- [ ] **Step 5: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: No errors in backend, shared, or mcp-server

- [ ] **Step 6: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```
feat: MCP tools — ingest_source, query_wiki, get_wiki_page, update_wiki_page, lint_wiki
```

---

## Phase C: Cross-References, Provenance, Voting, Lint

### Task 10: Cross-References and Provenance

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`
- Modify: `packages/backend/src/services/wiki.service.test.ts`

- [ ] **Step 1: Write failing test for source refs and page links**

Append to `wiki.service.test.ts`:

```typescript
describe('addSourceRefs', () => {
  it('Then inserts source references for a wiki page', async () => {
    const pageId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();

    const mockDb = new MockDbBuilder()
      .mockResult(undefined) // INSERT wiki_page_sources (ON CONFLICT DO NOTHING)
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
      .mockResult(undefined) // INSERT wiki_page_links (ON CONFLICT DO NOTHING)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement addSourceRefs and linkPages**

Add to `WikiService`:

```typescript
import { wikiPageSources, wikiPageLinks } from '@agent-in-sync/db-client';
import type { SourceRef } from '@agent-in-sync/shared';

  async addSourceRefs(pageId: string, refs: SourceRef[]): Promise<void> {
    if (refs.length === 0) return;
    const { db } = this.deps;

    await db
      .insert(wikiPageSources)
      .values(refs.map(ref => ({
        wikiPageId: pageId,
        sourceType: ref.type,
        sourceId: ref.id,
      })))
      .onConflictDoNothing();
  }

  async linkPages(
    sourcePageId: string,
    targetPageId: string,
    relationship: string,
    ctx: { organizationId: string; agentId?: string }
  ): Promise<void> {
    const { db } = this.deps;

    await db
      .insert(wikiPageLinks)
      .values({ sourcePageId, targetPageId, relationship })
      .onConflictDoNothing();

    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'page_linked',
      agentId: ctx.agentId ?? null,
      summary: `Linked pages: ${sourcePageId} → ${targetPageId} (${relationship})`,
      relatedPageIds: [sourcePageId, targetPageId],
    });
  }
```

- [ ] **Step 4: Wire provenance into upsertPage**

In the `upsertPage` method, after creating/updating the page and before the Weaviate indexing, add:

```typescript
    // Handle source refs (provenance)
    if (input.sourcedFrom?.length) {
      await this.addSourceRefs(/* page id */, input.sourcedFrom);
    }

    // Handle cross-references
    if (input.linkedPages?.length) {
      for (const targetSlug of input.linkedPages) {
        const [targetPage] = await db
          .select({ id: wikiPages.id })
          .from(wikiPages)
          .where(
            and(eq(wikiPages.organizationId, ctx.organizationId), eq(wikiPages.slug, targetSlug))
          )
          .limit(1);
        if (targetPage) {
          await this.linkPages(/* page id */, targetPage.id, 'related', ctx);
        }
      }
    }
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
feat: wiki provenance tracking and cross-references
```

---

### Task 11: Wiki Lint

**Files:**

- Modify: `packages/backend/src/services/wiki.service.ts`
- Modify: `packages/backend/src/services/wiki.service.test.ts`
- Modify: `packages/mcp-server/src/handlers.ts` (replace placeholder)

- [ ] **Step 1: Write failing test for lint**

```typescript
describe('lint', () => {
  describe('Given stale pages exist', () => {
    it('Then returns stale pages in lint results', async () => {
      const stalePage = aWikiPage().withSlug('old-page').withTitle('Old Page').build();
      // Set updatedAt to 100 days ago
      stalePage.updatedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

      const mockDb = new MockDbBuilder()
        .mockResult([stalePage]) // SELECT stale pages
        .mockResult([]) // SELECT orphan pages
        .mockResult(undefined) // INSERT wiki_log
        .build();

      const service = new WikiService(createMockDeps(mockDb));

      const result = await service.lint(organizationId, {
        scope: 'full',
        checks: ['stale', 'orphans'],
      });

      expect(result.stale).toHaveLength(1);
      expect(result.stale![0]!.slug).toBe('old-page');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agent-in-sync/backend test -- src/services/wiki.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lint method**

Add to `WikiService`:

```typescript
import { isNull, lt, gt, count, not } from 'drizzle-orm';

  async lint(
    organizationId: string,
    options: { scope?: string; checks?: string[]; project?: string }
  ): Promise<{
    stale?: Array<{ slug: string; title: string; lastUpdated: string; daysSinceUpdate: number }>;
    orphans?: Array<{ slug: string; title: string; inboundLinks: number }>;
    summary: string;
  }> {
    const { db } = this.deps;
    const checks = options.checks ?? ['stale', 'orphans', 'gaps', 'source_drift'];
    const result: any = {};
    const summaryParts: string[] = [];

    if (checks.includes('stale')) {
      const staleThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const stalePages = await db
        .select({
          slug: wikiPages.slug,
          title: wikiPages.title,
          updatedAt: wikiPages.updatedAt,
        })
        .from(wikiPages)
        .where(
          and(
            eq(wikiPages.organizationId, organizationId),
            lt(wikiPages.updatedAt, staleThreshold)
          )
        );

      result.stale = stalePages.map(p => ({
        slug: p.slug,
        title: p.title,
        lastUpdated: p.updatedAt.toISOString(),
        daysSinceUpdate: Math.floor((Date.now() - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      }));
      summaryParts.push(`${result.stale.length} stale page(s)`);
    }

    if (checks.includes('orphans')) {
      // Pages with zero inbound links
      const allPages = await db
        .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(eq(wikiPages.organizationId, organizationId));

      const linkedTargetIds = await db
        .selectDistinct({ targetPageId: wikiPageLinks.targetPageId })
        .from(wikiPageLinks);

      const linkedSet = new Set(linkedTargetIds.map(r => r.targetPageId));
      result.orphans = allPages
        .filter(p => !linkedSet.has(p.id))
        .map(p => ({ slug: p.slug, title: p.title, inboundLinks: 0 }));

      summaryParts.push(`${result.orphans.length} orphan page(s)`);
    }

    result.summary = summaryParts.join(', ') || 'No issues found';

    // Log the lint pass
    await db.insert(wikiLog).values({
      organizationId,
      operation: 'lint_pass',
      summary: `Lint: ${result.summary}`,
    });

    return result;
  }
```

- [ ] **Step 4: Replace lint placeholder in MCP handlers**

Replace the placeholder `handleLintWiki` in `handlers.ts`:

```typescript
async function handleLintWiki(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const input = wikiLintInputSchema.parse({
    scope: args.scope,
    checks: args.checks,
    project: args.project,
  });

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  const result = await wiki.lint(ctx.organizationId, input);
  return textResult(result);
}
```

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 6: Run full lint and typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 7: Commit**

```
feat: wiki lint — stale pages, orphan detection
```

---

### Task 12: SKILL.md and RULE.md Updates

**Files:**

- Modify: `skills/agent-in-sync/SKILL.md`
- Modify: `rules/agent-in-sync-workflow/RULE.md`

- [ ] **Step 1: Add Rule 3 and Rule 4 to SKILL.md**

Append to the rules section of `skills/agent-in-sync/SKILL.md`:

```markdown
## Rule 3: SEARCH WIKI BEFORE STARTING

When starting a non-trivial task (new feature, refactor, migration, integration):

1. query_wiki({ query: "<what you're about to build>" })
2. If wiki pages exist → read them for context, follow any standards
3. If no pages exist → proceed normally

After completing the task, if you learned something that would help future agents:

4. update_wiki_page({ slug: "relevant-topic", ... })

## Rule 4: WIKI VERSION LOCK — READ BEFORE RETRY

Wiki pages use optimistic locking. When updating an existing page:

1. Read the page first (via query_wiki) — note the `version` number
2. Pass that `version` when calling update_wiki_page
3. If you get a **409 Conflict**, another agent edited the page since you read it:
   a. Re-read the page to get the latest content and new version number
   b. Merge YOUR changes with the NEW content (do not discard the other agent's edits)
   c. Retry update_wiki_page with the new version number
4. Do NOT retry blindly with the same version — it will always fail
5. Do NOT omit the version on updates — the server will reject it
```

- [ ] **Step 2: Update RULE.md to mention wiki workflow**

Append to the bottom of `rules/agent-in-sync-workflow/RULE.md`:

```markdown
## WIKI WORKFLOW

When starting a non-trivial task, also check the organization wiki:

query_wiki({ query: "<what you're about to build>" })

After solving a non-trivial problem, consider adding your learnings to the wiki:

update_wiki_page({ slug: "relevant-topic", ... })
```

- [ ] **Step 3: Commit**

```
feat: add wiki rules to SKILL.md and RULE.md
```

---

## Post-Implementation Checklist

- [ ] Run full test suite: `pnpm test`
- [ ] Run typecheck: `pnpm typecheck`
- [ ] Run lint: `pnpm lint`
- [ ] Run format check: `pnpm format:check`
- [ ] Push schema: `pnpm --filter @agent-in-sync/db-client db:push`
- [ ] Verify Weaviate collection created on dev startup
- [ ] Test MCP tools manually via Claude Code or Cursor
