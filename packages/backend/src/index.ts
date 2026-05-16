import { createServer } from './server.js';
import { closeDb } from '@agent-in-sync/db-client';
import { logger, flushAxiom } from './observability/index.js';
import { syncSuperAdminFlags } from './auth/super-admin.js';

const port = process.env.PORT ?? 3000;

createServer()
  .then(async app => {
    await syncSuperAdminFlags();

    const server = app.listen(port, () => {
      logger.info('Server started', { port, nodeEnv: process.env.NODE_ENV });
    });

    let shuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('Shutdown signal received', { signal });

      const forceTimeout = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 15_000);

      server.close(async () => {
        try {
          await closeDb();
          await flushAxiom();
        } catch (err) {
          logger.logError('Error during shutdown cleanup', err);
        }
        clearTimeout(forceTimeout);
        logger.info('Server shutdown complete');
        process.exit(0);
      });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch(async err => {
    logger.logError('Failed to start server', err);
    await flushAxiom();
    process.exit(1);
  });
