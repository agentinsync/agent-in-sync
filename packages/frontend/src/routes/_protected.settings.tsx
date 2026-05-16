import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useDomainInfo,
  useRequestDnsVerification,
  useCheckDnsVerification,
  useSsoConfig,
  useUpdateSsoConfig,
  useDeleteSsoConfig,
} from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { CopyButton } from '@/components/copy-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Settings, Globe, Shield, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: domainInfo, isLoading } = useDomainInfo();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Domain and SSO configuration" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!domainInfo?.hasDomain || !domainInfo.domain) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Domain and SSO configuration" />
        <EmptyState
          icon={Globe}
          title="No domain associated"
          description="Sign in with a corporate email address to access domain settings. Public email domains (gmail, etc.) are not supported."
        />
      </div>
    );
  }

  if (!domainInfo.domain.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Domain and SSO configuration" />
        <EmptyState
          icon={Settings}
          title="Not a domain administrator"
          description="Only domain administrators can manage domain settings."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Domain: ${domainInfo.domain.name}`} />
      <DomainVerificationSection
        domainName={domainInfo.domain.name}
        status={domainInfo.domain.status}
      />
      <SsoConfigSection domainName={domainInfo.domain.name} />
    </div>
  );
}

function DomainVerificationSection({ domainName, status }: { domainName: string; status: string }) {
  const requestVerification = useRequestDnsVerification();
  const { data: verificationData, refetch } = useCheckDnsVerification(domainName);

  async function handleRequestVerification() {
    try {
      await requestVerification.mutateAsync(domainName);
      await refetch();
      toast.success('Verification requested');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request verification');
    }
  }

  async function handleCheckVerification() {
    const result = await refetch();
    if (result.data?.dnsVerified) {
      toast.success('Domain verified successfully');
    } else {
      toast.info('DNS record not found yet. It may take time to propagate.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Domain Verification
        </CardTitle>
        <CardDescription>Verify domain ownership via DNS TXT record</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{domainName}</span>
          <StatusBadge variant={status === 'verified' ? 'verified' : 'pending'}>
            {status === 'verified' ? 'Verified' : 'Pending'}
          </StatusBadge>
        </div>

        {status !== 'verified' && (
          <>
            {verificationData?.verificationToken ? (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm">Add this DNS TXT record to your domain:</p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Record Type</Label>
                    <p className="font-mono text-sm">TXT</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-sm">
                        {verificationData.dnsRecordName || `_agentinsync.${domainName}`}
                      </code>
                      <CopyButton
                        value={verificationData.dnsRecordName || `_agentinsync.${domainName}`}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Value</Label>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-sm break-all">
                        {verificationData.dnsRecordValue || verificationData.verificationToken}
                      </code>
                      <CopyButton
                        value={
                          verificationData.dnsRecordValue || verificationData.verificationToken
                        }
                      />
                    </div>
                  </div>
                </div>
                <Button variant="outline" onClick={handleCheckVerification}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Check Verification
                </Button>
              </div>
            ) : (
              <Button onClick={handleRequestVerification} disabled={requestVerification.isPending}>
                {requestVerification.isPending ? 'Requesting...' : 'Start Verification'}
              </Button>
            )}
          </>
        )}

        {status === 'verified' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Domain ownership verified
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SsoConfigSection({ domainName }: { domainName: string }) {
  const { data: ssoData, isLoading } = useSsoConfig(domainName);
  const updateSso = useUpdateSsoConfig();
  const deleteSso = useDeleteSsoConfig();

  const [idpEntityId, setIdpEntityId] = useState('');
  const [idpSsoUrl, setIdpSsoUrl] = useState('');
  const [idpCertificate, setIdpCertificate] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isConfigured = ssoData?.enabled;

  async function handleSave() {
    if (!idpEntityId.trim() || !idpSsoUrl.trim() || !idpCertificate.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      await updateSso.mutateAsync({
        domainName,
        config: { idpEntityId, idpSsoUrl, idpCertificate },
      });
      toast.success('SSO configuration saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SSO config');
    }
  }

  async function handleDelete() {
    try {
      await deleteSso.mutateAsync(domainName);
      toast.success('SSO disabled');
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable SSO');
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            SAML SSO Configuration
          </CardTitle>
          <CardDescription>Configure single sign-on for your domain</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConfigured && ssoData.config && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">SSO is enabled</span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">SP Entity ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-xs break-all">
                      {ssoData.config.spEntityId}
                    </code>
                    <CopyButton value={ssoData.config.spEntityId} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SP ACS URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-xs break-all">
                      {ssoData.config.spAcsUrl}
                    </code>
                    <CopyButton value={ssoData.config.spAcsUrl} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SP Metadata URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-xs break-all">
                      {ssoData.config.spMetadataUrl}
                    </code>
                    <CopyButton value={ssoData.config.spMetadataUrl} />
                  </div>
                </div>
              </div>
              <Separator />
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                Disable SSO
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">
              {isConfigured ? 'Update' : 'Configure'} Identity Provider
            </h3>
            <div className="space-y-2">
              <Label htmlFor="idpEntityId">IdP Entity ID</Label>
              <Input
                id="idpEntityId"
                placeholder="https://idp.example.com/entity-id"
                value={idpEntityId}
                onChange={e => setIdpEntityId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idpSsoUrl">IdP SSO URL</Label>
              <Input
                id="idpSsoUrl"
                placeholder="https://idp.example.com/sso/saml"
                value={idpSsoUrl}
                onChange={e => setIdpSsoUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idpCertificate">IdP Certificate (PEM)</Label>
              <Textarea
                id="idpCertificate"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows={4}
                className="font-mono text-xs"
                value={idpCertificate}
                onChange={e => setIdpCertificate(e.target.value)}
              />
            </div>
            <Button onClick={handleSave} disabled={updateSso.isPending}>
              {updateSso.isPending
                ? 'Saving...'
                : isConfigured
                  ? 'Update Configuration'
                  : 'Enable SSO'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Disable SSO"
        description="Are you sure you want to disable SSO? Users will need to sign in with email/password or OAuth."
        confirmLabel="Disable SSO"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={deleteSso.isPending}
      />
    </>
  );
}
