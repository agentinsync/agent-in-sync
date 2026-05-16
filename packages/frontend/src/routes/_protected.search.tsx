import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { zodValidator } from '@tanstack/zod-adapter';
import { stripSearchParams } from '@tanstack/react-router';
import { useSearchResults, useSubmitIssue, useFacets } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { useOrganization } from '@/hooks/use-organization';
import type { SearchParams } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Accordion } from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Search, ChevronLeft, ChevronRight, Filter, SlidersHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_TYPES, SORT_OPTIONS, FILTER_GROUPS } from '@/lib/constants';
import {
  searchParamsSchema,
  searchParamsDefaults,
  getActiveFilters,
  countActiveFilters,
  saveFilterPrefs,
  loadFilterPrefs,
  saveAccordionState,
  loadAccordionState,
  clearSearchStorage,
  type SearchPageParams,
} from '@/lib/search-params';
import { FilterSection } from '@/components/search/filter-section';
import { ActiveFiltersBar } from '@/components/search/active-filters-bar';
import { ResultCard } from '@/components/search/result-card';
import { SearchStartState } from '@/components/search/search-start-state';
import { EmptyState } from '@/components/empty-state';

export const Route = createFileRoute('/_protected/search')({
  validateSearch: zodValidator(searchParamsSchema),
  search: {
    middlewares: [stripSearchParams(searchParamsDefaults)],
  },
  component: SearchPage,
});

const LIMIT = 20;

function SearchPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const restoredFromStorage = useRef(false);
  const { selectedOrg } = useOrganization();
  const organizationId = selectedOrg?.id;

  // Restore saved filter prefs on first mount (only if URL has no filters)
  useEffect(() => {
    if (restoredFromStorage.current) return;
    restoredFromStorage.current = true;

    const hasUrlFilters = countActiveFilters(searchParams) > 0 || !!searchParams.q;
    if (hasUrlFilters) return;

    const saved = loadFilterPrefs();
    if (Object.keys(saved).length > 0) {
      navigate({
        search: prev => ({ ...prev, ...saved, page: 0 }),
        replace: true,
      });
    }
  }, []);

  // Save filter values to localStorage when they change
  useEffect(() => {
    saveFilterPrefs(searchParams);
  }, [searchParams]);

  // New Issue dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [solution, setSolution] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const submitIssue = useSubmitIssue();

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  async function handleSubmit() {
    setFieldErrors({});

    if (!title.trim() || !summary.trim() || !description.trim()) {
      const errors: Record<string, string[]> = {};
      if (!title.trim()) errors.title = ['Title is required'];
      if (!summary.trim()) errors.summary = ['Summary is required'];
      if (!description.trim()) errors.description = ['Description is required'];
      setFieldErrors(errors);
      return;
    }

    try {
      const tagList = tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      await submitIssue.mutateAsync({
        title,
        summary,
        description,
        tags: tagList.length > 0 ? tagList : undefined,
        solution: solution.trim() || undefined,
        organizationId: organizationId!,
      });
      toast.success('Issue submitted successfully');
      setIsCreateOpen(false);
      setTitle('');
      setSummary('');
      setDescription('');
      setTags('');
      setSolution('');
      setFieldErrors({});
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to submit issue');
      }
    }
  }

  // Mobile filter drawer state
  const [filtersOpen, setMobileFiltersOpen] = useState(false);

  const { data: facetsData } = useFacets(organizationId);

  const activeFilters = getActiveFilters(searchParams);
  const filterCount = countActiveFilters(searchParams);

  // Build API params
  const apiParams = buildApiParams(searchParams);
  const { data, isLoading } = useSearchResults(apiParams, organizationId);
  const hasMore = data?.hasMore ?? false;
  const showPagination = hasMore || searchParams.page > 0;

  // Update a single search param
  function setParam(updates: Partial<SearchPageParams>) {
    navigate({
      search: prev => ({ ...prev, ...updates, page: 0 }),
      replace: true,
    });
  }

  function setPage(page: number) {
    navigate({
      search: prev => ({ ...prev, page }),
      replace: true,
    });
  }

  function clearFilters() {
    clearSearchStorage();
    navigate({
      search: prev => ({
        ...prev,
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
        page: 0,
      }),
      replace: true,
    });
  }

  function removeFilter(key: keyof SearchPageParams, value: string) {
    if (key === 'techStack') {
      navigate({
        search: prev => ({
          ...prev,
          techStack: (prev.techStack as string[]).filter(v => v !== value),
          page: 0,
        }),
        replace: true,
      });
    } else if (key === 'tags') {
      navigate({
        search: prev => ({
          ...prev,
          tags: (prev.tags as string[]).filter(v => v !== value),
          page: 0,
        }),
        replace: true,
      });
    } else {
      navigate({
        search: prev => ({ ...prev, [key]: '', page: 0 }),
        replace: true,
      });
    }
  }

  function handleExampleSearch(query: string) {
    navigate({
      search: prev => ({ ...prev, q: query, page: 0 }),
      replace: true,
    });
  }

  const hasQuery = !!searchParams.q && searchParams.q.length >= 3;
  const hasTags = searchParams.tags.length > 0;
  const hasFilters = filterCount > 0;
  const showStartState = !hasQuery && !hasFilters && !hasTags;

  const facetSuggestions: Record<string, string[]> = {
    project: facetsData?.projects ?? [],
    techStack: facetsData?.techStack ?? [],
    tags: facetsData?.tags ?? [],
    errorType: facetsData?.errorTypes ?? [],
    severity: facetsData?.severities ?? [],
    environment: facetsData?.environments ?? [],
    affectedArea: facetsData?.affectedAreas ?? [],
    frequency: facetsData?.frequencies ?? [],
    rootCause: facetsData?.rootCauses ?? [],
    fixType: facetsData?.fixTypes ?? [],
    maxComplexity: facetsData?.complexities ?? [],
  };

  const filterSidebar = (
    <FilterSidebar
      searchParams={searchParams}
      hasFilters={hasFilters}
      facetSuggestions={facetSuggestions}
      onFilterChange={(key, value) => setParam({ [key]: value })}
      onClearFilters={clearFilters}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search</h1>
          <p className="mt-1 text-muted-foreground">Find solutions across the knowledge base</p>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={open => {
            setIsCreateOpen(open);
            if (!open) setFieldErrors({});
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Issue
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col">
            <DialogHeader>
              <DialogTitle>Submit New Issue</DialogTitle>
              <DialogDescription>
                Ask a coding question or share a problem you've encountered.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-1">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="How to implement..."
                  value={title}
                  onChange={e => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                  className={
                    fieldErrors.title ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                <FieldError errors={fieldErrors.title} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  placeholder="Write 2-3 plain sentences describing what broke and why..."
                  rows={3}
                  value={summary}
                  onChange={e => {
                    setSummary(e.target.value);
                    clearFieldError('summary');
                  }}
                  className={
                    fieldErrors.summary ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                <FieldError errors={fieldErrors.summary} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your problem in detail..."
                  rows={4}
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value);
                    clearFieldError('description');
                  }}
                  className={
                    fieldErrors.description
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }
                />
                <FieldError errors={fieldErrors.description} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="typescript, react, algorithms"
                  value={tags}
                  onChange={e => {
                    setTags(e.target.value);
                    clearFieldError('tags');
                  }}
                  className={
                    fieldErrors.tags ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                <FieldError errors={fieldErrors.tags} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="solution">Solution (optional)</Label>
                <Textarea
                  id="solution"
                  placeholder="If you have a solution, share it here..."
                  rows={4}
                  value={solution}
                  onChange={e => {
                    setSolution(e.target.value);
                    clearFieldError('solution');
                  }}
                  className={
                    fieldErrors.solution ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                <FieldError errors={fieldErrors.solution} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitIssue.isPending}>
                {submitIssue.isPending ? 'Submitting...' : 'Submit Issue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.searchType}
          onValueChange={v => setParam({ searchType: v as SearchPageParams['searchType'] })}
        >
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEARCH_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={searchParams.sort}
          onValueChange={v => setParam({ sort: v as SearchPageParams['sort'] })}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Mobile-only filter sheet trigger */}
        <Sheet open={filtersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 lg:hidden">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              Filters{filterCount > 0 ? ` (${filterCount})` : ''}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{filterSidebar}</div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Active filter pills */}
      <ActiveFiltersBar filters={activeFilters} onRemove={removeFilter} onClearAll={clearFilters} />

      {/* Two-column layout: filter sidebar (desktop) + results */}
      <div className="flex gap-6">
        {/* Desktop filter sidebar */}
        <div className="hidden w-[270px] shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-card p-4">
            {filterSidebar}
          </div>
        </div>

        {/* Results */}
        <div className="min-w-0 flex-1 space-y-4">
          {showStartState ? (
            <SearchStartState onSearch={handleExampleSearch} organizationId={organizationId} />
          ) : (
            <>
              {data && (
                <p className="text-sm text-muted-foreground">
                  {data.results.length} result{data.results.length !== 1 ? 's' : ''}
                </p>
              )}

              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16" />
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-5 w-14" />
                        </div>
                        <Skeleton className="h-1.5 w-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : data?.results && data.results.length > 0 ? (
                data.results.map(result => <ResultCard key={result.solution_id} result={result} />)
              ) : (
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try different keywords or adjust your filters."
                />
              )}

              {showPagination && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Page {searchParams.page + 1}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={searchParams.page === 0}
                      onClick={() => setPage(searchParams.page - 1)}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasMore}
                      onClick={() => setPage(searchParams.page + 1)}
                    >
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSidebar({
  searchParams,
  hasFilters,
  facetSuggestions,
  onFilterChange,
  onClearFilters,
}: {
  searchParams: SearchPageParams;
  hasFilters: boolean;
  facetSuggestions: Record<string, string[]>;
  onFilterChange: (key: string, value: string | string[]) => void;
  onClearFilters: () => void;
}) {
  const [openSections, setOpenSections] = useState(loadAccordionState);

  function handleAccordionChange(value: string[]) {
    setOpenSections(value);
    saveAccordionState(value);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4" />
          Filters
        </h3>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear
          </Button>
        )}
      </div>

      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={handleAccordionChange}
        className="w-full"
      >
        {FILTER_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <Separator className="my-3" />}
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            {group.filters.map(filter => (
              <FilterSection
                key={filter.key}
                filterKey={filter.key}
                title={filter.title}
                options={filter.options ? [...filter.options] : null}
                value={
                  filter.key === 'techStack' || filter.key === 'tags'
                    ? (searchParams[filter.key as keyof SearchPageParams] as string[])
                    : (searchParams[filter.key as keyof SearchPageParams] as string)
                }
                onChange={value => onFilterChange(filter.key, value)}
                suggestions={facetSuggestions[filter.key]}
              />
            ))}
          </div>
        ))}
      </Accordion>
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {errors.map((msg, i) => (
        <p key={i} className="text-[13px] text-destructive animate-in fade-in slide-in-from-top-1">
          {msg}
        </p>
      ))}
    </div>
  );
}

function buildApiParams(params: SearchPageParams): SearchParams {
  const apiParams: SearchParams = {
    query: params.q || undefined,
    search_type: params.searchType,
    sort_order: params.sort,
    limit: LIMIT,
    offset: params.page * LIMIT,
  };

  if (params.errorType) apiParams.errorType = params.errorType;
  if (params.severity) apiParams.severity = params.severity;
  if (params.environment) apiParams.environment = params.environment;
  if (params.affectedArea) apiParams.affectedArea = params.affectedArea;
  if (params.rootCause) apiParams.rootCause = params.rootCause;
  if (params.maxComplexity) apiParams.maxComplexity = params.maxComplexity;
  if (params.project) apiParams.project = params.project;
  if (params.frequency) apiParams.frequency = params.frequency;
  if (params.fixType) apiParams.fixType = params.fixType;
  if (params.techStack.length > 0) apiParams.techStack = params.techStack;
  if (params.tags.length > 0) apiParams.tags = params.tags;

  return apiParams;
}
