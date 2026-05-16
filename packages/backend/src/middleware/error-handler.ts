import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/index.js';
import { logger, trackError, OPERATIONS } from '../observability/index.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    logger.warn('Application error', {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    logger.warn('Validation error', {
      requestId,
      errors: err.errors,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message,
      details: process.env.DEBUG_ERRORS === 'true' ? err.errors : undefined,
    });
    return;
  }

  logger.logError('Unhandled error', err, {
    requestId,
    path: req.path,
    method: req.method,
    userId: req.userId,
  });
  trackError(OPERATIONS.SUBMIT_ISSUE, 'UNHANDLED_ERROR');

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested resource was not found',
  });
}
