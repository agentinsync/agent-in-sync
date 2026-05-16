import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import { eq, count, and } from 'drizzle-orm';
import { domains, domainMembers, organizations, users } from '@agent-in-sync/db-client';
import type { SamlConfig } from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import {
  logger,
  trackSuccess,
  trackError,
  OPERATIONS,
  KPI_EVENTS,
  metrics,
} from '../observability/index.js';
import { isPublicEmailDomain, extractDomainFromEmail } from '../utils/index.js';
import { OrganizationService } from './organization.service.js';

const DNS_VERIFICATION_PREFIX = 'agentinsync-verify=';

export type DomainStatus = 'pending' | 'verified';
export type VerificationMethod = 'social_proof' | 'dns_txt' | 'sso' | 'super_admin';

export type DomainResponse = {
  id: string;
  name: string;
  status: DomainStatus;
  verificationMethod: VerificationMethod | null;
  verificationToken: string | null;
  verifiedAt: string | null;
  ssoEnabled: boolean;
  domainAdminId: string | null;
  memberCount: number;
  organizationCount: number;
  createdAt: string;
};

export type DomainMemberResponse = {
  id: string;
  domainId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  joinedAt: string;
};

const SOCIAL_PROOF_THRESHOLD = 3;
const MAX_ORGS_PER_DOMAIN = 5;

export class DomainService {
  constructor(private deps: ServiceDependencies) {}

