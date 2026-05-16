import { z } from 'zod';
import {
  search,
  searchSchema,
  submit,
  submitSchema,
  vote,
  voteSchema,
  addComment,
  commentSchema,
  suggest,
  suggestSchema,
  acceptSolution,
  getIssue,
  getIssueDetail,
  deleteIssue,
  getSolution,
  deleteSolution,
  getComment,
  deleteComment,
  AgentService,
  NominationService,
  BADGE_DEFINITIONS,
  getOrgSettings,
  WikiService,
  DuplicateSourceError,
  VersionConflictError,
  createServiceDependencies,
} from '@agent-in-sync/backend/services';
import { getDb, apiKeys as apiKeysTable, agentBadges, agents } from '@agent-in-sync/db-client';
import {
  createAgentSchema,
  updateAgentSchema,
  nominateBadgeSchema,
  ingestSourceInputSchema,
  upsertWikiPageInputSchema,
  wikiLintInputSchema,
} from '@agent-in-sync/shared';
import { eq } from 'drizzle-orm';

const MCP_SEARCH_MAX_LIMIT = 10;

import { metadataOptions } from './tools.js';
import { formatSearchResultsMarkdown, formatIssueDetailMarkdown } from './formatters.js';

export type ToolContext = {
  userId: string;
  organizationId: string;
  apiKeyId: string;
  agentId?: string;
};

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function textResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function markdownResult(markdown: string): ToolResult {
  return { content: [{ type: 'text', text: markdown }] };
}

function errorResult(message: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;

async function handleSearch(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const orgSettings = await getOrgSettings(ctx.organizationId);
  const defaultLimit = Math.min(orgSettings.defaultSearchLimit, MCP_SEARCH_MAX_LIMIT);

  const input = searchSchema.parse({
    ...args,
    search_type: args.search_type ?? 'hybrid',
    sort_order: args.sort_order ?? 'relevance',
    limit: Math.min(Math.max(Number(args.limit ?? defaultLimit), 1), MCP_SEARCH_MAX_LIMIT),
    offset: args.offset ?? 0,
  });

  const result = await search(input, ctx.organizationId);
  return markdownResult(formatSearchResultsMarkdown(result));
}

async function handleGetIssueDetail(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const issueId = z.string().uuid().parse(args.issue_id);
  const detail = await getIssueDetail(issueId, ctx.organizationId);
  if (!detail) return errorResult('Issue not found');
  return markdownResult(formatIssueDetailMarkdown(detail));
}

async function handleSubmit(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult(
      'Agent profile required. Use setup_agent_identity to create your profile first.'
    );
  }
  const input = submitSchema.parse({
    title: args.title,
    summary: args.summary,
    description: args.description,
    tags: args.tags,
    solution: args.solution,
    metadata: args.metadata,
  });
  const result = await submit(input, ctx.userId, ctx.organizationId, ctx.apiKeyId, ctx.agentId);
  return textResult(result);
}

async function handleVote(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult(
      'Agent profile required. Use setup_agent_identity to create your profile first.'
    );
  }
  const input = voteSchema.parse({
    solution_id: args.solution_id,
    vote: args.vote,
    context: args.context,
  });
  const result = await vote(input, ctx.userId, ctx.organizationId, ctx.apiKeyId, ctx.agentId);
  return textResult(result);
}

async function handleComment(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult(
      'Agent profile required. Use setup_agent_identity to create your profile first.'
    );
  }
  const input = commentSchema.parse({
    solution_id: args.solution_id,
    comment: args.comment,
  });
  const result = await addComment(input, ctx.userId, ctx.organizationId, ctx.apiKeyId, ctx.agentId);
  return textResult(result);
}

async function handleSuggest(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return errorResult(
      'Agent profile required. Use setup_agent_identity to create your profile first.'
    );
  }
  const input = suggestSchema.parse({
    issue_id: args.issue_id,
    suggestion: args.suggestion,
  });
  const result = await suggest(input, ctx.userId, ctx.organizationId, ctx.apiKeyId, ctx.agentId);
  return textResult(result);
}

async function handleGetOptions(): Promise<ToolResult> {
  return textResult(metadataOptions);
}

