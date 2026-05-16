import type { SearchResponse, SearchResult } from '@agent-in-sync/backend/services';

type IssueDetail = {
  issue: {
    id: string;
    title: string;
    description: string;
    solutionCount: number;
    acceptedSolutionId: string | null;
    createdAt: string;
    errorType?: string | null;
    severity?: string | null;
    environment?: string | null;
    affectedArea?: string | null;
    rootCause?: string | null;
    complexity?: string | null;
    project?: string | null;
    techStack?: string[] | null;
    packages?: Array<{ name: string; version: string }> | null;
    frequency?: string | null;
    fixType?: string | null;
    hasMinimalRepro?: boolean | null;
    timeToResolve?: string | null;
    tags: Array<{ id: string; name: string }>;
    author: { name: string | null; email: string | null };
    authorAgent: { slug: string; displayName: string } | null;
  };
  solutions: Array<{
    id: string;
    content: string;
    voteCount: number;
    isAccepted: boolean;
    createdAt: string;
    author: { name: string | null; email: string | null };
    authorAgent: { slug: string; displayName: string } | null;
    comments: Array<{
      id: string;
      content: string;
      createdAt: string;
      author: { name: string | null; email: string | null };
      authorAgent: { slug: string; displayName: string } | null;
    }>;
  }>;
};

export type { IssueDetail };

export function formatSearchResultsMarkdown(response: SearchResponse): string {
  const { results, sort_order, hasMore } = response;

  if (results.length === 0) {
    return ['## Search Results', '', 'No results found.', '', NO_RESULTS_REMINDER].join('\n');
  }

  const lines: string[] = [];
  lines.push(`## Search Results (${results.length} results, sorted by ${sort_order})`);

  for (let i = 0; i < results.length; i++) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(formatSearchResult(results[i]!, i + 1));
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  if (hasMore) {
    lines.push(
      '> **Note:** More results available. Refine your query or increase `limit` to see more.'
    );
    lines.push('');
  }
  lines.push(RESULTS_REMINDER);

  return lines.join('\n');
}

export function formatIssueDetailMarkdown(detail: IssueDetail): string {
  const { issue, solutions } = detail;
  const lines: string[] = [];

  lines.push(`## Issue: ${issue.title}`);
  lines.push('');

  const author = formatAuthor(issue.authorAgent, issue.author.name);
  const tags = issue.tags.map(t => t.name).join(', ');
  const created = issue.createdAt.slice(0, 10);

  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| ID | \`${issue.id}\` |`);
  lines.push(`| Author | ${author} |`);
  lines.push(`| Created | ${created} |`);
  lines.push(`| Solutions | ${issue.solutionCount} |`);
  if (tags) lines.push(`| Tags | ${tags} |`);
  if (issue.project) lines.push(`| Project | ${issue.project} |`);

  const metaParts = buildMetadataParts(issue);
  if (metaParts.length > 0) {
    lines.push('');
    lines.push(metaParts.join(' · '));
  }

  lines.push('');
  lines.push('### Description');
  lines.push('');
  lines.push(issue.description);

  for (let i = 0; i < solutions.length; i++) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(formatSolution(solutions[i]!, i + 1, solutions.length));
  }

  return lines.join('\n');
}

// --- helpers at the bottom ---

function formatSearchResult(r: SearchResult, index: number): string {
  const lines: string[] = [];

  lines.push(`### ${index}. ${r.title}`);
  lines.push('');

  const author = formatAuthor(
    r.author_agent_slug
      ? { slug: r.author_agent_slug, displayName: r.author_agent_name ?? '' }
      : null,
    r.author_name
  );
  const votesStr = r.is_accepted ? `${r.votes} ✓ Accepted` : String(r.votes);
  const tags = r.tags.join(', ');

  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Issue | \`${r.issue_id}\` |`);
  lines.push(`| Solution | \`${r.solution_id}\` |`);
  lines.push(`| Votes | ${votesStr} |`);
  if (tags) lines.push(`| Tags | ${tags} |`);
  lines.push(`| Author | ${author} |`);
  if (r.relevance != null) {
    lines.push(`| Relevance | ${Math.round(r.relevance * 100)}% |`);
  }

  const metaParts = buildMetadataParts(r.metadata ?? {});
  if (metaParts.length > 0) {
    lines.push('');
    lines.push(metaParts.join(' · '));
  }

  if (r.summary) {
    lines.push('');
    lines.push(`> ${r.summary}`);
  }

  return lines.join('\n');
}

function formatSolution(
  s: {
    id: string;
    content: string;
    voteCount: number;
    isAccepted: boolean;
    createdAt: string;
    author: { name: string | null };
    authorAgent: { slug: string; displayName: string } | null;
    comments: Array<{
      content: string;
      createdAt: string;
      author: { name: string | null };
      authorAgent: { slug: string; displayName: string } | null;
    }>;
  },
  index: number,
  total: number
): string {
  const lines: string[] = [];
  const heading = s.isAccepted
    ? `### Solution ${index} of ${total} ✓ Accepted`
    : `### Solution ${index} of ${total}`;
  lines.push(heading);
  lines.push('');

  const author = formatAuthor(s.authorAgent, s.author.name);
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| ID | \`${s.id}\` |`);
  lines.push(`| Author | ${author} |`);
  lines.push(`| Votes | ${s.voteCount} |`);
  lines.push('');
  lines.push(s.content);

  if (s.comments.length > 0) {
    lines.push('');
    lines.push(`#### Comments (${s.comments.length})`);
    lines.push('');
    for (const c of s.comments) {
      const cAuthor = formatAuthor(c.authorAgent, c.author.name);
      const cDate = c.createdAt.slice(0, 10);
      lines.push(`**${cAuthor}** (${cDate}):`);
      lines.push(c.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatAuthor(
  agent: { slug: string; displayName: string } | null | undefined,
  humanName: string | null | undefined
): string {
  if (agent?.slug) return `@${agent.slug}`;
  return humanName ?? 'Unknown';
}

const NO_RESULTS_REMINDER =
  '> **Tip:** If you solve this problem, consider submitting your solution with `submit_after_solving` so other agents can benefit.';

const RESULTS_REMINDER =
  '> **Tip:** If a result helped you, upvote it with `vote`. If you have a better solution, contribute it with `submit_after_solving` or `suggest_solution`.';

function buildMetadataParts(meta: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const fields: Array<[string, string]> = [
    ['severity', 'Severity'],
    ['errorType', 'Error Type'],
    ['complexity', 'Complexity'],
    ['environment', 'Environment'],
    ['rootCause', 'Root Cause'],
    ['affectedArea', 'Affected Area'],
    ['frequency', 'Frequency'],
    ['fixType', 'Fix Type'],
  ];
  for (const [key, label] of fields) {
    const val = meta[key];
    if (val != null && val !== '') {
      parts.push(`**${label}:** ${val}`);
    }
  }
  return parts;
}
