import { z } from 'zod';
import { fallback } from '@tanstack/zod-adapter';
import {
  ERROR_TYPES,
  SEVERITY_LEVELS,
  ENVIRONMENTS,
  AFFECTED_AREAS,
  ROOT_CAUSES,
  COMPLEXITY_LEVELS,
  FIX_TYPES,
  FREQUENCIES,
  FILTER_LABEL_MAP,
} from './constants';

export const searchParamsSchema = z.object({
  q: fallback(z.string(), ''),
  searchType: fallback(z.enum(['hybrid', 'vector']), 'hybrid'),
  sort: fallback(z.enum(['relevance', 'recent', 'votes', 'severity', 'complexity']), 'relevance'),
  page: fallback(z.number().int().min(0), 0),
  // Single-select filters (backend accepts single values)
  errorType: fallback(z.string(), ''),
  severity: fallback(z.string(), ''),
  frequency: fallback(z.string(), ''),
  environment: fallback(z.string(), ''),
  affectedArea: fallback(z.string(), ''),
  fixType: fallback(z.string(), ''),
  rootCause: fallback(z.string(), ''),
  maxComplexity: fallback(z.string(), ''),
  project: fallback(z.string(), ''),
  // Multi-select filters (backend accepts arrays)
  techStack: fallback(z.array(z.string()), []),
  tags: fallback(z.array(z.string()), []),
});

export type SearchPageParams = z.infer<typeof searchParamsSchema>;

export const searchParamsDefaults: SearchPageParams = {
  q: '',
  searchType: 'hybrid',
  sort: 'relevance',
  page: 0,
  errorType: '',
  severity: '',
  frequency: '',
  environment: '',
  affectedArea: '',
  fixType: '',
  rootCause: '',
  maxComplexity: '',
  project: '',
  techStack: [],
  tags: [],
};

export interface ActiveFilter {
  key: keyof SearchPageParams;
  value: string;
  label: string;
}

const FILTER_OPTIONS_MAP: Record<string, readonly { value: string; label: string }[]> = {
  errorType: ERROR_TYPES,
  severity: SEVERITY_LEVELS,
  environment: ENVIRONMENTS,
  affectedArea: AFFECTED_AREAS,
  rootCause: ROOT_CAUSES,
  maxComplexity: COMPLEXITY_LEVELS,
  fixType: FIX_TYPES,
  frequency: FREQUENCIES,
};

function getLabelForValue(key: string, value: string): string {
  // Check the label map first
  const mapLabel = FILTER_LABEL_MAP[`${key}:${value}`];
  if (mapLabel) return mapLabel;

  // Try finding in option arrays
  const options = FILTER_OPTIONS_MAP[key];
  if (options) {
    const match = options.find(o => o.value === value);
    if (match) return match.label;
  }

  return value;
}

const SINGLE_FILTER_KEYS = [
  'errorType',
  'severity',
  'frequency',
  'environment',
  'affectedArea',
  'fixType',
  'rootCause',
  'maxComplexity',
  'project',
] as const;

export function getActiveFilters(params: SearchPageParams): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  for (const key of SINGLE_FILTER_KEYS) {
    const value = params[key];
    if (value) {
      filters.push({
        key,
        value,
        label: getLabelForValue(key, value),
      });
    }
  }

  for (const value of params.techStack) {
    filters.push({
      key: 'techStack',
      value,
      label: value,
    });
  }

  for (const value of params.tags) {
    filters.push({
      key: 'tags',
      value,
      label: `tag: ${value}`,
    });
  }

  return filters;
}

export function countActiveFilters(params: SearchPageParams): number {
  return getActiveFilters(params).length;
}

// localStorage keys
const STORAGE_KEY_FILTERS = 'search:saved-filters';
const STORAGE_KEY_ACCORDION = 'search:open-section';

export function saveFilterPrefs(params: SearchPageParams) {
  try {
    const filterValues: Partial<SearchPageParams> = {};
    for (const key of SINGLE_FILTER_KEYS) {
      if (params[key]) filterValues[key] = params[key];
    }
    if (params.techStack.length > 0) filterValues.techStack = params.techStack;
    if (params.tags.length > 0) filterValues.tags = params.tags;
    localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filterValues));
  } catch {
    // Ignore quota errors
  }
}

export function loadFilterPrefs(): Partial<SearchPageParams> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTERS);
    return raw ? (JSON.parse(raw) as Partial<SearchPageParams>) : {};
  } catch {
    return {};
  }
}

export function saveAccordionState(openSections: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCORDION, JSON.stringify(openSections));
  } catch {
    // Ignore
  }
}

const DEFAULT_OPEN_SECTIONS = ['errorType', 'severity'];

export function loadAccordionState(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCORDION);
    if (!raw) return DEFAULT_OPEN_SECTIONS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // Graceful fallback from old string format
    if (typeof parsed === 'string') return parsed ? [parsed] : DEFAULT_OPEN_SECTIONS;
    return DEFAULT_OPEN_SECTIONS;
  } catch {
    return DEFAULT_OPEN_SECTIONS;
  }
}

export function clearSearchStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY_FILTERS);
    localStorage.removeItem(STORAGE_KEY_ACCORDION);
  } catch {
    // Ignore
  }
}
