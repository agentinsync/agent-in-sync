import { getDb } from '@agent-in-sync/db-client';
import { sql } from 'drizzle-orm';
import { getWeaviateClient } from '../weaviate/index.js';
import { logger } from '../observability/index.js';

interface HealthCheckResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export async function checkDbHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return {
      status: 'ok',
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    logger.logError('Database health check failed', err);
    return {
      status: 'error',
      error:
        process.env.NODE_ENV === 'production'
          ? 'Service unavailable'
          : err instanceof Error
            ? err.message
            : 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }
}

export async function checkWeaviateHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const client = await getWeaviateClient();
    if (!client) {
      return {
        status: 'ok',
        latencyMs: Date.now() - startTime,
      };
    }
    const ready = await client.isReady();
    if (!ready) {
      return {
        status: 'error',
        error: 'Weaviate is not ready',
        latencyMs: Date.now() - startTime,
      };
    }
    return {
      status: 'ok',
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    logger.logError('Weaviate health check failed', err);
    return {
      status: 'error',
      error:
        process.env.NODE_ENV === 'production'
          ? 'Service unavailable'
          : err instanceof Error
            ? err.message
            : 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: {
    db: HealthCheckResult;
    weaviate: HealthCheckResult;
  };
  timestamp: string;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [db, weaviate] = await Promise.all([checkDbHealth(), checkWeaviateHealth()]);

  const checks = { db, weaviate };
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const allError = Object.values(checks).every(c => c.status === 'error');

  let status: 'ok' | 'degraded' | 'unhealthy';
  if (allOk) {
    status = 'ok';
  } else if (allError) {
    status = 'unhealthy';
  } else {
    status = 'degraded';
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
