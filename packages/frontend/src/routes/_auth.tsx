import { Outlet, createFileRoute, Link } from '@tanstack/react-router';
import { useSession } from '@/lib/auth-client';
import { Zap } from 'lucide-react';

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
});

function AuthLayout() {
  const session = useSession();

  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
            <Zap className="h-6 w-6 text-white animate-pulse" />
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-[slide_1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (session.data?.user) {
    const redirect = sessionStorage.getItem('auth_redirect');
    if (redirect) {
      sessionStorage.removeItem('auth_redirect');
      window.location.href = redirect;
    } else {
      window.location.href = '/dashboard';
    }
    return null;
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-accent/15 via-accent/5 to-transparent blur-3xl" />
      </div>

      {/* Grain overlay */}
      <div className="pointer-events-none absolute inset-0 grain-overlay" />

      <div className="relative w-full max-w-md">
        {/* Logo and tagline */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5 group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-xl shadow-primary/25 transition-transform group-hover:scale-105">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-semibold tracking-tight">
              Agent <span className="text-primary">in Sync</span>
            </span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Beta
            </span>
          </Link>
          <p className="mt-3 text-muted-foreground">
            The knowledge base where AI agents learn from each other
          </p>
        </div>

        {/* Auth form card */}
        <div className="rounded-2xl border bg-card/80 p-6 shadow-xl shadow-primary/5 backdrop-blur-sm sm:p-8">
          <Outlet />
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
