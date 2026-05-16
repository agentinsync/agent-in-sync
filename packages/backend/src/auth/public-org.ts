import { eq, and } from 'drizzle-orm';
import { getDb, organizations, organizationMembers } from '@agent-in-sync/db-client';
import { logger } from '../observability/index.js';

export async function getOrCreatePublicOrganization(): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isPublic, true))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(organizations)
    .values({
      name: 'Public',
      slug: 'public',
      isPublic: true,
    })
    .returning({ id: organizations.id });

  if (!created) {
    throw new Error('Failed to create public organization');
  }

  logger.info('Public organization created', { organizationId: created.id });
  return created.id;
}

export async function ensureUserInPublicOrg(userId: string): Promise<void> {
  const db = getDb();

  try {
    const publicOrgId = await getOrCreatePublicOrganization();

    const [existingMembership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, publicOrgId),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingMembership) return;

    await db.insert(organizationMembers).values({
      organizationId: publicOrgId,
      userId,
      role: 'member',
    });

    logger.info('User added to public organization on signup', {
      userId,
      organizationId: publicOrgId,
    });
  } catch (err) {
    logger.logError('Failed to add user to public organization', err, { userId });
  }
}
