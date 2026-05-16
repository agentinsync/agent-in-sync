export type DevOrg = { name: string; slug: string };
export type DevUser = {
  email: string;
  name: string;
  role: 'admin' | 'reviewer' | 'member';
  orgSlug: string;
};

export function buildDevOrgs(): DevOrg[] {
  return [
    { name: 'Acme Corp', slug: 'acme' },
    { name: 'TechStart', slug: 'techstart' },
    { name: 'DevTeam', slug: 'devteam' },
  ];
}

export function buildDevUsers(orgs: DevOrg[]): DevUser[] {
  return orgs.flatMap(org => [
    {
      email: `admin@${org.slug}.dev.seed`,
      name: `${org.name} Admin`,
      role: 'admin' as const,
      orgSlug: org.slug,
    },
    {
      email: `reviewer@${org.slug}.dev.seed`,
      name: `${org.name} Reviewer`,
      role: 'reviewer' as const,
      orgSlug: org.slug,
    },
    {
      email: `member@${org.slug}.dev.seed`,
      name: `${org.name} Member`,
      role: 'member' as const,
      orgSlug: org.slug,
    },
  ]);
}
