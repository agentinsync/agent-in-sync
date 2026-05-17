import { z } from 'zod';

export const authorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
});

export type Author = z.infer<typeof authorSchema>;

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export type Tag = z.infer<typeof tagSchema>;

export const ERROR_TYPES = ['runtime', 'build', 'type', 'lint', 'test', 'deploy'] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const ENVIRONMENTS = ['development', 'staging', 'production', 'ci'] as const;
export const ROOT_CAUSES = [
  'breaking-change',
  'config',
  'bug',
  'misuse',
  'dependency-conflict',
  'unknown',
] as const;
export const FIX_TYPES = [
  'code-change',
  'config-change',
  'upgrade',
  'downgrade',
  'workaround',
] as const;
export const COMPLEXITIES = ['trivial', 'simple', 'medium', 'complex', 'very-complex'] as const;
export const AFFECTED_AREAS = ['frontend', 'backend', 'fullstack', 'infra', 'ci-cd'] as const;
export const FREQUENCIES = ['always', 'often', 'sometimes', 'rare'] as const;

export const errorTypeSchema = z.enum(ERROR_TYPES);
export const severitySchema = z.enum(SEVERITIES);
export const environmentSchema = z.enum(ENVIRONMENTS);
export const rootCauseSchema = z.enum(ROOT_CAUSES);
export const fixTypeSchema = z.enum(FIX_TYPES);
export const complexitySchema = z.enum(COMPLEXITIES);
export const affectedAreaSchema = z.enum(AFFECTED_AREAS);
export const frequencySchema = z.enum(FREQUENCIES);

export type ErrorType = z.infer<typeof errorTypeSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type RootCause = z.infer<typeof rootCauseSchema>;
export type FixType = z.infer<typeof fixTypeSchema>;
export type Complexity = z.infer<typeof complexitySchema>;
export type AffectedArea = z.infer<typeof affectedAreaSchema>;
export type Frequency = z.infer<typeof frequencySchema>;

export const packageInfoSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(50),
});

export type PackageInfo = z.infer<typeof packageInfoSchema>;

export const issueMetadataSchema = z.object({
  project: z.string().max(200).optional(),
  techStack: z.array(z.string().max(50)).max(20).optional(),
  packages: z.array(packageInfoSchema).max(50).optional(),

  errorType: errorTypeSchema.optional(),
  errorCategory: z.string().max(100).optional(),
  severity: severitySchema.optional(),
  environment: environmentSchema.optional(),

  fileTypes: z.array(z.string().max(20)).max(20).optional(),
  codePatterns: z.array(z.string().max(50)).max(20).optional(),
  affectedArea: affectedAreaSchema.optional(),

  frequency: frequencySchema.optional(),
  hasMinimalRepro: z.boolean().optional(),
  stepsToReproduce: z.number().int().min(1).max(100).optional(),

  rootCause: rootCauseSchema.optional(),
  fixType: fixTypeSchema.optional(),
  complexity: complexitySchema.optional(),
  timeToResolve: z.string().max(20).optional(),
  lessonsLearned: z.array(z.string().max(500)).max(10).optional(),
  relatedPatterns: z.array(z.string().max(50)).max(20).optional(),

  customMetadata: z.record(z.string().max(100), z.string().max(500)).optional(),
});

export type IssueMetadata = z.infer<typeof issueMetadataSchema>;

export const issueSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  authorId: z.string().uuid(),
  solutionCount: z.number().int().nonnegative(),
  acceptedSolutionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(tagSchema).optional(),
  author: authorSchema.optional(),

  project: z.string().nullable().optional(),
  techStack: z.array(z.string()).nullable().optional(),
  packages: z.array(packageInfoSchema).nullable().optional(),
  errorType: errorTypeSchema.nullable().optional(),
  errorCategory: z.string().nullable().optional(),
  severity: severitySchema.nullable().optional(),
  environment: environmentSchema.nullable().optional(),
  fileTypes: z.array(z.string()).nullable().optional(),
  codePatterns: z.array(z.string()).nullable().optional(),
  affectedArea: affectedAreaSchema.nullable().optional(),
  frequency: frequencySchema.nullable().optional(),
  hasMinimalRepro: z.boolean().nullable().optional(),
  stepsToReproduce: z.number().int().nullable().optional(),
  rootCause: rootCauseSchema.nullable().optional(),
  fixType: fixTypeSchema.nullable().optional(),
  complexity: complexitySchema.nullable().optional(),
  timeToResolve: z.string().nullable().optional(),
  lessonsLearned: z.array(z.string()).nullable().optional(),
  relatedPatterns: z.array(z.string()).nullable().optional(),
  customMetadata: z.record(z.string()).nullable().optional(),
});

export type Issue = z.infer<typeof issueSchema>;

export const submitIssueInputSchema = z
  .object({
    title: z.string().min(10).max(500),
    summary: z.string().min(20).max(500),
    description: z.string().min(20).max(50000),
    tags: z.array(z.string().max(50)).min(1).max(10),
    solution: z.string().min(10).max(50000).optional(),
    metadata: issueMetadataSchema.optional(),
  })
  .strict();

export type SubmitIssueInput = z.infer<typeof submitIssueInputSchema>;

export const submitIssueResponseSchema = z.object({
  issue_id: z.string().uuid(),
  solution_id: z.string().uuid().optional(),
});

export type SubmitIssueResponse = z.infer<typeof submitIssueResponseSchema>;
