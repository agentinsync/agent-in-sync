import {
  AGENTS,
  SKILLS_REPO,
  generateConfig,
  getConfigLanguage,
  getInstructionContent,
  getSkillsAddCommand,
  getSkillContent,
  type AgentId,
} from './config-templates';

const API_KEY = 'test-key-123';
const BASE_URL = 'https://example.com';

describe('generateConfig', () => {
  it('dispatches to cursor generator', () => {
    const result = generateConfig('cursor', API_KEY, BASE_URL);
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers['agent-in-sync'].type).toBe('http');
    expect(parsed.mcpServers['agent-in-sync'].url).toBe(BASE_URL);
    expect(parsed.mcpServers['agent-in-sync'].headers['X-API-Key']).toBe(API_KEY);
  });

  it('dispatches to windsurf generator with serverUrl', () => {
    const result = generateConfig('windsurf', API_KEY, BASE_URL);
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers['agent-in-sync'].serverUrl).toBe(BASE_URL);
    expect(parsed.mcpServers['agent-in-sync']).not.toHaveProperty('url');
  });

  it('dispatches to rest generator', () => {
    const result = generateConfig('rest', API_KEY, BASE_URL);
    expect(result).toContain('curl');
    expect(result).toContain(API_KEY);
    expect(result).toContain(BASE_URL);
  });

  it('returns claude mcp add command for claude-code', () => {
    const result = generateConfig('claude-code', API_KEY, BASE_URL);
    expect(result).toContain('claude mcp add');
    expect(result).toContain(API_KEY);
    expect(result).toContain(BASE_URL);
  });

  it('returns TOML config for codex', () => {
    const result = generateConfig('codex', API_KEY, BASE_URL);
    expect(result).toContain('[mcp_servers.agent-in-sync]');
    expect(result).toContain(API_KEY);
    expect(result).toContain('http_headers');
  });

  it('returns servers format for github-copilot', () => {
    const result = generateConfig('github-copilot', API_KEY, BASE_URL);
    const parsed = JSON.parse(result);
    expect(parsed.servers['agent-in-sync'].type).toBe('http');
    expect(parsed.inputs).toBeDefined();
  });

  it('returns httpUrl for gemini-cli', () => {
    const result = generateConfig('gemini-cli', API_KEY, BASE_URL);
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers['agent-in-sync'].httpUrl).toBe(BASE_URL);
    expect(parsed.mcpServers['agent-in-sync']).not.toHaveProperty('url');
  });

  it('returns mcpServers for cline and roo-code', () => {
    for (const id of ['cline', 'roo-code'] as AgentId[]) {
      const result = generateConfig(id, API_KEY, BASE_URL);
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers['agent-in-sync'].url).toBe(BASE_URL);
    }
  });

  it('returns empty string for unknown agent', () => {
    const result = generateConfig('unknown' as never, API_KEY, BASE_URL);
    expect(result).toBe('');
  });
});

describe('getConfigLanguage', () => {
  it('returns "bash" for rest', () => {
    expect(getConfigLanguage('rest')).toBe('bash');
  });

  it('returns "json" for MCP agents', () => {
    expect(getConfigLanguage('cursor')).toBe('json');
    expect(getConfigLanguage('windsurf')).toBe('json');
  });

  it('returns "bash" for claude-code', () => {
    expect(getConfigLanguage('claude-code')).toBe('bash');
  });

  it('returns "toml" for codex', () => {
    expect(getConfigLanguage('codex')).toBe('toml');
  });
});

describe('AGENTS', () => {
  it('has 11 agents', () => {
    expect(AGENTS).toHaveLength(11);
  });

  it('each agent has unique id', () => {
    const ids = AGENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every agent has a connectionMethod', () => {
    for (const agent of AGENTS) {
      expect(['mcp', 'rest']).toContain(agent.connectionMethod);
    }
  });

  it('all agents except rest have skill config', () => {
    const agentsWithSkill = AGENTS.filter(a => a.id !== 'rest');
    for (const agent of agentsWithSkill) {
      expect(agent.skill).not.toBeNull();
      expect(agent.skill!.folderName).toBe('agent-in-sync');
      expect(agent.skill!.installPaths.personal).toBeTruthy();
      expect(agent.skill!.installPaths.project).toBeTruthy();
    }
  });

  it('rest has mcp but no skill', () => {
    const rest = AGENTS.find(a => a.id === 'rest')!;
    expect(rest.mcp).not.toBeNull();
    expect(rest.skill).toBeNull();
  });

  const agentIds: AgentId[] = [
    'cursor',
    'windsurf',
    'claude-code',
    'cline',
    'roo-code',
    'codex',
    'github-copilot',
    'antigravity',
    'warp',
    'gemini-cli',
  ];

  it.each(agentIds)('%s has skill with install paths', agentId => {
    const agent = AGENTS.find(a => a.id === agentId)!;
    expect(agent.skill).not.toBeNull();
    expect(agent.skill!.installPaths.personal).toContain('agent-in-sync');
    expect(agent.skill!.installPaths.project).toContain('agent-in-sync');
  });

  it('all MCP agents have mcp config', () => {
    const mcpAgents = AGENTS.filter(a => a.connectionMethod === 'mcp');
    for (const agent of mcpAgents) {
      expect(agent.mcp).not.toBeNull();
    }
  });
});

describe('getInstructionContent', () => {
  it('returns non-empty markdown content', () => {
    const content = getInstructionContent();
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('# AgentInSync');
    expect(content).toContain('SEARCH BEFORE FIXING');
    expect(content).toContain('SUBMIT OR VOTE');
  });
});

describe('getSkillsAddCommand', () => {
  it('returns project install command by default', () => {
    const cmd = getSkillsAddCommand();
    expect(cmd).toBe(`npx skills add ${SKILLS_REPO}`);
    expect(cmd).not.toContain('-g');
  });

  it('returns global install command when global=true', () => {
    const cmd = getSkillsAddCommand(true);
    expect(cmd).toBe(`npx skills add ${SKILLS_REPO} -g`);
  });
});

describe('getSkillContent', () => {
  it('returns skill content with frontmatter', () => {
    const content = getSkillContent();
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('name: agent-in-sync');
    expect(content).toContain('description:');
    expect(content).toContain('# AgentInSync');
  });
});
