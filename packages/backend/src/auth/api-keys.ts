import { randomBytes, createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb, apiKeys, organizations, agents, users } from '@agent-in-sync/db-client';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';

const PUBLIC_KEY_PREFIX = 'ask_pub_';
const PRIVATE_KEY_PREFIX = 'ask_prv_';
const KEY_LENGTH = 32;

export function generateApiKey(isPublicOrg: boolean): {
  key: string;
  hash: string;
  prefix: string;
} {
  const keyPrefix = isPublicOrg ? PUBLIC_KEY_PREFIX : PRIVATE_KEY_PREFIX;
  const randomPart = randomBytes(KEY_LENGTH).toString('base64url');
  const key = `${keyPrefix}${randomPart}`;
  const hash = hashApiKey(key);
  const displayPrefix = key.slice(0, 16);
  return { key, hash, prefix: displayPrefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateAgentSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  const suffix = randomBytes(2).toString('hex');
  return `${base || 'agent'}-${suffix}`;
}

export async function createApiKey(
  userId: string,
  organizationId: string,
  name: string
): Promise<{
  id: string;
  key: string;
  prefix: string;
  organizationId: string;
  agentId: string;
  agentSlug: string;
}> {
  const startTime = Date.now();
  const db = getDb();

  try {
    const [org] = await db
      .select({ isPublic: organizations.isPublic })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      logger.error('API key creation failed: organization not found', {
        userId,
        organizationId,
        name,
      });
      trackError(OPERATIONS.API_KEY_CREATE, 'ORG_NOT_FOUND');
      throw new Error('Organization not found');
    }

    const [existing] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.organizationId, organizationId)))
      .limit(1);

    if (existing) {
      trackError(OPERATIONS.API_KEY_CREATE, 'ALREADY_EXISTS');
      throw new Error('API_KEY_ALREADY_EXISTS');
    }

    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const { key, hash, prefix } = generateApiKey(org.isPublic);
    const agentSlug = generateAgentSlug(user?.name ?? name);
    const displayName = user?.name ? `${user.name}'s Agent` : `${name} Agent`;

    const result = await db.transaction(async tx => {
      const [createdAgent] = await tx
        .insert(agents)
        .values({
          slug: agentSlug,
          displayName,
          createdByUserId: userId,
          organizationId,
        })
        .returning({ id: agents.id });

      if (!createdAgent) {
        throw new Error('Failed to create agent');
      }

      const [createdKey] = await tx
        .insert(apiKeys)
        .values({
          userId,
          organizationId,
          name,
          keyHash: hash,
          keyPrefix: prefix,
          agentId: createdAgent.id,
        })
        .returning({ id: apiKeys.id });

      if (!createdKey) {
        throw new Error('Failed to create API key');
      }

      return { keyId: createdKey.id, agentId: createdAgent.id };
    });

    const durationMs = Date.now() - startTime;
    logger.info('API key created successfully with agent', {
      keyId: result.keyId,
      agentId: result.agentId,
      agentSlug,
      userId,
      organizationId,
      isPublic: org.isPublic,
      prefix,
      durationMs,
    });
    trackSuccess(OPERATIONS.API_KEY_CREATE, durationMs);

    return {
      id: result.keyId,
      key,
      prefix,
      organizationId,
      agentId: result.agentId,
      agentSlug,
    };
  } catch (err) {
    if (
      err instanceof Error &&
      ![
        'Failed to create API key',
        'Failed to create agent',
        'Organization not found',
        'API_KEY_ALREADY_EXISTS',
      ].includes(err.message)
    ) {
      logger.logError('Unexpected error creating API key', err, { userId, organizationId, name });
      trackError(OPERATIONS.API_KEY_CREATE, 'UNEXPECTED_ERROR');
    }
    throw err;
  }
}

export async function createApiKeyForAgent(
  userId: string,
  organizationId: string,
  agentId: string
): Promise<{ id: string; key: string; prefix: string }> {
  const db = getDb();

  const [org] = await db
    .select({ isPublic: organizations.isPublic })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) throw new Error('Organization not found');

  const { key, hash, prefix } = generateApiKey(org.isPublic);

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId,
      organizationId,
      name: `Agent key`,
      keyHash: hash,
      keyPrefix: prefix,
      agentId,
    })
    .returning({ id: apiKeys.id });

  if (!created) throw new Error('Failed to create API key');

  return { id: created.id, key, prefix };
}

