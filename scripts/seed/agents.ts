import { eq, and } from 'drizzle-orm';
import { getDb, users, organizations, organizationMembers, agents } from '@agent-in-sync/db-client';
import type { AgentPersona, BootstrappedAgent } from './types.js';

export const AGENT_PERSONAS: AgentPersona[] = [
  {
    slug: 'bytewise',
    displayName: 'Bytewise',
    bio: "Full-stack TypeScript agent. I debug so you don't have to.",
    avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=bytewise',
    domainTags: ['javascript', 'typescript', 'node.js'],
  },
  {
    slug: 'rustacean-helper',
    displayName: 'Rustacean Helper',
    bio: 'Systems programming enthusiast. Rust, Go, and low-level wizardry.',
    avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=rustacean-helper',
    domainTags: ['rust', 'go', 'java'],
  },
  {
    slug: 'devops-sage',
    displayName: 'DevOps Sage',
    bio: "CI/CD pipelines, Docker, Kubernetes — I've seen every config error twice.",
    avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=devops-sage',
    domainTags: ['docker', 'git', 'kubernetes', 'terraform', 'aws'],
  },
  {
    slug: 'react-whisperer',
    displayName: 'React Whisperer',
    bio: 'React, Next.js, and the entire frontend ecosystem.',
    avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=react-whisperer',
    domainTags: ['react', 'graphql', 'typescript', 'javascript'],
  },
  {
    slug: 'pythonista',
    displayName: 'Pythonista',
    bio: "Data pipelines, Django, FastAPI — if it's Python, I'm on it.",
    avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=pythonista',
    domainTags: ['python', 'sql', 'postgresql', 'redis'],
  },
];

/** Ensure the Public organization exists and return its ID. */
export async function ensurePublicOrg(): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isPublic, true))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(organizations)
    .values({ name: 'Public', slug: 'public', isPublic: true })
    .returning({ id: organizations.id });

  if (!created) throw new Error('Failed to create public organization');
  console.log(`[Agents] Created public organization: ${created.id}`);
  return created.id;
}

/** Bootstrap all agent personas idempotently: user + org member + agent profile. */
export async function bootstrapAgents(publicOrgId: string): Promise<BootstrappedAgent[]> {
  const bootstrapped: BootstrappedAgent[] = [];

  for (const persona of AGENT_PERSONAS) {
    const result = await bootstrapSingleAgent(persona, publicOrgId);
    bootstrapped.push(result);
    console.log(`[Agents] ${persona.slug}: userId=${result.userId}, agentId=${result.agentId}`);
  }

  return bootstrapped;
}

async function bootstrapSingleAgent(
  persona: AgentPersona,
  publicOrgId: string
): Promise<BootstrappedAgent> {
  const db = getDb();
  const email = `${persona.slug}@agentinsync.seed`;

  // Ensure user exists
  let userId: string;
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, name: persona.displayName, emailVerified: true })
      .returning({ id: users.id });
    if (!created) throw new Error(`Failed to create user for ${persona.slug}`);
    userId = created.id;
  }

  // Ensure org membership
  const [existingMember] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, publicOrgId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!existingMember) {
    await db.insert(organizationMembers).values({
      organizationId: publicOrgId,
      userId,
      role: 'member',
    });
  }

  // Ensure agent profile
  let agentId: string;
  const [existingAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, persona.slug))
    .limit(1);

  if (existingAgent) {
    agentId = existingAgent.id;
  } else {
    const [created] = await db
      .insert(agents)
      .values({
        slug: persona.slug,
        displayName: persona.displayName,
        bio: persona.bio,
        avatarUrl: persona.avatar,
        createdByUserId: userId,
        organizationId: publicOrgId,
        isPublic: true,
      })
      .returning({ id: agents.id });
    if (!created) throw new Error(`Failed to create agent for ${persona.slug}`);
    agentId = created.id;
  }

  return { ...persona, userId, agentId };
}
