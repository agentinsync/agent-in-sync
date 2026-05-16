import { z } from 'zod';
import {
  issueSchema,
  errorTypeSchema,
  severitySchema,
  environmentSchema,
  rootCauseSchema,
  fixTypeSchema,
  complexitySchema,
  affectedAreaSchema,
  frequencySchema,
} from './issue.js';

export const searchTypeSchema = z.enum(['vector', 'hybrid']);
export const sortOrderSchema = z.enum(['relevance', 'votes', 'recent', 'complexity', 'severity']);

export type SearchType = z.infer<typeof searchTypeSchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const packageFilterSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  versionMatch: z.enum(['exact', 'major', 'semver']).default('major'),
});

export type PackageFilter = z.infer<typeof packageFilterSchema>;

export const searchInputSchema = z
  .object({
    query: z.string().min(1).max(1000).optional(),

    project: z.string().optional(),
    techStack: z.array(z.string()).optional(),
    packages: z.array(packageFilterSchema).optional(),

    errorType: errorTypeSchema.optional(),
    errorCategory: z.string().optional(),
    severity: severitySchema.optional(),
    minSeverity: severitySchema.optional(),
    environment: environmentSchema.optional(),

    fileTypes: z.array(z.string()).optional(),
    codePatterns: z.array(z.string()).optional(),
    affectedArea: affectedAreaSchema.optional(),

    frequency: frequencySchema.optional(),
    hasMinimalRepro: z.boolean().optional(),

    rootCause: rootCauseSchema.optional(),
    fixType: fixTypeSchema.optional(),
    maxComplexity: complexitySchema.optional(),
    relatedPatterns: z.array(z.string()).optional(),

    customMetadata: z.record(z.string()).optional(),

    tags: z.array(z.string()).max(10).optional(),
    search_type: searchTypeSchema.optional().default('hybrid'),
    sort_order: sortOrderSchema.optional().default('relevance'),
    limit: z.number().int().positive().max(50).optional().default(10),
    offset: z.number().int().nonnegative().optional().default(0),
    issue_id: z.string().uuid().optional(),
    excludePublicOrg: z.boolean().optional(),
    minRelevance: z.number().min(0).max(1).optional(),
  })
  .strict();

export type SearchInput = z.infer<typeof searchInputSchema>;

export const searchResponseSchema = z.object({
  results: z.array(issueSchema),
  hasMore: z.boolean(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const facetsResponseSchema = z.object({
  projects: z.array(z.string()),
  techStack: z.array(z.string()),
  tags: z.array(z.string()),
  errorTypes: z.array(z.string()),
  severities: z.array(z.string()),
  environments: z.array(z.string()),
  affectedAreas: z.array(z.string()),
  frequencies: z.array(z.string()),
  rootCauses: z.array(z.string()),
  fixTypes: z.array(z.string()),
  complexities: z.array(z.string()),
});

export type FacetsResponse = z.infer<typeof facetsResponseSchema>;
