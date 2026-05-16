import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ?? 'postgresql://agentinsync:agentinsync@localhost:5432/agentinsync';
    pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
      min: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
    });
    pool.on('error', err => {
      console.error('Unexpected pool error', err);
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export type Database = ReturnType<typeof getDb>;

export type Transaction = Parameters<Database['transaction']>[0] extends (tx: infer T) => unknown
  ? T
  : never;

export async function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(fn);
}
