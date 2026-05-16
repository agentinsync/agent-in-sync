import { describe, it, expect } from 'vitest';
import { formatSearchResultsMarkdown, formatIssueDetailMarkdown } from './formatters.js';
import type { SearchResponse, SearchResult } from '@agent-in-sync/backend/services';
import type { IssueDetail } from './formatters.js';

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    solution_id: 'sol-111',
    issue_id: 'iss-222',
    title: 'Fix broken ESLint config',
    summary: 'Update eslintrc to use flat config format...',
    votes: 5,
    timestamp: '2025-12-15T10:00:00Z',
    tags: ['eslint', 'typescript'],
    author_name: 'Alice',
    author_agent_slug: null,
    author_agent_name: null,
    organization_name: 'TestOrg',
    is_accepted: false,
    author_trust_level: 'established',
    relevance: 0.92,
    rank_score: 0.85,
    metadata: {
      severity: 'high',
      errorType: 'build',
      complexity: 'medium',
      project: null,
      techStack: null,
    },
    ...overrides,
  };
}

function makeIssueDetail(overrides: Partial<IssueDetail> = {}): IssueDetail {
  return {
    issue: {
      id: 'iss-222',
      title: 'Fix broken ESLint config',
      description: 'ESLint 9 introduced flat config format...',
      solutionCount: 2,
      acceptedSolutionId: 'sol-111',
      createdAt: '2025-12-15T10:00:00Z',
      errorType: 'build',
      severity: 'high',
      environment: 'development',
      complexity: 'medium',
      rootCause: 'breaking-change',
      affectedArea: null,
      project: null,
      techStack: ['typescript'],
      packages: null,
      frequency: null,
      fixType: null,
      hasMinimalRepro: null,
      timeToResolve: null,
      tags: [
        { id: 't1', name: 'eslint' },
        { id: 't2', name: 'typescript' },
      ],
      author: { name: 'Alice', email: 'alice@test.com' },
      authorAgent: null,
    },
    solutions: [
      {
        id: 'sol-111',
        content: 'Migrate to flat config by renaming...',
        voteCount: 10,
        isAccepted: true,
        createdAt: '2025-12-15T11:00:00Z',
        author: { name: 'Bob', email: 'bob@test.com' },
        authorAgent: { slug: 'helper-bot', displayName: 'Helper Bot' },
        comments: [
          {
            id: 'c1',
            content: 'This worked for me!',
            createdAt: '2025-12-16T09:00:00Z',
            author: { name: 'Charlie', email: 'c@test.com' },
            authorAgent: null,
          },
        ],
      },
      {
        id: 'sol-333',
        content: 'Alternatively, use compat mode...',
        voteCount: 3,
        isAccepted: false,
        createdAt: '2025-12-15T12:00:00Z',
        author: { name: 'Dave', email: 'd@test.com' },
        authorAgent: null,
        comments: [],
      },
    ],
    ...overrides,
  };
}

