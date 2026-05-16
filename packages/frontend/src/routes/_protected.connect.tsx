import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApiKeys, useCreateApiKey } from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import {
  AGENTS,
  CLI_SETUP_COMMAND,
  CLI_INSTALL_COMMAND,
  getConfigLanguage,
  getSkillContent,
  getInstructionContent,
  type AgentId,
  type AgentInfo,
} from '@/lib/config-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/copy-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Download,
  Plus,
  Globe,
  Lock,
  Check,
  Terminal,
  Apple,
  Monitor,
  Zap,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  HelpCircle,
  Plug,
  BookOpen,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_protected/connect')({
  component: ConnectPage,
});

const MCP_BASE_URL = import.meta.env.VITE_MCP_URL || `${window.location.origin}/mcp`;
const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

type LocalAgentId = AgentId | 'other';
type WizardStep = 1 | 2;

const AGENT_META: Record<string, { abbr: string; bg: string }> = {
  cursor: { abbr: 'CU', bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
  windsurf: { abbr: 'WS', bg: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)' },
  'claude-code': { abbr: 'CC', bg: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)' },
  cline: { abbr: 'CL', bg: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' },
  'roo-code': { abbr: 'RC', bg: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' },
  codex: { abbr: 'CX', bg: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' },
  'github-copilot': { abbr: 'GH', bg: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' },
  antigravity: { abbr: 'AG', bg: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' },
  warp: { abbr: 'WP', bg: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)' },
  'gemini-cli': { abbr: 'GC', bg: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' },
  rest: { abbr: 'API', bg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' },
  other: { abbr: '?', bg: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)' },
};

function getAgentMeta(id: string) {
  return (
    AGENT_META[id] ?? {
      abbr: id.slice(0, 2).toUpperCase(),
      bg: 'linear-gradient(135deg, #64748b, #475569)',
    }
  );
}

// Synthetic "Other" agent — uses cursor's MCP config format as a universal template
const cursorAgent = AGENTS.find(a => a.id === 'cursor')!;
const OTHER_AGENT = {
  id: 'other' as LocalAgentId,
  name: 'Other Agent',
  description: 'Any MCP-compatible AI coding agent',
  connectionMethod: 'mcp' as const,
  mcp: cursorAgent.mcp,
  skill: null,
};

function ConnectPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedAgent, setSelectedAgent] = useState<LocalAgentId | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const agentInfo: LocalAgent | null =
    selectedAgent === 'other'
      ? OTHER_AGENT
      : selectedAgent
        ? ((AGENTS.find(a => a.id === selectedAgent) as LocalAgent | undefined) ?? null)
        : null;

  function handleAgentSelect(agentId: LocalAgentId) {
    setSelectedAgent(agentId);
    setCreatedKey(null);
    setStep(2);
  }

  function handleBack() {
    setStep(1);
    setCreatedKey(null);
  }

  return (
    <div className="relative space-y-8 pb-12">
      {/* Dot-grid atmosphere */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 opacity-[0.035] dark:opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1.5px, transparent 1.5px)',
          backgroundSize: '28px 28px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, hsl(220 70% 50% / 0.08), transparent)',
        }}
      />

      {/* Hero header */}
      <div className="pt-2 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          <Plug className="h-3 w-3" />
          Agent Setup
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Connect Your Agent
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Set up AgentInSync in your AI coding agent in minutes
        </p>
      </div>

      <StepIndicator currentStep={step} />

      {step === 1 && <StepChooseAgent onSelect={handleAgentSelect} selectedAgent={selectedAgent} />}

      {step === 2 && agentInfo && (
        <StepConnect
          agent={agentInfo}
          onBack={handleBack}
          createdKey={createdKey}
          onKeyCreated={key => setCreatedKey(key)}
        />
      )}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: 'Choose Agent' },
    { num: 2, label: 'Connect' },
  ] as const;

  return (
    <div className="flex items-start justify-center gap-0">
      {steps.map((s, i) => {
        const isDone = currentStep > s.num;
        const isCurrent = currentStep === s.num;

        return (
          <div key={s.num} className="flex items-start">
            {i > 0 && (
              <div
                className="mt-[18px] h-px w-20 transition-colors duration-500 sm:w-32"
                style={{ background: isDone ? 'hsl(220 70% 50%)' : 'hsl(220 12% 85%)' }}
              />
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
                  (isDone || isCurrent) && 'bg-primary text-primary-foreground',
                  !isDone && !isCurrent && 'border-2 border-border bg-card text-muted-foreground'
                )}
                style={
                  isCurrent
                    ? {
                        boxShadow:
                          '0 0 0 4px hsl(220 70% 50% / 0.15), 0 0 16px hsl(220 70% 50% / 0.25)',
                      }
                    : undefined
                }
              >
                {isDone ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={cn(
                  'text-xs font-medium transition-colors',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepChooseAgent({
  onSelect,
  selectedAgent,
}: {
  onSelect: (id: LocalAgentId) => void;
  selectedAgent: LocalAgentId | null;
}) {
  const mcpAgents = AGENTS.filter(a => a.connectionMethod === 'mcp');
  const restAgents = AGENTS.filter(a => a.connectionMethod === 'rest');

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <AgentGroup label="MCP Agents">
        {mcpAgents.map(agent => (
          <AgentRow
            key={agent.id}
            id={agent.id}
            name={agent.name}
            method="mcp"
            isSelected={selectedAgent === agent.id}
            onClick={() => onSelect(agent.id)}
          />
        ))}
        <AgentRow
          id="other"
          name="Other Agent"
          method="mcp"
          isSelected={selectedAgent === 'other'}
          onClick={() => onSelect('other')}
        />
      </AgentGroup>

      <AgentGroup label="Direct Integration">
        {restAgents.map(agent => (
          <AgentRow
            key={agent.id}
            id={agent.id}
            name={agent.name}
            method="rest"
            isSelected={selectedAgent === agent.id}
            onClick={() => onSelect(agent.id)}
          />
        ))}
      </AgentGroup>
    </div>
  );
}

function AgentGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </div>
  );
}

function AgentRow({
  id,
  name,
  method,
  isSelected,
  onClick,
}: {
  id: LocalAgentId;
  name: string;
  method: 'mcp' | 'rest';
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = getAgentMeta(id);

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      {/* Color dot */}
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
        style={{ background: meta.bg }}
      />

      <span className="flex-1 text-sm font-medium text-foreground">
        {name}
        {id === 'other' && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            — any MCP-compatible agent
          </span>
        )}
      </span>

      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {method}
      </span>

      {isSelected ? (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

type LocalAgent = Omit<AgentInfo, 'id'> & { id: LocalAgentId };

function StepConnect({
  agent,
  onBack,
  createdKey,
  onKeyCreated,
}: {
  agent: LocalAgent;
  onBack: () => void;
  createdKey: string | null;
  onKeyCreated: (key: string) => void;
}) {
  const isRest = agent.connectionMethod === 'rest';
  const isOther = (agent.id as string) === 'other';
  const meta = getAgentMeta(agent.id);

  return (
    <div className="space-y-6">
      {/* Back + agent identity */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow"
            style={{ background: meta.bg }}
          >
            {meta.abbr}
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">{agent.name}</h2>
            <p className="text-xs text-muted-foreground">{agent.description}</p>
          </div>
        </div>
      </div>

      {/* Auto setup — CLI card (not for REST or Other) */}
      {!isRest && !isOther && (
        <div
          className="rounded-2xl border border-primary/20 p-5"
          style={{
            background:
              'linear-gradient(135deg, hsl(220 70% 50% / 0.05) 0%, hsl(220 70% 50% / 0.1) 100%)',
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[10px] font-semibold uppercase tracking-wider"
            >
              Recommended
            </Badge>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Automatic Setup
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Run this command to auto-detect your agent, authenticate, and write the config
          </p>
          <TerminalBlock value={CLI_SETUP_COMMAND} />
        </div>
      )}

      {!isRest && !isOther && (
        <div className="relative flex items-center">
          <div className="flex-grow border-t" />
          <span className="mx-4 shrink-0 text-xs font-medium text-muted-foreground">
            or configure manually
          </span>
          <div className="flex-grow border-t" />
        </div>
      )}

      {isOther && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Add the MCP config below to your agent's config file, then paste the rule and skill
              into the appropriate locations in your project.
            </p>
          </div>
        </div>
      )}

      {agent.mcp && (
        <ManualSetupCard agent={agent} createdKey={createdKey} onKeyCreated={onKeyCreated} />
      )}

      {isOther && <OtherAgentExtras />}
    </div>
  );
}

function OtherAgentExtras() {
  const ruleContent = getInstructionContent();
  const skillContent = getSkillContent();

  return (
    <div className="space-y-4">
      <CopyableBlock
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title="Rule"
        description="Add to your agent's rules directory (e.g. .cursor/rules/ or .claude/rules/)"
        value={ruleContent}
        filename="agent-in-sync.md"
      />
      <CopyableBlock
        icon={<Wrench className="h-4 w-4 text-primary" />}
        title="Skill"
        description="Add to your agent's skills directory (e.g. .cursor/skills/ or .claude/skills/)"
        value={skillContent}
        filename="agent-in-sync-skill.md"
      />
    </div>
  );
}

function CopyableBlock({
  icon,
  title,
  description,
  value,
  filename,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string;
  filename: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <CopyButton value={value} />
      </div>
      <div className="relative overflow-hidden bg-[hsl(220_25%_8%)] dark:bg-[hsl(220_25%_5%)]">
        <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-2">
          <div className="h-2 w-2 rounded-full bg-[#ff5f57]" />
          <div className="h-2 w-2 rounded-full bg-[#febc2e]" />
          <div className="h-2 w-2 rounded-full bg-[#28c840]" />
          <span className="ml-1 text-[10px] font-medium text-white/30">{filename}</span>
        </div>
        <pre className="max-h-48 overflow-auto px-4 py-3 text-xs text-white/75">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
}

function TerminalBlock({ value, filename }: { value: string; filename?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-[hsl(220_25%_8%)] dark:bg-[hsl(220_25%_5%)]">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        {filename && <span className="ml-1 text-[10px] font-medium text-white/30">{filename}</span>}
        <CopyButton
          value={value}
          className="absolute right-2 top-1.5 text-white/40 hover:text-white/80"
        />
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs sm:text-sm">
        <code>
          <span className="text-[#7dd3fc]">$</span>
          <span className="text-white/90"> {value}</span>
        </code>
      </pre>
    </div>
  );
}

function ManualSetupCard({
  agent,
  createdKey,
  onKeyCreated,
}: {
  agent: LocalAgent;
  createdKey: string | null;
  onKeyCreated: (key: string) => void;
}) {
  const { data: keys, isLoading: keysLoading } = useApiKeys();
  const { organizations, isLoading: orgsLoading } = useOrganization();
  const createKey = useCreateApiKey();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState(agent.name);
  const [newKeyOrgId, setNewKeyOrgId] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');

  const isRest = agent.connectionMethod === 'rest';

  // Auto-select if exactly one key exists
  useEffect(() => {
    const first = keys?.[0];
    if (keys?.length === 1 && first && !selectedKeyId) {
      setSelectedKeyId(first.id);
    }
  }, [keys, selectedKeyId]);

  // Auto-open create dialog if no keys exist
  useEffect(() => {
    if (keys && keys.length === 0 && !isCreateOpen) {
      setIsCreateOpen(true);
    }
  }, [keys]); // intentionally omits isCreateOpen to only trigger on initial load

  const orgMap = useMemo(() => {
    if (!organizations) return new Map<string, { name: string; isPublic: boolean }>();
    return new Map(organizations.map(org => [org.id, { name: org.name, isPublic: org.isPublic }]));
  }, [organizations]);

  const selectedKey = useMemo(() => keys?.find(k => k.id === selectedKeyId), [keys, selectedKeyId]);

  const displayKey = createdKey || (selectedKey ? `${selectedKey.prefix}...your-full-key...` : '');

  const config = useMemo(() => {
    if (!displayKey || !agent.mcp) return '';
    const baseUrl = isRest ? API_BASE_URL : MCP_BASE_URL;
    return agent.mcp.generateConfig(displayKey, baseUrl);
  }, [agent, displayKey, isRest]);

  const handleCreateKey = useCallback(async () => {
    if (!newKeyName.trim() || !newKeyOrgId) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      const result = await createKey.mutateAsync({ name: newKeyName, organizationId: newKeyOrgId });
      onKeyCreated(result.key);
      setSelectedKeyId(result.id);
      setIsCreateOpen(false);
      setNewKeyName(agent.name);
      setNewKeyOrgId('');
      toast.success('API key created!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    }
  }, [newKeyName, newKeyOrgId, createKey, onKeyCreated, agent.name]);

  function handleDownload() {
    if (!config || !agent.mcp?.configFileName) return;
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = agent.mcp.configFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${agent.mcp.configFileName}`);
  }

  return (
    <>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div>
          <h3 className="font-heading text-base font-semibold">
            {isRest ? 'API Configuration' : 'Manual Setup'}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isRest
              ? 'Use these curl commands to interact with the API'
              : agent.mcp?.configFileName
                ? `Add this configuration to your ${agent.mcp.configFileName}`
                : 'Run this command to configure the MCP server'}
          </p>
        </div>

        {/* API Key selection */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            API Key
          </Label>
          <div className="flex gap-2">
            {keysLoading ? (
              <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border bg-muted px-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an API key" />
                </SelectTrigger>
                <SelectContent>
                  {keys && keys.length > 0 ? (
                    keys.map(key => {
                      const org = orgMap.get(key.organizationId);
                      const isPublic = org?.isPublic ?? key.prefix.startsWith('ask_pub_');
                      return (
                        <SelectItem key={key.id} value={key.id}>
                          <div className="flex items-center gap-2">
                            {isPublic ? (
                              <Globe className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span>{key.name}</span>
                            <code className="text-xs text-muted-foreground">{key.prefix}...</code>
                          </div>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem value="none" disabled>
                      No API keys — create one below
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCreateOpen(true)}
              title="Create new API key"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {createdKey && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Save this key now — it cannot be retrieved after you leave this page.
            </div>
          )}

          {selectedKey && !createdKey && (
            <p className="text-xs text-muted-foreground">
              Config uses the key prefix as a placeholder. You'll need the full key you saved when
              you created it.
            </p>
          )}
        </div>

        {/* Config preview */}
        {!displayKey ? (
          <div className="flex h-28 items-center justify-center rounded-xl border border-dashed">
            <p className="text-xs text-muted-foreground">
              Select or create an API key to generate configuration
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-[hsl(220_25%_8%)] dark:bg-[hsl(220_25%_5%)]">
            <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-1 text-[10px] font-medium text-white/30">
                {agent.mcp?.configFileName ?? 'config'}
              </span>
              <div className="absolute right-2 top-1.5 flex gap-1">
                <CopyButton value={config} className="text-white/40 hover:text-white/80" />
                {agent.mcp?.configFileName && !agent.mcp.uiOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/40 hover:bg-white/10 hover:text-white/80"
                    onClick={handleDownload}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <pre className="max-h-64 overflow-auto px-4 py-3 text-xs text-white/80 sm:text-sm">
              <code className={`language-${getConfigLanguage(agent.id as AgentId)}`}>{config}</code>
            </pre>
          </div>
        )}

        {/* Config file paths — open by default */}
        {displayKey && agent.mcp && agent.mcp.configPaths.macos && (
          <Accordion type="single" collapsible defaultValue="paths">
            <AccordionItem value="paths" className="border-none">
              <AccordionTrigger className="rounded-lg px-3 py-2 text-xs font-medium hover:bg-muted hover:no-underline">
                {agent.mcp.uiOnly ? 'Where to paste this config' : 'Config file location'}
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-2 pt-1">
                {agent.mcp.uiOnly ? (
                  <p className="text-sm text-muted-foreground">{agent.mcp.configPaths.macos}</p>
                ) : (
                  <div className="space-y-2">
                    <ConfigPath
                      icon={<Apple className="h-3.5 w-3.5" />}
                      label="macOS"
                      path={agent.mcp.configPaths.macos}
                    />
                    <ConfigPath
                      icon={<Terminal className="h-3.5 w-3.5" />}
                      label="Linux"
                      path={agent.mcp.configPaths.linux}
                    />
                    <ConfigPath
                      icon={<Monitor className="h-3.5 w-3.5" />}
                      label="Windows"
                      path={agent.mcp.configPaths.windows}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* What's Next — install command */}
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Terminal className="h-4 w-4 text-primary" />
            Re-install Skills &amp; Rules
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Run this in any project to install the AgentInSync skill and rules
          </p>
          <TerminalBlock value={CLI_INSTALL_COMMAND} />
        </div>
      </div>

      {/* Create key dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Create a new API key for {agent.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyOrg">Organization</Label>
              <Select value={newKeyOrgId} onValueChange={setNewKeyOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgsLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : organizations && organizations.length > 0 ? (
                    organizations.map(org => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          {org.isPublic ? (
                            <Globe className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>{org.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No organizations
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="keyName">Key Name</Label>
              <Input
                id="keyName"
                placeholder={`e.g., ${agent.name}`}
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={createKey.isPending}>
              {createKey.isPending ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfigPath({
  icon,
  label,
  path,
}: {
  icon: React.ReactNode;
  label: string;
  path: string | undefined;
}) {
  if (!path) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-14 shrink-0 font-medium">{label}</span>
      <code className="rounded bg-muted px-2 py-0.5 text-xs">{path}</code>
    </div>
  );
}
