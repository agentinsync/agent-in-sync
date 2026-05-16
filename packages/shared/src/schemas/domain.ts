import { z } from 'zod';

type X509Class = typeof import('node:crypto').X509Certificate;

// Lazily resolved — null in browser environments where node:crypto is unavailable
let _X509: X509Class | false | undefined;

function getX509(): X509Class | null {
  if (_X509 === undefined) {
    try {
      // Use Function constructor to hide the require call from bundler static analysis.
      // In browsers, this will throw and we gracefully degrade to PEM-only validation.
      const loadModule = new Function('m', 'return require(m)') as (m: string) => unknown;
      const mod = loadModule('node:crypto') as typeof import('node:crypto');
      _X509 = typeof mod.X509Certificate === 'function' ? mod.X509Certificate : false;
    } catch {
      _X509 = false;
    }
  }
  return _X509 || null;
}

/**
 * Validates that a string is a valid X.509 certificate in PEM format.
 * Full X509 parsing (expiry check) only runs in Node.js environments.
 * In browsers, only PEM format markers are validated.
 */
export function validateX509Certificate(cert: string): { valid: boolean; error?: string } {
  const trimmed = cert.trim();

  if (!trimmed.includes('-----BEGIN CERTIFICATE-----')) {
    return {
      valid: false,
      error: 'Certificate must be in PEM format (missing BEGIN CERTIFICATE header)',
    };
  }
  if (!trimmed.includes('-----END CERTIFICATE-----')) {
    return {
      valid: false,
      error: 'Certificate must be in PEM format (missing END CERTIFICATE footer)',
    };
  }

  const X509 = getX509();
  if (X509) {
    try {
      const x509 = new X509(trimmed);
      const notAfter = new Date(x509.validTo);
      if (notAfter < new Date()) {
        return { valid: false, error: `Certificate expired on ${notAfter.toISOString()}` };
      }
    } catch {
      return { valid: false, error: 'Invalid X.509 certificate: unable to parse' };
    }
  }

  return { valid: true };
}

export const domainStatusSchema = z.enum(['pending', 'verified']);
export type DomainStatus = z.infer<typeof domainStatusSchema>;

export const verificationMethodSchema = z.enum(['social_proof', 'dns_txt', 'sso']);
export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

export const samlAttributeMappingSchema = z.object({
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  groups: z.string().optional(),
});

export type SamlAttributeMapping = z.infer<typeof samlAttributeMappingSchema>;

export const samlConfigSchema = z.object({
  idpEntityId: z.string().min(1),
  idpSsoUrl: z.string().url(),
  idpCertificate: z.string().min(1),
  spEntityId: z.string(),
  spAcsUrl: z.string(),
  spMetadataUrl: z.string(),
  attributeMapping: samlAttributeMappingSchema,
  signRequests: z.boolean(),
  wantAssertionsSigned: z.boolean(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type SamlConfig = z.infer<typeof samlConfigSchema>;

const x509CertificateSchema = z
  .string()
  .min(1)
  .refine(
    cert => validateX509Certificate(cert).valid,
    cert => ({ message: validateX509Certificate(cert).error ?? 'Invalid certificate' })
  );

export const samlConfigInputSchema = z.object({
  idpEntityId: z.string().min(1),
  idpSsoUrl: z.string().url(),
  idpCertificate: x509CertificateSchema,
  attributeMapping: samlAttributeMappingSchema.optional(),
  signRequests: z.boolean().optional().default(false),
  wantAssertionsSigned: z.boolean().optional().default(true),
});

export type SamlConfigInput = z.infer<typeof samlConfigInputSchema>;

export const domainSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: domainStatusSchema,
  verificationMethod: verificationMethodSchema.nullable(),
  verificationToken: z.string().nullable(),
  verifiedAt: z.string().datetime().nullable(),
  ssoEnabled: z.boolean(),
  domainAdminId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Domain = z.infer<typeof domainSchema>;

export const domainResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: domainStatusSchema,
  verificationMethod: verificationMethodSchema.nullable(),
  verifiedAt: z.string().datetime().nullable(),
  ssoEnabled: z.boolean(),
  memberCount: z.number().int(),
  organizationCount: z.number().int(),
  createdAt: z.string().datetime(),
});

export type DomainResponse = z.infer<typeof domainResponseSchema>;

export const domainVerificationResponseSchema = z.object({
  domainId: z.string().uuid(),
  domainName: z.string(),
  status: domainStatusSchema,
  verificationToken: z.string().nullable(),
  dnsRecordType: z.literal('TXT').optional(),
  dnsRecordName: z.string().optional(),
  dnsRecordValue: z.string().optional(),
});

export type DomainVerificationResponse = z.infer<typeof domainVerificationResponseSchema>;

export const createOrganizationInputSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const organizationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isPublic: z.boolean(),
  domainId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export const availableOrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  memberCount: z.number().int(),
});

export type AvailableOrganization = z.infer<typeof availableOrganizationSchema>;
