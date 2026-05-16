import express, { type Express, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/auth.js';
import {
  agentRouter,
  badgeRouter,
  searchRouter,
  submitRouter,
  voteRouter,
  commentRouter,
  suggestRouter,
  apiKeysRouter,
  shareRequestRouter,
  adminRouter,
  superAdminRouter,
  domainRouter,
  organizationRouter,
  samlRouter,
  userRouter,
  moderationRouter,
  guideRouter,
  notificationRouter,
  privacyRouter,
  publicSearchRouter,
  verifyRouter,
  analyticsRouter,
  dashboardRouter,
  wikiRouter,
} from './routes/index.js';
import { initializeWeaviateSchema } from './weaviate/index.js';
import { requestLogger, logger } from './observability/index.js';
import {
  errorHandler,
  notFoundHandler,
  apiLimiter,
  searchLimiter,
  authLimiter,
  requestTimeout,
  haltOnTimedout,
} from './middleware/index.js';
import { getHealthStatus } from './health/index.js';

export async function createServer(): Promise<Express> {
  const app = express();

  // Trust the first proxy (load balancer) so req.ip, req.secure, and
  // X-Forwarded-* headers are set correctly for rate-limiting and HTTPS checks.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  // Health check before HTTPS redirect (must be accessible over plain HTTP for LB/Docker health checks)
  app.get('/health', async (_req: Request, res: Response) => {
    const health = await getHealthStatus();
    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // HTTPS enforcement in production (after health check)
  if (process.env.NODE_ENV === 'production') {
    const allowedHost = process.env.PRODUCTION_DOMAIN;
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        // Validate host against the known production domain to prevent host-header injection.
        const host = req.headers.host;
        if (!allowedHost || host !== allowedHost) {
          res.status(400).send('Bad request');
          return;
        }
        return res.redirect(301, `https://${allowedHost}${req.url}`);
      }
      next();
    });
  }

  app.use(
    cors({
      origin: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);
  app.use('/api', requestTimeout);
  app.use(haltOnTimedout);

  app.get('/api/v1/status', (_req: Request, res: Response) => {
    res.json({ ok: true, version: '1.0.0' });
  });

  app.all('/api/auth/*', authLimiter, toNodeHandler(auth));

  // SAML SSO routes (public, rate limited)
  app.use('/saml', authLimiter, samlRouter);

  app.use('/api/v1/agents', apiLimiter, agentRouter);
  app.use('/api/v1/badges', apiLimiter, badgeRouter);
  app.use('/api/v1/search', searchLimiter, searchRouter);
  app.use('/api/v1/submit', apiLimiter, submitRouter);
  app.use('/api/v1/vote', apiLimiter, voteRouter);
  app.use('/api/v1/comment', apiLimiter, commentRouter);
  app.use('/api/v1/suggest', apiLimiter, suggestRouter);
  app.use('/api/v1/keys', apiLimiter, apiKeysRouter);
  app.use('/api/v1/share-requests', apiLimiter, shareRequestRouter);
  app.use('/api/v1/admin', apiLimiter, adminRouter);
  app.use('/api/v1/super-admin', apiLimiter, superAdminRouter);
  app.use('/api/v1/domains', apiLimiter, domainRouter);
  app.use('/api/v1/organizations', apiLimiter, organizationRouter);
  app.use('/api/v1/user', apiLimiter, userRouter);
  app.use('/api/v1', apiLimiter, moderationRouter);
  app.use('/api/v1/contributor-guide', guideRouter);
  app.use('/api/v1/notifications', apiLimiter, notificationRouter);
  app.use('/api/v1/privacy', apiLimiter, privacyRouter);
  app.use('/api/v1/public/search', searchLimiter, publicSearchRouter);
  app.use('/api/v1/verify', apiLimiter, verifyRouter);
  app.use('/api/v1/analytics', apiLimiter, analyticsRouter);
  app.use('/api/v1/dashboard', apiLimiter, dashboardRouter);
  app.use('/api/v1/wiki', apiLimiter, wikiRouter);

  app.use('/api/agents', apiLimiter, agentRouter);
  app.use('/api/badges', apiLimiter, badgeRouter);
  app.use('/api/search', searchLimiter, searchRouter);
  app.use('/api/submit', apiLimiter, submitRouter);
  app.use('/api/vote', apiLimiter, voteRouter);
  app.use('/api/comment', apiLimiter, commentRouter);
  app.use('/api/suggest', apiLimiter, suggestRouter);
  app.use('/api/keys', apiLimiter, apiKeysRouter);
  app.use('/api/share-requests', apiLimiter, shareRequestRouter);
  app.use('/api/admin', apiLimiter, adminRouter);
  app.use('/api/super-admin', apiLimiter, superAdminRouter);
  app.use('/api/domains', apiLimiter, domainRouter);
  app.use('/api/organizations', apiLimiter, organizationRouter);
  app.use('/api/user', apiLimiter, userRouter);
  app.use('/api', apiLimiter, moderationRouter);
  app.use('/api/contributor-guide', guideRouter);
  app.use('/api/notifications', apiLimiter, notificationRouter);
  app.use('/api/privacy', apiLimiter, privacyRouter);
  app.use('/api/public/search', searchLimiter, publicSearchRouter);
  app.use('/api/verify', apiLimiter, verifyRouter);
  app.use('/api/analytics', apiLimiter, analyticsRouter);
  app.use('/api/dashboard', apiLimiter, dashboardRouter);
  app.use('/api/wiki', apiLimiter, wikiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  await initializeWeaviateSchema();

  logger.info('Server initialized successfully', { axiomEnabled: logger.isEnabled() });

  return app;
}
