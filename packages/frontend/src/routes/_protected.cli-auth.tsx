import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';
import { useApiKeys, useCreateOrganization } from '@/lib/api';
import { fetchApi } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Terminal,
  Check,
  AlertCircle,
  Loader2,
  Globe,
  Lock,
  Key,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  callback: z
    .string()
    .url()
    .refine(url => url.startsWith('http://localhost:'), {
      message: 'Callback must be a localhost URL',
    }),
  state: z.string().min(1),
});

export const Route = createFileRoute('/_protected/cli-auth')({
  validateSearch: search => searchSchema.parse(search),
  component: CliAuthPage,
});

type CreateKeyResponse = {
  id: string;
  key: string;
  prefix: string;
  organizationId: string;
};

function CliAuthPage() {
  const { callback, state } = Route.useSearch();
  const { user } = useAuth();
  const { organizations, isLoading: orgsLoading } = useOrganization();
  const { data: existingKeys, isLoading: keysLoading } = useApiKeys();

  const createOrgMutation = useCreateOrganization();

  const [tab, setTab] = useState<'create' | 'existing'>('create');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [newOrgName, setNewOrgName] = useState('');

  const existingKeyForOrg = useMemo(
    () => (selectedOrgId ? existingKeys?.find(k => k.organizationId === selectedOrgId) : undefined),
    [existingKeys, selectedOrgId]
  );

  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [pastedKey, setPastedKey] = useState('');

  useEffect(() => {
    if (organizations.length === 1 && !selectedOrgId) {
      setSelectedOrgId(organizations[0]!.id);
    }
  }, [organizations, selectedOrgId]);

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);
  const selectedExistingKey = useMemo(
    () => existingKeys?.find(k => k.id === selectedKeyId),
    [existingKeys, selectedKeyId]
  );

  const orgMap = useMemo(() => {
    if (!organizations) return new Map<string, string>();
    return new Map(organizations.map(org => [org.id, org.name]));
  }, [organizations]);

  const pastedKeyValid =
    selectedExistingKey && pastedKey.startsWith('ask_') && pastedKey.length > 10;

  function sendToCli(apiKey: string, orgId: string) {
    setStatus('sending');
    const params = new URLSearchParams({
      state,
      apiKey,
      organizationId: orgId,
      organizationName: orgMap.get(orgId) ?? selectedOrg?.name ?? '',
      email: user?.email ?? '',
    });
    // Navigate the browser to the CLI's local server — this is a GET navigation,
    // not a fetch(), so Chrome's Private Network Access policy does not apply.
    window.location.href = `${callback}?${params.toString()}`;
  }

  async function handleAuthorize() {
    if (!selectedOrgId || !user) return;

    setStatus('creating');
    try {
      let result: CreateKeyResponse;
      if (existingKeyForOrg) {
        result = await fetchApi<CreateKeyResponse>(`/keys/${existingKeyForOrg.id}/regenerate`, {
          method: 'POST',
        });
      } else {
        result = await fetchApi<CreateKeyResponse>('/keys', {
          method: 'POST',
          body: JSON.stringify({ name: 'CLI Setup', organizationId: selectedOrgId }),
        });
      }
      sendToCli(result.key, result.organizationId);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create API key');
    }
  }

  function handleSendExistingKey() {
    if (!selectedExistingKey || !pastedKeyValid) return;
    sendToCli(pastedKey, selectedExistingKey.organizationId);
  }

  const hasExistingKeys = existingKeys && existingKeys.length > 0;

  return (
    <div className="mx-auto mt-20 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            CLI Authentication
          </CardTitle>
          <CardDescription>
            The AgentInSync CLI is requesting access. Create a new key or use an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              Signed in as <span className="font-medium">{user.email}</span>
            </div>
          )}

          {/* Tab switcher */}
          {hasExistingKeys && (
            <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
              <button
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'create'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setTab('create')}
              >
                <Plus className="mr-1.5 inline h-3.5 w-3.5" />
                Create New Key
              </button>
              <button
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'existing'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setTab('existing')}
              >
                <Key className="mr-1.5 inline h-3.5 w-3.5" />
                Use Existing Key
              </button>
            </div>
          )}

          {tab === 'create' ? (
            <>
              <div className="space-y-2">
                <Label>Organization</Label>
                {orgsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading organizations...
                  </div>
                ) : organizations.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      You don&apos;t have a workspace yet. Create one to continue.
                    </p>
                    <Input
                      placeholder="Workspace name (e.g. Acme)"
                      value={newOrgName}
                      onChange={e => setNewOrgName(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      disabled={newOrgName.trim().length < 2 || createOrgMutation.isPending}
                      onClick={() => {
                        const name = newOrgName.trim();
                        const slug = name
                          .toLowerCase()
                          .replace(/[^a-z0-9]/g, '-')
                          .replace(/-+/g, '-')
                          .replace(/^-|-$/g, '')
                          .slice(0, 50);
                        createOrgMutation.mutate({ name, slug });
                      }}
                    >
                      {createOrgMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Create workspace
                        </>
                      )}
                    </Button>
                    {createOrgMutation.isError && (
                      <p className="text-sm text-destructive">
                        {createOrgMutation.error instanceof Error
                          ? createOrgMutation.error.message
                          : 'Failed to create workspace'}
                      </p>
                    )}
                  </div>
                ) : (
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map(org => (
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
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {status === 'error' && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mr-1.5 inline h-4 w-4" />
                  {errorMsg}
                </div>
              )}

              {selectedOrgId && existingKeyForOrg && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <div className="flex items-center gap-2 font-medium">
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    You already have a key for this organization
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    Clicking Authorize will revoke <code>{existingKeyForOrg.prefix}...</code> and
                    issue a new key for the same agent.
                  </p>
                </div>
              )}

              {status === 'done' ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  Authorized! Switch back to your terminal.
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleAuthorize}
                  disabled={!selectedOrgId || status === 'creating' || status === 'sending'}
                >
                  {status === 'creating' || status === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {status === 'creating'
                        ? existingKeyForOrg
                          ? 'Regenerating key...'
                          : 'Creating API key...'
                        : 'Authorizing...'}
                    </>
                  ) : existingKeyForOrg ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate & Authorize
                    </>
                  ) : (
                    'Authorize CLI'
                  )}
                </Button>
              )}

              <p className="text-xs text-muted-foreground">
                {existingKeyForOrg
                  ? 'This will revoke your existing key and send a new one to the CLI.'
                  : 'This will create an API key and send it to the CLI running on your machine.'}
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select a key</Label>
                {keysLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading keys...
                  </div>
                ) : (
                  <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an existing key" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingKeys?.map(key => (
                        <SelectItem key={key.id} value={key.id}>
                          <div className="flex items-center gap-2">
                            <Key className="h-3 w-3 text-muted-foreground" />
                            <span>{key.name}</span>
                            <code className="text-xs text-muted-foreground">{key.prefix}...</code>
                            <span className="text-xs text-muted-foreground">
                              {orgMap.get(key.organizationId) ?? ''}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedExistingKey && (
                <div className="space-y-2">
                  <Label>Paste the full key value</Label>
                  <Input
                    placeholder={`${selectedExistingKey.prefix}...`}
                    value={pastedKey}
                    onChange={e => setPastedKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    We don't store full keys. You need the key you saved when you created it.
                  </p>
                </div>
              )}

              {status === 'done' ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  Authorized! Switch back to your terminal.
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleSendExistingKey}
                  disabled={!pastedKeyValid || status === 'sending'}
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authorizing...
                    </>
                  ) : (
                    'Send to CLI'
                  )}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
