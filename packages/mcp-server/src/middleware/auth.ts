import type { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '@agent-in-sync/backend/auth';

export interface AuthenticatedRequest extends Request {
  userId: string;
  organizationId: string;
  apiKeyId: string;
  agentId?: string;
}

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'X-API-Key header required' });
    return;
  }

  const result = await validateApiKey(apiKey);
  if (!result) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  (req as AuthenticatedRequest).userId = result.userId;
  (req as AuthenticatedRequest).organizationId = result.organizationId;
  (req as AuthenticatedRequest).apiKeyId = result.apiKeyId;
  (req as AuthenticatedRequest).agentId = result.agentId ?? undefined;

  next();
}
