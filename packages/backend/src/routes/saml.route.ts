import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { SamlService } from '../services/saml.service.js';
import { DomainService } from '../services/domain.service.js';
import { getDb } from '@agent-in-sync/db-client';
import { logger } from '../observability/index.js';
import { extractDomainFromEmail, isPublicEmailDomain } from '../utils/index.js';

const router = Router();

const TRUSTED_ORIGINS = [
  ...(process.env.TRUSTED_ORIGINS?.split(',')
    .map(o => o.trim())
    .filter(Boolean) ?? []),
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
];

function isValidRedirectUrl(url: string | undefined): string | null {
  if (!url) return null;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  // Allow relative paths (but not protocol-relative URLs like //evil.com)
  if (url.startsWith('/') && !url.startsWith('//')) {
    return new URL(url, frontendUrl).toString();
  }

  try {
    const parsed = new URL(url, frontendUrl);
    const trustedOrigins = [...TRUSTED_ORIGINS, frontendUrl];
    if (
      trustedOrigins.some(origin => {
        try {
          return parsed.origin === new URL(origin).origin;
        } catch {
          return false;
        }
      })
    ) {
      return parsed.toString();
    }
  } catch {
    // Invalid URL
  }
  return null;
}

function getSamlService() {
  return new SamlService();
}

function getDomainService() {
  return new DomainService({ db: getDb() });
}

const checkEmailSchema = z.object({
  email: z.string().email(),
});

router.post('/check-email', async (req: Request, res: Response): Promise<void> => {
  const parseResult = checkEmailSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { email } = parseResult.data;

  try {
    const domainName = extractDomainFromEmail(email);

    if (!domainName || isPublicEmailDomain(domainName)) {
      res.json({
        ssoEnabled: false,
        authMethod: 'oauth',
        message: 'Use GitHub or Google to sign in',
      });
      return;
    }

    const domainService = getDomainService();
    const domain = await domainService.findByName(domainName);

    if (!domain || !domain.ssoEnabled) {
      res.json({
        ssoEnabled: false,
        authMethod: 'oauth',
        message: 'Use GitHub or Google to sign in',
      });
      return;
    }

    const domainSlug = domainName.replace(/\./g, '~');

    res.json({
      ssoEnabled: true,
      authMethod: 'sso',
      loginUrl: `/saml/${domainSlug}/login`,
      domainName: domainName,
      message: 'Your organization uses SSO. Click to continue.',
    });
  } catch (err) {
    logger.logError('Check email SSO failed', err, { email });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:domainSlug/metadata', async (req: Request, res: Response): Promise<void> => {
  const domainSlug = req.params.domainSlug as string;

  try {
    const samlService = getSamlService();
    const result = await samlService.findDomainBySlug(domainSlug);

    if (!result) {
      res.status(404).json({ error: 'SSO not configured for this domain' });
      return;
    }

    const metadata = await samlService.generateSpMetadata(result.ssoConfig, result.domain.name);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (err) {
    logger.logError('Generate SP metadata failed', err, { domainSlug });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:domainSlug/login', async (req: Request, res: Response): Promise<void> => {
  const domainSlug = req.params.domainSlug as string;
  const { returnTo } = req.query;

  try {
    const samlService = getSamlService();
    const result = await samlService.findDomainBySlug(domainSlug);

    if (!result) {
      res.status(404).json({ error: 'SSO not configured for this domain' });
      return;
    }

    // Generate CSRF nonce and encode it with returnTo in RelayState
    const nonce = randomBytes(32).toString('base64url');
    const relayState = JSON.stringify({ nonce, returnTo: returnTo as string | undefined });

    res.cookie('saml_nonce', nonce, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'strict',
      maxAge: 5 * 60 * 1000, // 5 minutes
    });

    const loginUrl = await samlService.getLoginUrl(result.ssoConfig, relayState);

    res.redirect(loginUrl);
  } catch (err) {
    logger.logError('SAML login redirect failed', err, { domainSlug });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:domainSlug/acs', async (req: Request, res: Response): Promise<void> => {
  const domainSlug = req.params.domainSlug as string;
  const { SAMLResponse, RelayState } = req.body;

  if (!SAMLResponse) {
    res.status(400).json({ error: 'SAMLResponse is required' });
    return;
  }

  // Validate CSRF nonce from RelayState against cookie
  const storedNonce = req.cookies?.saml_nonce;
  let returnTo: string | undefined;

  try {
    const relayData = RelayState ? JSON.parse(RelayState) : null;
    if (!storedNonce || !relayData?.nonce || storedNonce !== relayData.nonce) {
      res.status(403).json({ error: 'Invalid SAML state — possible CSRF attack' });
      return;
    }
    returnTo = relayData.returnTo;
  } catch {
    res.status(403).json({ error: 'Invalid SAML state' });
    return;
  }

  // Clear the nonce cookie
  res.clearCookie('saml_nonce');

  try {
    const samlService = getSamlService();
    const result = await samlService.findDomainBySlug(domainSlug);

    if (!result) {
      res.status(404).json({ error: 'SSO not configured for this domain' });
      return;
    }

    const assertion = await samlService.validateAssertion(SAMLResponse, result.ssoConfig);

    const emailDomain = assertion.email.split('@')[1]?.toLowerCase();
    if (emailDomain !== result.domain.name) {
      res.status(403).json({ error: 'Email domain does not match SSO domain' });
      return;
    }

    const { sessionToken } = await samlService.createOrUpdateUserFromAssertion(
      assertion,
      result.domain.id
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const redirectUrl = isValidRedirectUrl(returnTo) ?? frontendUrl;

    const signedToken = await signSessionToken(sessionToken);
    res.cookie('better-auth.session_token', signedToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      encode: (v: string) => v, // already signed + URL-encoded
    });

    res.redirect(redirectUrl);
  } catch (err) {
    logger.logError('SAML ACS processing failed', err, { domainSlug });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=sso_failed`);
  }
});

router.get('/:domainSlug/check', async (req: Request, res: Response): Promise<void> => {
  const domainSlug = req.params.domainSlug as string;

  try {
    const samlService = getSamlService();
    const result = await samlService.findDomainBySlug(domainSlug);

    res.json({
      ssoEnabled: result !== null,
      loginUrl: result ? `/saml/${domainSlug}/login` : null,
    });
  } catch (err) {
    logger.logError('Check SSO status failed', err, { domainSlug });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const samlRouter: Router = router;

// Replicates better-call's signCookieValue: HMAC-SHA256(token) → base64 → "${token}.${sig}" → encodeURIComponent
async function signSessionToken(token: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(token)
  );
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${token}.${base64Sig}`);
}
