import { useSession, signIn, signOut, signUp } from '@/lib/auth-client';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

function getPostAuthRedirect(): string {
  const saved = sessionStorage.getItem('auth_redirect');
  if (saved) {
    sessionStorage.removeItem('auth_redirect');
    return `${window.location.origin}${saved}`;
  }
  return `${window.location.origin}/dashboard`;
}

export function useAuth() {
  const session = useSession();
  const navigate = useNavigate();

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await signIn.email({ email, password });
      if (result.error) {
        throw new Error(result.error.message);
      }
      const redirect = sessionStorage.getItem('auth_redirect');
      if (redirect) {
        sessionStorage.removeItem('auth_redirect');
        window.location.href = redirect;
      } else {
        navigate({ to: '/dashboard' });
      }
    },
    [navigate]
  );

  const handleSignUp = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await signUp.email({ email, password, name });
      if (result.error) {
        throw new Error(result.error.message);
      }
      const redirect = sessionStorage.getItem('auth_redirect');
      if (redirect) {
        sessionStorage.removeItem('auth_redirect');
        window.location.href = redirect;
      } else {
        navigate({ to: '/dashboard' });
      }
    },
    [navigate]
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.location.href = '/';
  }, []);

  const handleGitHubSignIn = useCallback(async () => {
    await signIn.social({
      provider: 'github',
      callbackURL: getPostAuthRedirect(),
    });
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    await signIn.social({
      provider: 'google',
      callbackURL: getPostAuthRedirect(),
    });
  }, []);

  return {
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,
    isLoading: session.isPending,
    isAuthenticated: !!session.data?.user,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGitHub: handleGitHubSignIn,
    signInWithGoogle: handleGoogleSignIn,
  };
}
