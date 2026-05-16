import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { zodValidator } from '@tanstack/zod-adapter';
import { stripSearchParams } from '@tanstack/react-router';
import { usePublicSearchResults } from '@/lib/api';
import { useDebounce } from '@/hooks/use-debounce';
import type { SearchParams } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Accordion } from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  ArrowRight,
} from 'lucide-react';
import { SEARCH_TYPES, SORT_OPTIONS, FILTER_GROUPS } from '@/lib/constants';
import {
  searchParamsSchema,
  searchParamsDefaults,
  getActiveFilters,
  countActiveFilters,
  saveAccordionState,
  loadAccordionState,
  type SearchPageParams,
} from '@/lib/search-params';
import { FilterSection } from '@/components/search/filter-section';
import { ActiveFiltersBar } from '@/components/search/active-filters-bar';
import { ResultCard } from '@/components/search/result-card';
import { SearchStartState } from '@/components/search/search-start-state';
import { EmptyState } from '@/components/empty-state';

export const Route = createFileRoute('/_marketing/explore')({
  validateSearch: zodValidator(searchParamsSchema),
  search: {
    middlewares: [stripSearchParams(searchParamsDefaults)],
  },
  component: PublicSearchPage,
});

const LIMIT = 20;

const MIN_QUERY_LENGTH = 3;

function PublicSearchPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const restoredFromStorage = useRef(false);

  useEffect(() => {
    if (restoredFromStorage.current) return;
    restoredFromStorage.current = true;
  }, []);

  // Local input state with debounce
  const [inputValue, setInputValue] = useState(searchParams.q);
  const debouncedQuery = useDebounce(inputValue, 300);

  // Sync debounced value to URL params
  useEffect(() => {
    if (debouncedQuery === searchParams.q) return;
    navigate({
      search: prev => ({ ...prev, q: debouncedQuery, page: 0 }),
      replace: true,
    });
  }, [debouncedQuery]);

  // Sync URL → local input when URL changes externally (e.g. example search click)
  useEffect(() => {
    setInputValue(searchParams.q);
  }, [searchParams.q]);

  const [filtersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilters = getActiveFilters(searchParams);
  const filterCount = countActiveFilters(searchParams);

  const apiParams = buildApiParams(searchParams);
  const { data, isLoading } = usePublicSearchResults(apiParams);
  const hasMore = data?.hasMore ?? false;
  const showPagination = hasMore || searchParams.page > 0;

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

  const hasQuery = !!searchParams.q && searchParams.q.length >= MIN_QUERY_LENGTH;
  const hasFilters = filterCount > 0;
  const showStartState = !hasQuery && !hasFilters;

  const filterSidebar = (
    <FilterSidebar
      searchParams={searchParams}
      hasFilters={hasFilters}
      onFilterChange={(key, value) => setParam({ [key]: value })}
      onClearFilters={clearFilters}
    />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* CTA Banner */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Sign up to submit issues, vote on solutions, and contribute to the knowledge base.
          </p>
          <Link to="/signup">
            <Button size="sm" className="shrink-0">
              Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
          <p className="mt-1 text-muted-foreground">
            Search solutions across the public knowledge base
          </p>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Describe your problem or paste an error message..."
            className="h-11 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-ring"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
          {inputValue.length > 0 && inputValue.length < MIN_QUERY_LENGTH && (
            <p className="mt-1 text-xs text-muted-foreground">
              Type at least {MIN_QUERY_LENGTH} characters to search
            </p>
          )}
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

        <ActiveFiltersBar
          filters={activeFilters}
          onRemove={removeFilter}
          onClearAll={clearFilters}
        />

        <div className="flex gap-6">
          <div className="hidden w-[270px] shrink-0 lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-card p-4">
              {filterSidebar}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            {showStartState ? (
              <SearchStartState
                onSearch={handleExampleSearch}
                issueLinkPrefix="/explore/issues/$id"
                searchPath="/explore"
              />
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
                  data.results.map(result => (
                    <ResultCard
                      key={result.solution_id}
                      result={result}
                      issueLinkPrefix="/explore/issues/$id"
                      searchPath="/explore"
                    />
                  ))
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
    </div>
  );
}

function FilterSidebar({
  searchParams,
  hasFilters,
  onFilterChange,
  onClearFilters,
}: {
  searchParams: SearchPageParams;
  hasFilters: boolean;
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
                  filter.key === 'techStack'
                    ? searchParams.techStack
                    : (searchParams[filter.key as keyof SearchPageParams] as string)
                }
                onChange={value => onFilterChange(filter.key, value)}
              />
            ))}
          </div>
        ))}
      </Accordion>
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
