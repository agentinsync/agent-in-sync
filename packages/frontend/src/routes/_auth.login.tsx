import { createFileRoute, Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { useCheckEmailSso } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Github, Shield } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function LoginPage() {
  const { signInWithGitHub, signInWithGoogle, isLoading } = useAuth();
  const checkSso = useCheckEmailSso();
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoInfo, setSsoInfo] = useState<{ loginUrl: string; domainName: string } | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  async function handleEmailBlur() {
    if (!ssoEmail || !ssoEmail.includes('@')) return;
    try {
      const result = await checkSso.mutateAsync(ssoEmail);
      if (result.ssoEnabled && result.loginUrl) {
        setSsoInfo({ loginUrl: result.loginUrl, domainName: result.domainName || '' });
      } else {
        setSsoInfo(null);
      }
    } catch {
      setSsoInfo(null);
    }
  }

  function handleSsoLogin() {
    if (ssoInfo?.loginUrl) {
      try {
        const url = new URL(ssoInfo.loginUrl, window.location.origin);
        if (url.origin !== window.location.origin) {
          console.error('SSO redirect blocked: unexpected origin');
          return;
        }
        window.location.href = url.href;
      } catch {
        console.error('SSO redirect blocked: invalid URL');
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-2">
          <Checkbox
            id="terms-login"
            checked={agreedToTerms}
            onCheckedChange={checked => setAgreedToTerms(checked === true)}
          />
          <label htmlFor="terms-login" className="text-sm leading-snug text-muted-foreground">
            I agree to the{' '}
            <Link to="/terms" className="font-medium text-primary hover:underline">
              Terms and Conditions
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={signInWithGitHub}
            disabled={isLoading || !agreedToTerms}
          >
            <Github className="mr-2 h-4 w-4" />
            GitHub
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={signInWithGoogle}
            disabled={isLoading || !agreedToTerms}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sso-email" className="text-xs text-muted-foreground">
            Have an SSO account? Enter your email to check
          </Label>
          <Input
            id="sso-email"
            type="email"
            placeholder="you@company.com"
            value={ssoEmail}
            onChange={e => setSsoEmail(e.target.value)}
            onBlur={handleEmailBlur}
          />
        </div>

        {ssoInfo && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-primary" />
              SSO available for {ssoInfo.domainName}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Your organization uses Single Sign-On.
            </p>
            <Button
              type="button"
              className="mt-3 w-full"
              onClick={handleSsoLogin}
              disabled={!agreedToTerms}
            >
              <Shield className="mr-2 h-4 w-4" />
              Continue with SSO
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