describe('formatSearchResultsMarkdown', () => {
  it('should format empty results with contribution reminder', () => {
    const response: SearchResponse = { results: [], sort_order: 'relevance', hasMore: false };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('No results found');
    expect(md).toContain('submit_after_solving');
  });

  it('should include header with result count and sort order', () => {
    const response: SearchResponse = {
      results: [makeSearchResult()],
      sort_order: 'relevance',
      hasMore: true,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('1 results');
    expect(md).toContain('sorted by relevance');
    expect(md).toContain('More results available');
  });

  it('should format result with IDs, votes, tags, and author', () => {
    const response: SearchResponse = {
      results: [makeSearchResult()],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);

    expect(md).toContain('### 1. Fix broken ESLint config');
    expect(md).toContain('`iss-222`');
    expect(md).toContain('`sol-111`');
    expect(md).toContain('| Votes | 5 |');
    expect(md).toContain('eslint, typescript');
    expect(md).toContain('Alice');
    expect(md).toContain('92%');
  });

  it('should show accepted status inline with votes', () => {
    const response: SearchResponse = {
      results: [makeSearchResult({ is_accepted: true, votes: 14 })],
      sort_order: 'votes',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('14 ✓ Accepted');
  });

  it('should show agent author with @ prefix', () => {
    const response: SearchResponse = {
      results: [
        makeSearchResult({
          author_agent_slug: 'my-agent',
          author_agent_name: 'My Agent',
          author_name: null,
        }),
      ],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('@my-agent');
  });

  it('should include metadata when present', () => {
    const response: SearchResponse = {
      results: [makeSearchResult()],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('**Severity:** high');
    expect(md).toContain('**Error Type:** build');
    expect(md).toContain('**Complexity:** medium');
  });

  it('should skip metadata when null', () => {
    const response: SearchResponse = {
      results: [makeSearchResult({ metadata: undefined })],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).not.toContain('**Severity:**');
  });

  it('should skip relevance when null', () => {
    const response: SearchResponse = {
      results: [makeSearchResult({ relevance: null })],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).not.toContain('Relevance');
  });

  it('should include summary as blockquote', () => {
    const response: SearchResponse = {
      results: [makeSearchResult({ summary: 'This is the fix summary' })],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('> This is the fix summary');
  });

  it('should number multiple results', () => {
    const response: SearchResponse = {
      results: [
        makeSearchResult({ title: 'First' }),
        makeSearchResult({ title: 'Second', solution_id: 'sol-999' }),
      ],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('### 1. First');
    expect(md).toContain('### 2. Second');
  });

  it('should not show "more available" when hasMore is false', () => {
    const response: SearchResponse = {
      results: [makeSearchResult()],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).not.toContain('More results available');
  });

  it('should include vote/contribute reminder when results exist', () => {
    const response: SearchResponse = {
      results: [makeSearchResult()],
      sort_order: 'relevance',
      hasMore: false,
    };
    const md = formatSearchResultsMarkdown(response);
    expect(md).toContain('vote');
    expect(md).toContain('submit_after_solving');
  });
});

describe('formatIssueDetailMarkdown', () => {
  it('should format issue header with ID, author, and tags', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('## Issue: Fix broken ESLint config');
    expect(md).toContain('`iss-222`');
    expect(md).toContain('Alice');
    expect(md).toContain('2025-12-15');
    expect(md).toContain('eslint, typescript');
  });

  it('should include issue metadata', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('**Severity:** high');
    expect(md).toContain('**Error Type:** build');
    expect(md).toContain('**Root Cause:** breaking-change');
  });

  it('should include the full description', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('### Description');
    expect(md).toContain('ESLint 9 introduced flat config format...');
  });

  it('should format accepted solution with checkmark', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('### Solution 1 of 2 ✓ Accepted');
    expect(md).toContain('`sol-111`');
    expect(md).toContain('@helper-bot');
    expect(md).toContain('| Votes | 10 |');
    expect(md).toContain('Migrate to flat config by renaming...');
  });

  it('should format non-accepted solution without checkmark', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('### Solution 2 of 2');
    expect(md).not.toContain('Solution 2 of 2 ✓');
    expect(md).toContain('`sol-333`');
    expect(md).toContain('Dave');
  });

  it('should format comments under solutions', () => {
    const md = formatIssueDetailMarkdown(makeIssueDetail());
    expect(md).toContain('#### Comments (1)');
    expect(md).toContain('Charlie');
    expect(md).toContain('This worked for me!');
    expect(md).toContain('2025-12-16');
  });

  it('should handle issue with no solutions', () => {
    const detail = makeIssueDetail({ solutions: [] });
    detail.issue.solutionCount = 0;
    const md = formatIssueDetailMarkdown(detail);
    expect(md).toContain('| Solutions | 0 |');
    expect(md).not.toContain('### Solution');
  });

  it('should show agent author for issue', () => {
    const detail = makeIssueDetail();
    detail.issue.authorAgent = { slug: 'issue-bot', displayName: 'Issue Bot' };
    const md = formatIssueDetailMarkdown(detail);
    expect(md).toContain('@issue-bot');
  });
});
