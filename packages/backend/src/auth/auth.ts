import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@agent-in-sync/db-client';
import * as schema from '@agent-in-sync/db-client/schema';
import { linkUserToDomain } from './domain-linking.js';
import { ensureUserInPublicOrg } from './public-org.js';
import { isSuperAdminByEnv } from './super-admin.js';

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  },
  trustedOrigins: (
    process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:5173'
  ).split(','),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      domainId: {
        type: 'string',
        required: false,
      },
      isSuperAdmin: {
        type: 'boolean',
        required: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async user => {
          await ensureUserInPublicOrg(user.id);
          if (user.email && user.emailVerified) {
            await linkUserToDomain(user.id, user.email);
          }
          if (user.email && isSuperAdminByEnv(user.email)) {
            await getDb().update(users).set({ isSuperAdmin: true }).where(eq(users.id, user.id));
          }
        },
      },
    },
    session: {
      create: {
        before: async session => {
          const db = getDb();
          const [user] = await db
            .select({ emailVerified: users.emailVerified, email: users.email })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

          if (user && !user.emailVerified) {
            throw new Error('Email must be verified to sign in');
          }

          // Sync env-based super-admin flag to DB so it appears in the session
          if (user?.email && isSuperAdminByEnv(user.email)) {
            await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, session.userId));
          }

          return { data: session };
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
