import { Router, type Request, type Response } from 'express';
import { requireAuth, requireDomainAdmin } from '../auth/index.js';
import { getDb } from '@agent-in-sync/db-client';
import { DomainService } from '../services/domain.service.js';
import { logger } from '../observability/index.js';
import { samlConfigInputSchema } from '@agent-in-sync/shared';

const router = Router();

function getDomainService() {
  return new DomainService({ db: getDb() });
}

router.get('/:domainName', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const domainName = req.params.domainName as string;

  try {
    const domainService = getDomainService();
    const domain = await domainService.findByName(domainName);

    if (!domain) {
      res.status(404).json({ error: 'Domain not found' });
      return;
    }

    res.json({
      id: domain.id,
      name: domain.name,
      status: domain.status,
      verificationMethod: domain.verificationMethod,
      verifiedAt: domain.verifiedAt,
      ssoEnabled: domain.ssoEnabled,
      memberCount: domain.memberCount,
      organizationCount: domain.organizationCount,
      createdAt: domain.createdAt,
    });
  } catch (err) {
    logger.logError('Get domain failed', err, { requestId: req.requestId, domainName });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/:domainName/verify',
  requireAuth,
  requireDomainAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const domainService = getDomainService();
      const verificationInfo = await domainService.requestDnsVerification(req.domainId!);

      res.json(verificationInfo);
    } catch (err) {
      logger.logError('Request DNS verification failed', err, {
        requestId: req.requestId,
        domainId: req.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:domainName/verify',
  requireAuth,
  requireDomainAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const domainService = getDomainService();

      const [verified, status] = await Promise.all([
        domainService.checkDnsVerification(req.domainId!),
        domainService.getVerificationStatus(req.domainId!),
      ]);

      res.json({
        ...status,
        dnsVerified: verified,
      });
    } catch (err) {
      logger.logError('Check DNS verification failed', err, {
        requestId: req.requestId,
        domainId: req.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:domainName/sso',
  requireAuth,
  requireDomainAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const domainService = getDomainService();
      const ssoConfig = await domainService.getSsoConfig(req.domainId!);

      if (!ssoConfig) {
        res.json({ enabled: false, config: null });
        return;
      }

      res.json({
        enabled: true,
        config: {
          idpEntityId: ssoConfig.idpEntityId,
          idpSsoUrl: ssoConfig.idpSsoUrl,
          spEntityId: ssoConfig.spEntityId,
          spAcsUrl: ssoConfig.spAcsUrl,
          spMetadataUrl: ssoConfig.spMetadataUrl,
          attributeMapping: ssoConfig.attributeMapping,
          signRequests: ssoConfig.signRequests,
          wantAssertionsSigned: ssoConfig.wantAssertionsSigned,
        },
      });
    } catch (err) {
      logger.logError('Get SSO config failed', err, {
        requestId: req.requestId,
        domainId: req.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:domainName/sso',
  requireAuth,
  requireDomainAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = samlConfigInputSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const domainService = getDomainService();
      const domain = await domainService.findById(req.domainId!);

      if (!domain) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }

      const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
      const domainSlug = domain.name.replace(/\./g, '-');

      const fullConfig = {
        ...parseResult.data,
        spEntityId: `${baseUrl}/saml/${domainSlug}`,
        spAcsUrl: `${baseUrl}/saml/${domainSlug}/acs`,
        spMetadataUrl: `${baseUrl}/saml/${domainSlug}/metadata`,
        attributeMapping: parseResult.data.attributeMapping ?? { email: 'email' },
        signRequests: parseResult.data.signRequests ?? false,
        wantAssertionsSigned: parseResult.data.wantAssertionsSigned ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await domainService.updateSsoConfig(req.domainId!, fullConfig);

      res.json({ success: true, config: fullConfig });
    } catch (err) {
      logger.logError('Update SSO config failed', err, {
        requestId: req.requestId,
        domainId: req.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:domainName/sso',
  requireAuth,
  requireDomainAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const domainService = getDomainService();
      await domainService.updateSsoConfig(req.domainId!, null);

      res.json({ success: true });
    } catch (err) {
      logger.logError('Disable SSO failed', err, {
        requestId: req.requestId,
        domainId: req.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const domainRouter: Router = router;
