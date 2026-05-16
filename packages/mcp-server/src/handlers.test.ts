import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

const mockDb = {
  select: mockSelect,
};

vi.mock('@agent-in-sync/db-client', () => ({
  getDb: () => mockDb,
  apiKeys: { id: 'apiKeys.id', agentId: 'apiKeys.agentId' },
  agentBadges: { agentId: 'agentBadges.agentId' },
  agents: { id: 'agents.id', slug: 'agents.slug' },
}));

const mockGetAgentBySlug = vi.fn();
const mockListAgents = vi.fn();
const mockGetAgentEntity = vi.fn();

vi.mock('@agent-in-sync/backend/services', () => ({
  AgentService: vi.fn().mockImplementation(() => ({
    getAgentBySlug: mockGetAgentBySlug,
    listAgents: mockListAgents,
    getAgentEntity: mockGetAgentEntity,
  })),
  NominationService: vi.fn(),
  BADGE_DEFINITIONS: [],
  search: vi.fn(),
  submit: vi.fn(),
  vote: vi.fn(),
  addComment: vi.fn(),
  suggest: vi.fn(),
  acceptSolution: vi.fn(),
  getIssue: vi.fn(),
  getIssueDetail: vi.fn(),
  deleteIssue: vi.fn(),
  getSolution: vi.fn(),
  deleteSolution: vi.fn(),
  getComment: vi.fn(),
  deleteComment: vi.fn(),
  getOrgSettings: vi.fn().mockResolvedValue({ defaultSearchLimit: 3 }),
  WikiService: vi.fn(),
  createServiceDependencies: vi.fn(),
}));

vi.mock('@agent-in-sync/shared', () => ({
  createAgentSchema: { parse: vi.fn() },
  updateAgentSchema: { parse: vi.fn() },
  nominateBadgeSchema: { parse: vi.fn() },
  ingestSourceInputSchema: { parse: vi.fn() },
  upsertWikiPageInputSchema: { parse: vi.fn() },
  wikiLintInputSchema: { parse: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => `eq(${val})`),
}));

vi.mock('./tools.js', () => ({
  metadataOptions: {},
}));

vi.mock('./formatters.js', () => ({
  formatSearchResultsMarkdown: vi.fn(),
  formatIssueDetailMarkdown: vi.fn(),
}));

import { toolHandlers } from './handlers.js';
import type { ToolContext } from './handlers.js';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    apiKeyId: 'key-1',
    ...overrides,
  };
}

function chainQuery(rows: unknown[]) {
  mockLimit.mockResolvedValueOnce(rows);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe('toolHandlers registry', () => {
  it('registers exactly 13 core tools', () => {
    expect(Object.keys(toolHandlers)).toHaveLength(13);
  });

  it('includes all expected core tools', () => {
    const expected = [
      'search_before_fixing',
      'get_issue_detail',
      'submit_after_solving',
      'suggest_solution',
      'vote',
      'comment',
      'setup_agent_identity',
      'search_agents',
      'query_wiki',
      'get_wiki_page',
      'update_wiki_page',
      'ingest_source',
      'extra_tools',
    ];
    expect(Object.keys(toolHandlers).sort()).toEqual(expected.sort());
  });

  it('does not register removed tools at top level', () => {
    const removed = [
      'get_options',
      'get_my_profile',
      'get_agent_profile',
      'update_agent_profile',
      'get_agent_issues',
      'get_agent_activity',
      'nominate_agent',
      'get_my_badges',
      'list_badges',
      'accept_solution',
      'delete_issue',
      'delete_solution',
      'delete_comment',
      'lint_wiki',
    ];
    for (const name of removed) {
      expect(toolHandlers[name]).toBeUndefined();
    }
  });
});

describe('extra_tools router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callExtraTools(action: string, args: Record<string, unknown> = {}) {
    const handler = toolHandlers['extra_tools']!;
    return handler({ action, args }, makeCtx());
  }

  it('returns error for unknown action', async () => {
    const result = await callExtraTools('nonexistent');
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown action');
    expect(result.content[0]!.text).toContain('nonexistent');
  });

  it('lists valid actions in error message', async () => {
    const result = await callExtraTools('nonexistent');
    expect(result.content[0]!.text).toContain('get_options');
    expect(result.content[0]!.text).toContain('delete_issue');
    expect(result.content[0]!.text).toContain('lint_wiki');
  });

  it('routes get_options successfully', async () => {
    const result = await callExtraTools('get_options');
    expect(result.isError).toBeFalsy();
  });

  it('routes get_my_profile without agentId', async () => {
    const handler = toolHandlers['extra_tools']!;
    const result = await handler(
      { action: 'get_my_profile', args: {} },
      makeCtx({ agentId: undefined })
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['registered']).toBe(false);
  });

  it('routes get_my_profile with agentId found in DB', async () => {
    chainQuery([{ slug: 'my-bot' }]);
    mockGetAgentBySlug.mockResolvedValueOnce({
      id: 'agent-uuid',
      slug: 'my-bot',
      displayName: 'My Bot',
    });

    const handler = toolHandlers['extra_tools']!;
    const result = await handler(
      { action: 'get_my_profile', args: {} },
      makeCtx({ agentId: 'agent-uuid' })
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['registered']).toBe(true);
  });
});

describe('search_agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callSearchAgents(args: Record<string, unknown>) {
    const handler = toolHandlers['search_agents']!;
    return handler(args, makeCtx());
  }

  it('uses list mode when search param provided', async () => {
    mockListAgents.mockResolvedValueOnce({ agents: [], total: 0 });

    const result = await callSearchAgents({ search: 'claude' });
    expect(result.isError).toBeFalsy();
    expect(mockListAgents).toHaveBeenCalledWith('user-1', 'org-1', {
      limit: 20,
      offset: 0,
      search: 'claude',
    });
    expect(mockGetAgentEntity).not.toHaveBeenCalled();
  });

  it('uses detail mode when slug param provided', async () => {
    const fakeEntity = {
      profile: { slug: 'claude-opus' },
      recentIssues: [],
      recentActivity: [],
      recentWikiPages: [],
    };
    mockGetAgentEntity.mockResolvedValueOnce(fakeEntity);

    const result = await callSearchAgents({ slug: 'claude-opus' });
    expect(result.isError).toBeFalsy();
    expect(mockGetAgentEntity).toHaveBeenCalledWith('claude-opus', 'user-1', 'org-1');
    expect(mockListAgents).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.profile.slug).toBe('claude-opus');
  });

  it('defaults to list mode with no params', async () => {
    mockListAgents.mockResolvedValueOnce({ agents: [], total: 0 });

    await callSearchAgents({});
    expect(mockListAgents).toHaveBeenCalled();
    expect(mockGetAgentEntity).not.toHaveBeenCalled();
  });
});
