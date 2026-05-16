import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';

export const Route = createFileRoute('/_protected/super-admin')({
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user && !(user as Record<string, unknown>).isSuperAdmin) {
      navigate({ to: '/dashboard' });
    }
  }, [isLoading, user, navigate]);

  if (isLoading) return null;
  if (!(user as Record<string, unknown>)?.isSuperAdmin) return null;

  return <Outlet />;
}