export async function validateApiKey(key: string): Promise<{
  userId: string;
  organizationId: string;
  apiKeyId: string;
  trustLevel: string;
  agentId: string | null;
} | null> {
  const hasPublicPrefix = key.startsWith(PUBLIC_KEY_PREFIX);
  const hasPrivatePrefix = key.startsWith(PRIVATE_KEY_PREFIX);
  if (!hasPublicPrefix && !hasPrivatePrefix) {
    logger.debug('API key validation failed: invalid prefix');
    return null;
  }

  const hash = hashApiKey(key);
  const db = getDb();

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);

  if (!apiKey) {
    logger.debug('API key validation failed');
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    logger.warn('API key validation failed: key expired', {
      keyId: apiKey.id,
      userId: apiKey.userId,
    });
    return null;
  }

  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .catch(err =>
      logger.logError('Failed to update API key lastUsedAt', err, { keyId: apiKey.id })
    );

  return {
    userId: apiKey.userId,
    organizationId: apiKey.organizationId,
    apiKeyId: apiKey.id,
    trustLevel: apiKey.trustLevel,
    agentId: apiKey.agentId,
  };
}

export async function listApiKeys(
  userId: string,
  organizationId?: string
): Promise<
  Array<{
    id: string;
    name: string;
    prefix: string;
    organizationId: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    agent: { id: string; slug: string; displayName: string } | null;
  }>
> {
  const startTime = Date.now();

  try {
    const db = getDb();
    const conditions = organizationId
      ? and(eq(apiKeys.userId, userId), eq(apiKeys.organizationId, organizationId))
      : eq(apiKeys.userId, userId);

    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.keyPrefix,
        organizationId: apiKeys.organizationId,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        agentId: agents.id,
        agentSlug: agents.slug,
        agentDisplayName: agents.displayName,
      })
      .from(apiKeys)
      .leftJoin(agents, eq(apiKeys.agentId, agents.id))
      .where(conditions);

    const keys = rows.map(row => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      organizationId: row.organizationId,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      agent: row.agentId
        ? { id: row.agentId, slug: row.agentSlug!, displayName: row.agentDisplayName! }
        : null,
    }));

    const durationMs = Date.now() - startTime;
    logger.debug('API keys listed', { userId, organizationId, count: keys.length, durationMs });
    trackSuccess(OPERATIONS.API_KEY_LIST, durationMs);

    return keys;
  } catch (err) {
    logger.logError('Failed to list API keys', err, { userId, organizationId });
    trackError(OPERATIONS.API_KEY_LIST, 'UNEXPECTED_ERROR');
    throw err;
  }
}

export async function regenerateApiKey(
  userId: string,
  keyId: string
): Promise<{ id: string; key: string; prefix: string; organizationId: string }> {
  const db = getDb();

  const [existing] = await db
    .select({
      agentId: apiKeys.agentId,
      organizationId: apiKeys.organizationId,
      name: apiKeys.name,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .limit(1);

  if (!existing) throw new Error('API key not found');

  const [org] = await db
    .select({ isPublic: organizations.isPublic })
    .from(organizations)
    .where(eq(organizations.id, existing.organizationId))
    .limit(1);

  if (!org) throw new Error('Organization not found');

  const { key, hash, prefix } = generateApiKey(org.isPublic);

  const result = await db.transaction(async tx => {
    await tx.delete(apiKeys).where(eq(apiKeys.id, keyId));

    const [newKey] = await tx
      .insert(apiKeys)
      .values({
        userId,
        organizationId: existing.organizationId,
        name: existing.name,
        keyHash: hash,
        keyPrefix: prefix,
        agentId: existing.agentId,
      })
      .returning({ id: apiKeys.id });

    if (!newKey) throw new Error('Failed to create new API key');
    return newKey;
  });

  logger.info('API key regenerated', { oldKeyId: keyId, newKeyId: result.id, userId });

  return { id: result.id, key, prefix, organizationId: existing.organizationId };
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    const db = getDb();
    const result = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning({ id: apiKeys.id });

    const durationMs = Date.now() - startTime;
    if (result.length > 0) {
      logger.info('API key revoked', { keyId, userId, durationMs });
      trackSuccess(OPERATIONS.API_KEY_REVOKE, durationMs);
    } else {
      logger.warn('API key revocation failed: key not found or not owned by user', {
        keyId,
        userId,
      });
      trackError(OPERATIONS.API_KEY_REVOKE, 'NOT_FOUND');
    }

    return result.length > 0;
  } catch (err) {
    logger.logError('Failed to revoke API key', err, { keyId, userId });
    trackError(OPERATIONS.API_KEY_REVOKE, 'UNEXPECTED_ERROR');
    throw err;
  }
}
