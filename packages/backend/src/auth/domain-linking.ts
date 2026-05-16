import { getDb } from '@agent-in-sync/db-client';
import { DomainService } from '../services/domain.service.js';
import { logger } from '../observability/index.js';

export async function linkUserToDomain(userId: string, email: string): Promise<void> {
  try {
    const db = getDb();
    const domainService = new DomainService({ db });
    await domainService.findOrCreateForUser(email, userId);
  } catch (err) {
    logger.logError('Failed to link user to domain', err, { userId, email });
  }
}