  async findByName(name: string): Promise<DomainResponse | null> {
    const { db } = this.deps;
    const normalizedName = name.toLowerCase();

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.name, normalizedName))
      .limit(1);

    if (!domain) return null;

    const [memberCount, orgCount] = await Promise.all([
      this.getMemberCount(domain.id),
      this.getOrganizationCount(domain.id),
    ]);

    return {
      id: domain.id,
      name: domain.name,
      status: domain.status,
      verificationMethod: domain.verificationMethod,
      verificationToken: domain.verificationToken,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      ssoEnabled: domain.ssoEnabled,
      domainAdminId: domain.domainAdminId,
      memberCount,
      organizationCount: orgCount,
      createdAt: domain.createdAt.toISOString(),
    };
  }

  async findById(domainId: string): Promise<DomainResponse | null> {
    const { db } = this.deps;

    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);

    if (!domain) return null;

    const [memberCount, orgCount] = await Promise.all([
      this.getMemberCount(domain.id),
      this.getOrganizationCount(domain.id),
    ]);

    return {
      id: domain.id,
      name: domain.name,
      status: domain.status,
      verificationMethod: domain.verificationMethod,
      verificationToken: domain.verificationToken,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      ssoEnabled: domain.ssoEnabled,
      domainAdminId: domain.domainAdminId,
      memberCount,
      organizationCount: orgCount,
      createdAt: domain.createdAt.toISOString(),
    };
  }

  async findOrCreateForUser(email: string, userId: string): Promise<DomainResponse | null> {
    const startTime = Date.now();
    const { db } = this.deps;

    const domainName = extractDomainFromEmail(email);
    if (!domainName) {
      logger.warn('Could not extract domain from email', { email });
      return null;
    }

    if (isPublicEmailDomain(domainName)) {
      logger.debug('Skipping domain creation for public email domain', { domainName, email });
      return null;
    }

    const orgService = new OrganizationService(this.deps);

    try {
      const existing = await this.findByName(domainName);
      if (existing) {
        await this.addMember(existing.id, userId);
        await orgService.joinDefaultOrg(existing.id, userId);
        return existing;
      }

      const domain = await db.transaction(async tx => {
        const [txDomain] = await tx
          .insert(domains)
          .values({
            name: domainName,
            status: 'pending',
            domainAdminId: userId,
          })
          .returning();

        if (!txDomain) {
          logger.error('Domain creation failed: database insert returned empty', {
            domainName,
            userId,
          });
          trackError(OPERATIONS.DOMAIN_CREATE, 'DB_INSERT_FAILED');
          throw new Error('Failed to create domain');
        }

        await tx.insert(domainMembers).values({
          domainId: txDomain.id,
          userId,
        });

        await tx.update(users).set({ domainId: txDomain.id }).where(eq(users.id, userId));

        return txDomain;
      });

      // Create the default org outside the domain transaction so it can use its own transaction
      await orgService.createDefaultOrg(domainName.split('.')[0]!, domain.id, userId);

      const durationMs = Date.now() - startTime;
      logger.info('Domain created successfully', {
        domainId: domain.id,
        domainName,
        userId,
        durationMs,
      });
      trackSuccess(OPERATIONS.DOMAIN_CREATE, durationMs);
      metrics.trackKpi(KPI_EVENTS.DOMAIN_CREATED, userId, undefined, { domainName });

      return {
        id: domain.id,
        name: domain.name,
        status: domain.status,
        verificationMethod: domain.verificationMethod,
        verificationToken: domain.verificationToken,
        verifiedAt: domain.verifiedAt?.toISOString() ?? null,
        ssoEnabled: domain.ssoEnabled,
        domainAdminId: domain.domainAdminId,
        memberCount: 1,
        organizationCount: 0,
        createdAt: domain.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Error && err.message !== 'Failed to create domain') {
        logger.logError('Unexpected error in findOrCreateForUser', err, { email, userId });
        trackError(OPERATIONS.DOMAIN_CREATE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async addMember(domainId: string, userId: string): Promise<DomainMemberResponse | null> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const existingMember = await db
        .select()
        .from(domainMembers)
        .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.userId, userId)))
        .limit(1);

      if (existingMember.length > 0) {
        logger.debug('User already a member of domain', { domainId, userId });
        return null;
      }

      const result = await db.transaction(async tx => {
        const [membership] = await tx
          .insert(domainMembers)
          .values({ domainId, userId })
          .returning();

        if (!membership) {
          logger.error('Failed to add domain member: database insert returned empty', {
            domainId,
            userId,
          });
          trackError(OPERATIONS.DOMAIN_ADD_MEMBER, 'DB_INSERT_FAILED');
          return null;
        }

        await tx.update(users).set({ domainId }).where(eq(users.id, userId));

        const [user] = await tx
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        return {
          id: membership.id,
          domainId: membership.domainId,
          userId: membership.userId,
          userName: user?.name ?? null,
          userEmail: user?.email ?? '',
          joinedAt: membership.joinedAt.toISOString(),
        };
      });

      if (!result) return null;

      const durationMs = Date.now() - startTime;
      logger.info('User added to domain', { domainId, userId, durationMs });
      trackSuccess(OPERATIONS.DOMAIN_ADD_MEMBER, durationMs);

      // Social proof check outside transaction
      await this.checkSocialProofVerification(domainId);

      return result;
    } catch (err) {
      logger.logError('Unexpected error adding domain member', err, { domainId, userId });
      trackError(OPERATIONS.DOMAIN_ADD_MEMBER, 'UNEXPECTED_ERROR');
      throw err;
    }
  }

  async getMemberCount(domainId: string): Promise<number> {
    const { db } = this.deps;

    const [result] = await db
      .select({ count: count() })
      .from(domainMembers)
      .where(eq(domainMembers.domainId, domainId));

    return result?.count ?? 0;
  }

  async getOrganizationCount(domainId: string): Promise<number> {
    const { db } = this.deps;

    const [result] = await db
      .select({ count: count() })
      .from(organizations)
      .where(eq(organizations.domainId, domainId));

    return result?.count ?? 0;
  }

  async canCreateOrganization(domainId: string | null): Promise<boolean> {
    if (!domainId) return true;

    const orgCount = await this.getOrganizationCount(domainId);
    return orgCount < MAX_ORGS_PER_DOMAIN;
  }

  async isDomainAdmin(domainId: string, userId: string): Promise<boolean> {
    const { db } = this.deps;

    const [domain] = await db
      .select({ domainAdminId: domains.domainAdminId })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    return domain?.domainAdminId === userId;
  }

  async generateVerificationToken(domainId: string): Promise<string> {
    const { db } = this.deps;
    const token = randomBytes(32).toString('hex');

    await db.update(domains).set({ verificationToken: token }).where(eq(domains.id, domainId));

    return token;
  }

  async verifyDomain(domainId: string, method: VerificationMethod): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      await db
        .update(domains)
        .set({
          status: 'verified',
          verificationMethod: method,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(domains.id, domainId));

      const [domain] = await db
        .select({ name: domains.name, domainAdminId: domains.domainAdminId })
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1);

      const durationMs = Date.now() - startTime;
      logger.info('Domain verified', { domainId, method, durationMs });
      trackSuccess(OPERATIONS.DOMAIN_VERIFY, durationMs);
      metrics.trackKpi(KPI_EVENTS.DOMAIN_VERIFIED, domain?.domainAdminId ?? undefined, undefined, {
        domainName: domain?.name,
        method,
      });
    } catch (err) {
      logger.logError('Failed to verify domain', err, { domainId, method });
      trackError(OPERATIONS.DOMAIN_VERIFY, 'UNEXPECTED_ERROR');
      throw err;
    }
  }

  async verifyByAdmin(domainId: string): Promise<void> {
    await this.verifyDomain(domainId, 'super_admin');
  }

  async checkSocialProofVerification(domainId: string): Promise<boolean> {
    const { db } = this.deps;

    const [domain] = await db
      .select({ status: domains.status })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (domain?.status === 'verified') {
      return true;
    }

    const memberCount = await this.getMemberCount(domainId);

    if (memberCount >= SOCIAL_PROOF_THRESHOLD) {
      await this.verifyDomain(domainId, 'social_proof');
      return true;
    }

    return false;
  }

  async updateSsoConfig(domainId: string, config: SamlConfig | null): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const ssoEnabled = config !== null;

      await db
        .update(domains)
        .set({
          ssoEnabled,
          ssoConfig: config,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, domainId));

      if (ssoEnabled) {
        const [domain] = await db
          .select({ status: domains.status })
          .from(domains)
          .where(eq(domains.id, domainId))
          .limit(1);

        if (domain?.status === 'pending') {
          await this.verifyDomain(domainId, 'sso');
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('Domain SSO config updated', { domainId, ssoEnabled, durationMs });
      trackSuccess(OPERATIONS.DOMAIN_SSO_CONFIG, durationMs);

      if (ssoEnabled) {
        metrics.trackKpi(KPI_EVENTS.DOMAIN_SSO_ENABLED, undefined, undefined, { domainId });
      }
    } catch (err) {
      logger.logError('Failed to update SSO config', err, { domainId });
      trackError(OPERATIONS.DOMAIN_SSO_CONFIG, 'UNEXPECTED_ERROR');
      throw err;
    }
  }

  async getSsoConfig(domainId: string): Promise<SamlConfig | null> {
    const { db } = this.deps;

    const [domain] = await db
      .select({ ssoConfig: domains.ssoConfig })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    return domain?.ssoConfig ?? null;
  }

  async requestDnsVerification(domainId: string): Promise<DnsVerificationInfo> {
    const { db } = this.deps;

    const [domain] = await db
      .select({ name: domains.name, verificationToken: domains.verificationToken })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    let token = domain.verificationToken;
    if (!token) {
      token = await this.generateVerificationToken(domainId);
    }

    return {
      domainId,
      domainName: domain.name,
      dnsRecordType: 'TXT',
      dnsRecordName: `_agentinsync.${domain.name}`,
      dnsRecordValue: `${DNS_VERIFICATION_PREFIX}${token}`,
    };
  }

  async checkDnsVerification(domainId: string): Promise<boolean> {
    const { db } = this.deps;

    const [domain] = await db
      .select({
        name: domains.name,
        verificationToken: domains.verificationToken,
        status: domains.status,
      })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    if (domain.status === 'verified') {
      return true;
    }

    if (!domain.verificationToken) {
      logger.debug('No verification token set for domain', { domainId });
      return false;
    }

    const expectedValue = `${DNS_VERIFICATION_PREFIX}${domain.verificationToken}`;
    const recordName = `_agentinsync.${domain.name}`;

    try {
      const records = await dns.resolveTxt(recordName);
      const flatRecords = records.map(r => r.join(''));

      const found = flatRecords.some(record => record === expectedValue);

      if (found) {
        await this.verifyDomain(domainId, 'dns_txt');
        logger.info('Domain verified via DNS TXT record', { domainId, domainName: domain.name });
        return true;
      }

      logger.debug('DNS TXT record not found or does not match', {
        domainId,
        recordName,
        expectedValue,
        foundRecords: flatRecords,
      });
      return false;
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENODATA') {
        logger.debug('No TXT records found for domain', { domainId, recordName });
        return false;
      }
      if (err instanceof Error && 'code' in err && err.code === 'ENOTFOUND') {
        logger.debug('DNS record not found', { domainId, recordName });
        return false;
      }
      logger.logError('Error checking DNS verification', err, { domainId, recordName });
      return false;
    }
  }

  async getVerificationStatus(domainId: string): Promise<VerificationStatusResponse> {
    const { db } = this.deps;

    const [domain] = await db
      .select({
        name: domains.name,
        status: domains.status,
        verificationMethod: domains.verificationMethod,
        verificationToken: domains.verificationToken,
        verifiedAt: domains.verifiedAt,
      })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    const memberCount = await this.getMemberCount(domainId);

    return {
      domainId,
      domainName: domain.name,
      status: domain.status,
      verificationMethod: domain.verificationMethod,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      memberCount,
      socialProofThreshold: SOCIAL_PROOF_THRESHOLD,
      socialProofProgress: Math.min(memberCount, SOCIAL_PROOF_THRESHOLD),
      dnsVerification: domain.verificationToken
        ? {
            recordType: 'TXT',
            recordName: `_agentinsync.${domain.name}`,
            recordValue: `${DNS_VERIFICATION_PREFIX}${domain.verificationToken}`,
          }
        : null,
    };
  }
}

export type DnsVerificationInfo = {
  domainId: string;
  domainName: string;
  dnsRecordType: 'TXT';
  dnsRecordName: string;
  dnsRecordValue: string;
};

export type VerificationStatusResponse = {
  domainId: string;
  domainName: string;
  status: DomainStatus;
  verificationMethod: VerificationMethod | null;
  verifiedAt: string | null;
  memberCount: number;
  socialProofThreshold: number;
  socialProofProgress: number;
  dnsVerification: {
    recordType: 'TXT';
    recordName: string;
    recordValue: string;
  } | null;
};

export { isPublicEmailDomain, extractDomainFromEmail };
