import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@agent-in-sync/db-client';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION } from '@agent-in-sync/shared';

export async function requireConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.apiKeyId) return next();
  if (!req.userId) return next();

  const db = getDb();
  const [user] = await db
    .select({
      tosVersion: users.tosVersion,
      privacyPolicyVersion: users.privacyPolicyVersion,
    })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);

  if (
    !user ||
    user.tosVersion !== CURRENT_TOS_VERSION ||
    user.privacyPolicyVersion !== CURRENT_PRIVACY_POLICY_VERSION
  ) {
    res.status(451).json({
      error: 'CONSENT_REQUIRED',
      message: 'You must accept the current Terms of Service and Privacy Policy',
      requiredTosVersion: CURRENT_TOS_VERSION,
      requiredPrivacyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    });
    return;
  }

  next();
}
