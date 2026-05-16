import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, path } = req;
    const { statusCode } = res;

    const logContext = {
      requestId,
      method,
      path,
      url: path,
      statusCode,
      durationMs: duration,
      userId: req.userId,
      organizationId: req.organizationId,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    };

    if (statusCode >= 500) {
      logger.error('HTTP request completed with server error', logContext);
    } else if (statusCode >= 400) {
      logger.warn('HTTP request completed with client error', logContext);
    } else {
      logger.info('HTTP request completed', logContext);
    }

    metrics.timing('http.request', duration, {
      method,
      path: normalizePath(path),
      status: String(statusCode),
    });

    metrics.increment('http.requests.total', 1, {
      method,
      path: normalizePath(path),
      status: String(statusCode),
    });
  });

  next();
}

function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}