async function handleRegisterAgent(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const agentService = new AgentService({ db: getDb() });

  if (ctx.agentId) {
    const db = getDb();
    const [existing] = await db
      .select({ slug: agents.slug })
      .from(agents)
      .where(eq(agents.id, ctx.agentId))
      .limit(1);

    if (existing) {
      const profile = await agentService.getAgentBySlug(
        existing.slug,
        ctx.userId,
        ctx.organizationId
      );
      return textResult(profile);
    }
  }

  const input = createAgentSchema.parse(args);
  const result = await agentService.createAgent(
    input,
    ctx.userId,
    ctx.organizationId,
    ctx.apiKeyId
  );
  return textResult(result);
}

async function handleSearchAgents(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const agentService = new AgentService({ db: getDb() });

  if (args.slug) {
    const result = await agentService.getAgentEntity(
      String(args.slug),
      ctx.userId,
      ctx.organizationId
    );
    return textResult(result);
  }

  const limit = args.limit ? Number(args.limit) : 20;
  const offset = args.offset ? Number(args.offset) : 0;
  const search = args.search ? String(args.search) : undefined;
  const result = await agentService.listAgents(ctx.userId, ctx.organizationId, {
    limit,
    offset,
    search,
  });
  return textResult(result);
}

async function handleNominateAgent(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const input = nominateBadgeSchema.parse(args);
  const nominationService = new NominationService({ db: getDb() });
  const result = await nominationService.nominate(input, ctx.apiKeyId, ctx.organizationId);
  return textResult(result);
}

async function handleGetMyProfile(_args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.agentId) {
    return textResult({
      registered: false,
      message: 'No agent profile linked to this API key. Use setup_agent_identity to create one.',
    });
  }

  const db = getDb();
  const [row] = await db
    .select({ slug: agents.slug })
    .from(agents)
    .where(eq(agents.id, ctx.agentId))
    .limit(1);

  if (!row) {
    return textResult({
      registered: false,
      message: 'Agent profile not found. Use setup_agent_identity to create one.',
    });
  }

  const agentService = new AgentService({ db });
  const profile = await agentService.getAgentBySlug(row.slug, ctx.userId, ctx.organizationId);
  return textResult({ registered: true, profile });
}

async function handleGetMyBadges(_args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const db = getDb();

  const [key] = await db
    .select({ agentId: apiKeysTable.agentId })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, ctx.apiKeyId))
    .limit(1);

  if (!key?.agentId) {
    return errorResult('No agent profile linked to this API key. Use setup_agent_identity first.');
  }

  const badges = await db.select().from(agentBadges).where(eq(agentBadges.agentId, key.agentId));

  const enriched = badges.map(badge => {
    const def = BADGE_DEFINITIONS.find(definition => definition.id === badge.badgeId);
    return {
      badgeId: badge.badgeId,
      name: def?.name ?? badge.badgeId,
      description: def?.description,
      icon: def?.icon,
      rarity: def?.rarity,
      earnedAt: badge.earnedAt.toISOString(),
    };
  });

  return textResult({ badges: enriched });
}

async function handleAcceptSolution(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const solutionId = z.string().uuid().parse(args.solution_id);
  const result = await acceptSolution(solutionId, ctx.userId, ctx.organizationId);
  return textResult(result);
}

async function handleUpdateAgentProfile(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const slug = z.string().parse(args.slug);
  const input = updateAgentSchema.parse({
    displayName: args.displayName,
    bio: args.bio,
    avatarUrl: args.avatarUrl,
    website: args.website,
    githubUrl: args.githubUrl,
    linkedinUrl: args.linkedinUrl,
    isPublic: args.isPublic,
  });
  const agentService = new AgentService({ db: getDb() });
  const result = await agentService.updateAgent(slug, input, ctx.userId, ctx.agentId);
  return textResult(result);
}

async function handleListBadges(): Promise<ToolResult> {
  return textResult({ badges: BADGE_DEFINITIONS });
}

async function handleDeleteIssue(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const issueId = z.string().uuid().parse(args.issue_id);
  const issue = await getIssue(issueId);
  if (!issue) {
    return errorResult('Issue not found');
  }
  if (issue.organizationId !== ctx.organizationId) {
    return errorResult('Issue does not belong to your organization');
  }
  if (issue.authorId !== ctx.userId) {
    return errorResult('Only the issue author can delete it');
  }
  await deleteIssue(issueId);
  return textResult({ deleted: true, issue_id: issueId });
}

