import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb, organizationMembers, domains } from '@agent-in-sync/db-client';
import { auth, type User } from './auth.js';
import { validateApiKey } from './api-keys.js';
import { checkSuperAdmin } from './super-admin.js';

export type MembershipRole = 'member' | 'admin' | 'reviewer';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      organizationId?: string;
      membershipRole?: MembershipRole;
      requestId?: string;
      isSuperAdmin?: boolean;
      domainId?: string;
      isDomainAdmin?: boolean;
      apiKeyId?: string;
      apiKeyTrustLevel?: string;
      agentId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const result = await validateApiKey(apiKey);
    if (result) {
      req.userId = result.userId;
      req.organizationId = result.organizationId;
      req.apiKeyId = result.apiKeyId;
      req.apiKeyTrustLevel = result.trustLevel;
      req.agentId = result.agentId ?? undefined;
      return next();
    }
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const session = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });

  if (!session?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  req.user = session.user;
  req.userId = session.user.id;
  req.isSuperAdmin = (session.user as { isSuperAdmin?: boolean }).isSuperAdmin ?? false;
  next();
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const result = await validateApiKey(apiKey);
    if (result) {
      req.userId = result.userId;
      req.organizationId = result.organizationId;
      req.apiKeyId = result.apiKeyId;
      req.apiKeyTrustLevel = result.trustLevel;
      req.agentId = result.agentId ?? undefined;
    }
    return next();
  }

  const session = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });

  if (session?.user) {
    req.user = session.user;
    req.userId = session.user.id;
  }

  next();
}

export async function requireOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const organizationId =
    (req.params.orgId as string | undefined) ||
    (req.headers['x-organization-id'] as string | undefined) ||
    req.organizationId;

  if (!organizationId) {
    res
      .status(400)
      .json({ error: 'Organization ID required (X-Organization-Id header or :orgId param)' });
    return;
  }

  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.isSuperAdmin) {
    req.organizationId = organizationId;
    next();
    return;
  }

  const db = getDb();
  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, req.userId)
      )
    )
    .limit(1);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  req.organizationId = organizationId;
  req.membershipRole = membership.role as MembershipRole;
  next();
}

export async function requireReviewer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (
    !req.isSuperAdmin &&
    (!req.membershipRole || !['reviewer', 'admin'].includes(req.membershipRole))
  ) {
    res.status(403).json({ error: 'Reviewer or admin role required' });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.membershipRole !== 'admin' && !req.isSuperAdmin) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }
  next();
}

export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.email) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  const isAdmin = await checkSuperAdmin(req.user.email);
  if (!isAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  req.isSuperAdmin = true;
  next();
}

export type AuthorIdGetter = (req: Request) => Promise<string | null>;

export function requireOwnership(getAuthorId: AuthorIdGetter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authorId = await getAuthorId(req);
    const isOwner = authorId === req.userId;
    const isOrgAdmin = req.membershipRole === 'admin';

    if (!isOwner && !isOrgAdmin && !req.isSuperAdmin) {
      res.status(403).json({ error: 'Not authorized to modify this resource' });
      return;
    }
    next();
  };
}

export async function requireDomainAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const domainName = req.params.domainName as string | undefined;

  if (!domainName) {
    res.status(400).json({ error: 'Domain name required' });
    return;
  }

  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const db = getDb();
  const [domain] = await db
    .select({ id: domains.id, domainAdminId: domains.domainAdminId })
    .from(domains)
    .where(eq(domains.name, domainName.toLowerCase()))
    .limit(1);

  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }

  if (domain.domainAdminId !== req.userId && !req.isSuperAdmin) {
    res.status(403).json({ error: 'Domain admin access required' });
    return;
  }

  req.domainId = domain.id;
  req.isDomainAdmin = true;
  next();
}
