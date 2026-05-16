import timeout from 'connect-timeout';
import type { Response, NextFunction, RequestHandler, Request } from 'express';

export const requestTimeout: RequestHandler = timeout('30s');

export function haltOnTimedout(req: Request, _res: Response, next: NextFunction): void {
  if (!(req as Request & { timedout?: boolean }).timedout) {
    next();
  }
}
