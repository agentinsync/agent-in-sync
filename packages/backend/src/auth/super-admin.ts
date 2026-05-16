import { and, eq, notInArray } from 'drizzle-orm';
import { getDb, users } from '@agent-in-sync/db-client';
import { logger } from '../observability/index.js';

const superAdminEmails = new Set(
  (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

export function isSuperAdminByEnv(email: string): boolean {
  return superAdminEmails.has(email.toLowerCase());
}

export async function isSuperAdminByDb(email: string): Promise<boolean> {
  try {
    const db = getDb();
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return user?.isSuperAdmin ?? false;
  } catch (err) {
    logger.logError('Failed to check super admin status from DB', err, { email });
    return false;
  }
}

export async function checkSuperAdmin(email: string): Promise<boolean> {
  const dbCheck = await isSuperAdminByDb(email);
  if (dbCheck) return true;
  return isSuperAdminByEnv(email);
}

export function isSuperAdmin(email: string): boolean {
  return superAdminEmails.has(email.toLowerCase());
}

/** Sync SUPER_ADMIN_EMAILS env var to the DB on startup so get-session reflects the flag immediately.
 *  Promotes emails in the env var and demotes any user no longer listed. */
export async function syncSuperAdminFlags(): Promise<void> {
  const db = getDb();
  const emails = [...superAdminEmails];

  try {
    for (const email of emails) {
      await db.update(users).set({ isSuperAdmin: true }).where(eq(users.email, email));
    }

    // Revoke super admin from users not in the env var.
    const demoteWhere =
      emails.length > 0
        ? and(eq(users.isSuperAdmin, true), notInArray(users.email, emails))
        : eq(users.isSuperAdmin, true);

    const demoted = await db
      .update(users)
      .set({ isSuperAdmin: false })
      .where(demoteWhere)
      .returning({ email: users.email });

    logger.info('Synced super-admin flags from env', {
      promoted: emails.length,
      demoted: demoted.length,
    });
  } catch (err) {
    logger.logError('Failed to sync super-admin flags', err);
  }
}
