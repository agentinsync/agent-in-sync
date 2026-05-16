export const SEARCH_TYPES = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'vector', label: 'Semantic' },
] as const;

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recent', label: 'Most Recent' },
  { value: 'votes', label: 'Most Votes' },
  { value: 'severity', label: 'Severity' },
  { value: 'complexity', label: 'Complexity' },
] as const;

export const ERROR_TYPES = [
  { value: 'runtime', label: 'Runtime' },
  { value: 'build', label: 'Build' },
  { value: 'type', label: 'Type' },
  { value: 'lint', label: 'Lint' },
  { value: 'test', label: 'Test' },
  { value: 'deploy', label: 'Deploy' },
] as const;

export const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

export const ENVIRONMENTS = [
  { value: 'development', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
  { value: 'ci', label: 'CI' },
] as const;

export const AFFECTED_AREAS = [
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'infra', label: 'Infrastructure' },
  { value: 'ci-cd', label: 'CI/CD' },
] as const;

export const ROOT_CAUSES = [
  { value: 'breaking-change', label: 'Breaking Change' },
  { value: 'config', label: 'Configuration' },
  { value: 'bug', label: 'Bug' },
  { value: 'misuse', label: 'Misuse' },
  { value: 'dependency-conflict', label: 'Dependency Conflict' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const COMPLEXITY_LEVELS = [
  { value: 'trivial', label: 'Trivial' },
  { value: 'simple', label: 'Simple' },
  { value: 'medium', label: 'Medium' },
  { value: 'complex', label: 'Complex' },
  { value: 'very-complex', label: 'Very Complex' },
] as const;

export const FIX_TYPES = [
  { value: 'config-change', label: 'Config Change' },
  { value: 'code-fix', label: 'Code Fix' },
  { value: 'dependency-update', label: 'Dependency Update' },
  { value: 'workaround', label: 'Workaround' },
  { value: 'migration', label: 'Migration' },
] as const;

export const FREQUENCIES = [
  { value: 'rare', label: 'Rare' },
  { value: 'occasional', label: 'Occasional' },
  { value: 'frequent', label: 'Frequent' },
  { value: 'constant', label: 'Constant' },
] as const;

/** Lookup from "filterKey:value" to human-readable label for pills */
export const FILTER_LABEL_MAP: Record<string, string> = Object.fromEntries([
  ...ERROR_TYPES.map(o => [`errorType:${o.value}`, o.label]),
  ...SEVERITY_LEVELS.map(o => [`severity:${o.value}`, o.label]),
  ...ENVIRONMENTS.map(o => [`environment:${o.value}`, o.label]),
  ...AFFECTED_AREAS.map(o => [`affectedArea:${o.value}`, o.label]),
  ...ROOT_CAUSES.map(o => [`rootCause:${o.value}`, o.label]),
  ...COMPLEXITY_LEVELS.map(o => [`maxComplexity:${o.value}`, o.label]),
  ...FIX_TYPES.map(o => [`fixType:${o.value}`, o.label]),
  ...FREQUENCIES.map(o => [`frequency:${o.value}`, o.label]),
]);

export const FILTER_GROUPS = [
  {
    label: 'Problem',
    filters: [
      { key: 'errorType', title: 'Error Type', options: ERROR_TYPES },
      { key: 'severity', title: 'Severity', options: SEVERITY_LEVELS },
      { key: 'frequency', title: 'Frequency', options: FREQUENCIES },
      { key: 'environment', title: 'Environment', options: ENVIRONMENTS },
    ],
  },
  {
    label: 'Codebase',
    filters: [
      { key: 'affectedArea', title: 'Affected Area', options: AFFECTED_AREAS },
      { key: 'maxComplexity', title: 'Max Complexity', options: COMPLEXITY_LEVELS },
      { key: 'project', title: 'Project', options: null },
      { key: 'techStack', title: 'Tech Stack', options: null },
      { key: 'tags', title: 'Tags', options: null },
    ],
  },
  {
    label: 'Resolution',
    filters: [
      { key: 'fixType', title: 'Fix Type', options: FIX_TYPES },
      { key: 'rootCause', title: 'Root Cause', options: ROOT_CAUSES },
    ],
  },
] as const;

export const EXAMPLE_SEARCHES = [
  'Next.js hydration mismatch in production',
  'TypeScript strict mode migration errors',
  'Docker build failing with EACCES permission',
] as const;
