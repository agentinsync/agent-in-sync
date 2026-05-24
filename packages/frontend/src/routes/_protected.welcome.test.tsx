import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, userEvent } from '@/test-utils';
import { WelcomePage } from './_protected.welcome';
import * as orgsApi from '@/lib/api/organizations';

const navigate = vi.fn();

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router');
  return {
    ...(actual as object),
    useNavigate: () => navigate,
    createFileRoute: () => () => ({}),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mockHooks({
  available = [],
  myOrgs = [],
  domain = null,
  joinMutateAsync = vi.fn().mockResolvedValue({}),
}: {
  available?: Array<{ id: string; name: string; slug: string; memberCount: number }>;
  myOrgs?: Array<{ id: string; name: string; isPublic: boolean; domainId: string | null }>;
  domain?: { id: string; name: string; status: string } | null;
  joinMutateAsync?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.spyOn(orgsApi, 'useAvailableOrganizations').mockReturnValue({
    data: available,
    isLoading: false,
  } as ReturnType<typeof orgsApi.useAvailableOrganizations>);

  vi.spyOn(orgsApi, 'useMyOrganizations').mockReturnValue({
    data: myOrgs,
    isLoading: false,
  } as ReturnType<typeof orgsApi.useMyOrganizations>);

  vi.spyOn(orgsApi, 'useDomainInfo').mockReturnValue({
    data: domain
      ? {
          hasDomain: true,
          domain: {
            id: domain.id,
            name: domain.name,
            status: domain.status,
            isAdmin: false,
            memberCount: 1,
            organizationCount: 1,
            canCreateOrganization: true,
            maxOrganizations: 5,
          },
        }
      : { hasDomain: false, domain: null },
  } as ReturnType<typeof orgsApi.useDomainInfo>);

  vi.spyOn(orgsApi, 'useJoinOrganization').mockReturnValue({
    mutateAsync: joinMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof orgsApi.useJoinOrganization>);
}

describe('WelcomePage', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to dashboard when there are no available organizations', async () => {
    mockHooks({ available: [], myOrgs: [] });
    render(<WelcomePage />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: '/dashboard', replace: true });
    });
  });

  it('shows auto-joined orgs and available orgs to choose from', () => {
    mockHooks({
      myOrgs: [
        { id: 'pub', name: 'Public', isPublic: true, domainId: null },
        { id: 'def', name: 'Acme', isPublic: false, domainId: 'd1' },
      ],
      available: [
        { id: 'team-a', name: 'Team A', slug: 'team-a', memberCount: 5 },
        { id: 'team-b', name: 'Team B', slug: 'team-b', memberCount: 12 },
      ],
      domain: { id: 'd1', name: 'acme.com', status: 'verified' },
    });

    render(<WelcomePage />);

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getAllByText(/acme\.com/i).length).toBeGreaterThan(0);
  });

  it('skips without joining when "Skip for now" is clicked', async () => {
    const join = vi.fn().mockResolvedValue({});
    mockHooks({
      available: [{ id: 'team-a', name: 'Team A', slug: 'team-a', memberCount: 5 }],
      joinMutateAsync: join,
    });

    render(<WelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));

    expect(join).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' });
  });

  it('joins selected orgs and navigates to dashboard', async () => {
    const join = vi.fn().mockResolvedValue({});
    mockHooks({
      available: [
        { id: 'team-a', name: 'Team A', slug: 'team-a', memberCount: 5 },
        { id: 'team-b', name: 'Team B', slug: 'team-b', memberCount: 12 },
      ],
      joinMutateAsync: join,
    });

    render(<WelcomePage />);
    await userEvent.click(screen.getByLabelText(/Team A/));
    await userEvent.click(screen.getByRole('button', { name: /Join 1 and continue/i }));

    await waitFor(() => {
      expect(join).toHaveBeenCalledWith('team-a');
      expect(join).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });
  });
});
