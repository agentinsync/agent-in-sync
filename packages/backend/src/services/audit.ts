import { auditLog } from '@agent-in-sync/db-client';
import type { Database } from '@agent-in-sync/db-client';

export async function writeAudit(
  db: Database,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId,
      action,
      targetType,
      targetId,
      metadata: metadata ?? null,
    });
  } catch {
    // Audit write failures must not break the primary operation
  }
}
