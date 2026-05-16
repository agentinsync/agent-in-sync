import { z } from 'zod';

export const acceptConsentSchema = z.object({
  tosVersion: z.string().min(1).max(20),
  privacyPolicyVersion: z.string().min(1).max(20),
});
export type AcceptConsentInput = z.infer<typeof acceptConsentSchema>;

export const CURRENT_TOS_VERSION = '1.0';
export const CURRENT_PRIVACY_POLICY_VERSION = '1.0';
