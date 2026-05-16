import { type Router, Router as createRouter, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb, organizations, agents, apiKeys } from '@agent-in-sync/db-client';
import { requireAuth, requireOrganization } from '../auth/index.js';

const router = createRouter();

/** Returns agent + org info for a valid API key — used by the Connect page to verify setup. */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const db = getDb();

    const [org] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, req.organizationId!));

    let agent: { displayName: string; slug: string } | null = null;
    if (req.agentId) {
      const [row] = await db
        .select({ displayName: agents.displayName, slug: agents.slug })
        .from(agents)
        .where(eq(agents.id, req.agentId));
      if (row) agent = row;
    }

    let lastUsedAt: string | null = null;
    if (req.apiKeyId) {
      const [key] = await db
        .select({ lastUsedAt: apiKeys.lastUsedAt })
        .from(apiKeys)
        .where(eq(apiKeys.id, req.apiKeyId));
      if (key) lastUsedAt = key.lastUsedAt?.toISOString() ?? null;
    }

    res.json({
      ok: true,
      agent: agent ? { name: agent.displayName, slug: agent.slug } : null,
      organization: org ? { name: org.name, slug: org.slug } : null,
      lastUsedAt,
    });
  }
);

export const verifyRouter: Router = router;
