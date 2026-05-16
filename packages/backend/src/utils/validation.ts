import { z } from 'zod';
import { ValidationError } from '../errors/index.js';

export const uuidSchema = z.string().uuid();

export function parseUuid(value: string, paramName: string): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid ${paramName} format`);
  }
  return result.data;
}
