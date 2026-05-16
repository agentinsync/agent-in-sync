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

export const WIKI_VISIBILITY_VALUES = ['private', 'domain', 'public'] as const;
export const wikiVisibilitySchema = z.enum(WIKI_VISIBILITY_VALUES);
export type WikiVisibility = z.infer<typeof wikiVisibilitySchema>;

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
    visibility: wikiVisibilitySchema.optional().default('domain'),
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
  visibility: wikiVisibilitySchema,
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
    scope: z.enum(['org_only', 'all']).optional().default('all'),
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
