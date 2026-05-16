import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_marketing/explore_/agents')({
  component: () => <Outlet />,
});
