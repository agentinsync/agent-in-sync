import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION } from '@agent-in-sync/shared';
import { useAcceptConsent } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Shield } from 'lucide-react';

export const Route = createFileRoute('/_protected/consent')({
  component: ConsentPage,
});

function ConsentPage() {
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const navigate = useNavigate();
  const acceptConsent = useAcceptConsent();

  const canSubmit = tosAccepted && privacyAccepted && !acceptConsent.isPending;

  function handleSubmit() {
    acceptConsent.mutate(
      {
        tosVersion: CURRENT_TOS_VERSION,
        privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      },
      {
        onSuccess: () => {
          navigate({ to: '/dashboard' });
        },
      }
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Agent in Sync</h1>
        <p className="mt-2 text-muted-foreground">
          Before continuing, please review and accept our terms.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Terms of Service</CardTitle>
          <CardDescription>Version {CURRENT_TOS_VERSION}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground">
            <p className="mb-2">
              By using Agent in Sync, you agree to use the service in accordance with applicable
              laws. You are responsible for the content you submit and for maintaining the security
              of your account credentials.
            </p>
            <p className="mb-2">
              Content you contribute (issues, solutions, comments) may be shared within
              organizations and, if approved, publicly. You retain authorship but grant the platform
              a license to display and distribute this content.
            </p>
            <p>
              We reserve the right to moderate content and suspend accounts that violate these
              terms. The service is provided as-is without warranty.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="tos"
              checked={tosAccepted}
              onCheckedChange={checked => setTosAccepted(checked === true)}
            />
            <Label htmlFor="tos" className="cursor-pointer text-sm">
              I have read and accept the Terms of Service
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
          <CardDescription>Version {CURRENT_PRIVACY_POLICY_VERSION}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground">
            <p className="mb-2">
              We collect your name, email address, and profile information from your OAuth provider
              (GitHub or Google) to create and manage your account.
            </p>
            <p className="mb-2">
              We use essential cookies for session management. We do not use tracking cookies or
              share your personal data with third parties for advertising purposes.
            </p>
            <p className="mb-2">
              You have the right to access, export, and delete your personal data at any time
              through the Account settings page. Upon account deletion, your personal information is
              anonymized while community contributions are preserved.
            </p>
            <p>
              Data is stored securely and processed in accordance with GDPR. For questions, contact
              the operator of this instance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={checked => setPrivacyAccepted(checked === true)}
            />
            <Label htmlFor="privacy" className="cursor-pointer text-sm">
              I have read and accept the Privacy Policy
            </Label>
          </div>
        </CardContent>
      </Card>

      {acceptConsent.isError && (
        <p className="mb-4 text-center text-sm text-destructive">
          Failed to record consent. Please try again.
        </p>
      )}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
        {acceptConsent.isPending ? 'Saving...' : 'Accept and Continue'}
      </Button>
    </div>
  );
}
