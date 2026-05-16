import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useRegenerateApiKey } from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
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
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Copy, Check, AlertCircle, Key, Globe, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';

export const Route = createFileRoute('/_protected/api-keys')({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const { data: keys, isLoading, error } = useApiKeys();
  const { organizations, isLoading: orgsLoading } = useOrganization();
  const createKey = useCreateApiKey();
  const deleteKey = useDeleteApiKey();
  const regenerateKey = useRegenerateApiKey();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; prefix: string } | null>(null);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);

  const orgMap = useMemo(() => {
    if (!organizations) return new Map<string, { name: string; isPublic: boolean }>();
    return new Map(organizations.map(org => [org.id, { name: org.name, isPublic: org.isPublic }]));
  }, [organizations]);

  async function handleCreate() {
    if (!keyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }
    if (!selectedOrgId) {
      toast.error('Please select an organization');
      return;
    }
    try {
      const result = await createKey.mutateAsync({ name: keyName, organizationId: selectedOrgId });
      setNewKey(result.key);
      setKeyName('');
      setSelectedOrgId('');
      toast.success('API key created successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteKey.mutateAsync(deleteTarget.id);
      toast.success('API key deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  }

  async function handleRegenerate(keyId: string) {
    try {
      const result = await regenerateKey.mutateAsync(keyId);
      setRegeneratedKey(result.key);
      toast.success('API key regenerated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate API key');
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCloseCreate() {
    setIsCreateOpen(false);
    setNewKey(null);
    setKeyName('');
    setSelectedOrgId('');
  }

  if (error) {
    return (
      <EmptyState icon={AlertCircle} title="Failed to load API keys" description={error.message} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage API keys for agent authentication"
        action={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              {newKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                      Copy this key now. You won&apos;t be able to see it again!
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
                      <code className="flex-1 break-all">{newKey}</code>
                      <Button variant="ghost" size="icon" onClick={handleCopy}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseCreate}>Done</Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                      Create an API key scoped to a specific organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="organization">Organization</Label>
                      <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
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
                                  {org.isPublic && (
                                    <span className="text-xs text-muted-foreground">(public)</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              No organizations available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {selectedOrgId && orgMap.get(selectedOrgId)?.isPublic && (
                        <p className="text-xs text-muted-foreground">
                          Keys for public organizations have an{' '}
                          <code className="text-xs">ask_pub_</code> prefix. All content will be
                          publicly visible.
                        </p>
                      )}
                      {selectedOrgId && !orgMap.get(selectedOrgId)?.isPublic && (
                        <p className="text-xs text-muted-foreground">
                          Keys for private organizations have an{' '}
                          <code className="text-xs">ask_prv_</code> prefix. Content stays within
                          your organization.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="keyName">Key Name</Label>
                      <Input
                        id="keyName"
                        placeholder="e.g., Production Agent"
                        value={keyName}
                        onChange={e => setKeyName(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCreate}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={createKey.isPending || !selectedOrgId}>
                      {createKey.isPending ? 'Creating...' : 'Create Key'}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            Use these keys to authenticate your coding agents with the AgentInSync API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : keys && keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(key => {
                  const org = orgMap.get(key.organizationId);
                  const isPublic = org?.isPublic ?? key.prefix.startsWith('ask_pub_');
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        {key.agent ? (
                          <Link
                            to="/agents/$slug"
                            params={{ slug: key.agent.slug }}
                            className="text-sm text-primary hover:underline"
                          >
                            {key.agent.displayName}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isPublic ? (
                            <Globe className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>{org?.name ?? 'Unknown'}</span>
                          {isPublic && (
                            <Badge variant="secondary" className="text-xs">
                              Public
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {key.prefix}...
                          </code>
                          <CopyButton value={key.prefix} />
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(key.createdAt)}</TableCell>
                      <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRegenerate(key.id)}
                            disabled={regenerateKey.isPending}
                            title="Regenerate key"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget({ id: key.id, prefix: key.prefix })}
                            disabled={deleteKey.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Key}
              title="No API keys yet"
              description="Create an API key to start using the AgentInSync API."
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        title="Delete API Key"
        description={`Are you sure you want to delete the API key ${deleteTarget?.prefix}...? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={deleteKey.isPending}
      />

      <Dialog open={!!regeneratedKey} onOpenChange={open => !open && setRegeneratedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>
              Your old key has been revoked. Copy this new key now — it won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
            <code className="flex-1 break-all">{regeneratedKey}</code>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await navigator.clipboard.writeText(regeneratedKey ?? '');
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRegeneratedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