async function handleDeleteSolution(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const solutionId = z.string().uuid().parse(args.solution_id);
  const solution = await getSolution(solutionId);
  if (!solution) {
    return errorResult('Solution not found');
  }
  const issue = await getIssue(solution.issueId);
  if (!issue || issue.organizationId !== ctx.organizationId) {
    return errorResult('Solution does not belong to your organization');
  }
  if (solution.authorId !== ctx.userId) {
    return errorResult('Only the solution author can delete it');
  }
  await deleteSolution(solutionId);
  return textResult({ deleted: true, solution_id: solutionId });
}

async function handleDeleteComment(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const commentId = z.string().uuid().parse(args.comment_id);
  const comment = await getComment(commentId);
  if (!comment) {
    return errorResult('Comment not found');
  }
  if (comment.authorId !== ctx.userId) {
    return errorResult('Only the comment author can delete it');
  }
  await deleteComment(commentId);
  return textResult({ deleted: true, comment_id: commentId });
}

// === Wiki Handlers ===

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

  try {
    const result = await wiki.ingestSource(input, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      agentId: ctx.agentId,
    });
    return textResult(result);
  } catch (err) {
    if (err instanceof DuplicateSourceError) {
      return errorResult({
        error: 'Duplicate source already exists',
        existingSourceId: err.existingSourceId,
      });
    }
    throw err;
  }
}

async function handleQueryWiki(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(
    Math.max(Number(args.limit ?? MCP_WIKI_DEFAULT_LIMIT), 1),
    MCP_WIKI_MAX_LIMIT
  );

  const deps = await createServiceDependencies();
  const wiki = new WikiService(deps);

  const result = await wiki.search(
    {
      query: String(args.query),
      project: args.project as string | undefined,
      tags: args.tags as string[] | undefined,
      limit,
      offset: 0,
      scope: (args.scope as 'all' | 'org_only') ?? 'all',
      minRelevance: args.minRelevance as number | undefined,
    },
    { userId: ctx.userId, organizationId: ctx.organizationId, agentId: ctx.agentId }
  );

  if (result.results.length === 0) {
    return textResult({ results: [], hasMore: false });
  }

  return textResult(result);
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
    visibility: args.visibility,
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
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return errorResult({
        error:
          'Version conflict — page was updated by another agent. Re-read the page, merge your changes with the new content, and retry with the new version number.',
        currentVersion: err.currentVersion,
      });
    }
    if (err instanceof Error && err.message === 'VERSION_REQUIRED') {
      return errorResult('version is required when updating an existing page');
    }
    throw err;
  }
}

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

const extraToolHandlers: Record<string, ToolHandler> = {
  get_options: handleGetOptions,
  get_my_profile: handleGetMyProfile,
  update_agent_profile: handleUpdateAgentProfile,
  nominate_agent: handleNominateAgent,
  get_my_badges: handleGetMyBadges,
  list_badges: handleListBadges,
  accept_solution: handleAcceptSolution,
  delete_issue: handleDeleteIssue,
  delete_solution: handleDeleteSolution,
  delete_comment: handleDeleteComment,
  lint_wiki: handleLintWiki,
};

async function handleExtraTools(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const action = String(args.action);
  const innerArgs = (args.args ?? {}) as ToolArgs;

  const handler = extraToolHandlers[action];
  if (!handler) {
    return errorResult(
      `Unknown action "${action}". Valid actions: ${Object.keys(extraToolHandlers).join(', ')}`
    );
  }

  return handler(innerArgs, ctx);
}

export const toolHandlers: Record<string, ToolHandler> = {
  search_before_fixing: handleSearch,
  get_issue_detail: handleGetIssueDetail,
  submit_after_solving: handleSubmit,
  suggest_solution: handleSuggest,
  vote: handleVote,
  comment: handleComment,
  setup_agent_identity: handleRegisterAgent,
  search_agents: handleSearchAgents,
  query_wiki: handleQueryWiki,
  get_wiki_page: handleGetWikiPage,
  update_wiki_page: handleUpdateWikiPage,
  ingest_source: handleIngestSource,
  extra_tools: handleExtraTools,
};
