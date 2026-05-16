import { SAML, type SamlConfig as NodeSamlConfig } from '@node-saml/node-saml';
import { getDb, users, sessions, domains, domainMembers } from '@agent-in-sync/db-client';
import type { SamlConfig } from '@agent-in-sync/db-client';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { logger } from '../observability/index.js';

export type SamlAssertionResult = {
  email: string;
  firstName?: string;
  lastName?: string;
  nameId: string;
  sessionIndex?: string;
};

export class SamlService {
  async generateSpMetadata(domainConfig: SamlConfig, _domainName: string): Promise<string> {
    const saml = this.createSamlInstance(domainConfig);

    const metadata = saml.generateServiceProviderMetadata(null, null);

    return metadata;
  }

  async validateAssertion(
    samlResponse: string,
    domainConfig: SamlConfig
  ): Promise<SamlAssertionResult> {
    const saml = this.createSamlInstance(domainConfig);

    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
      const profile = result.profile;

      if (!profile) {
        throw new Error('Invalid SAML response: no profile returned');
      }

      const email = this.extractAttribute(
        profile as Record<string, unknown>,
        domainConfig.attributeMapping.email
      );
      if (!email) {
        throw new Error('Email not found in SAML assertion');
      }

      const firstName = domainConfig.attributeMapping.firstName
        ? this.extractAttribute(
            profile as Record<string, unknown>,
            domainConfig.attributeMapping.firstName
          )
        : undefined;

      const lastName = domainConfig.attributeMapping.lastName
        ? this.extractAttribute(
            profile as Record<string, unknown>,
            domainConfig.attributeMapping.lastName
          )
        : undefined;

      return {
        email,
        firstName,
        lastName,
        nameId: profile.nameID ?? email,
        sessionIndex: profile.sessionIndex,
      };
    } catch (err) {
      logger.logError('SAML assertion validation failed', err, {});
      throw err;
    }
  }

  async createOrUpdateUserFromAssertion(
    assertion: SamlAssertionResult,
    domainId: string
  ): Promise<{ userId: string; sessionToken: string }> {
    const db = getDb();
    return db.transaction(async tx => {
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, assertion.email))
        .limit(1);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;

        const updateData: Record<string, unknown> = {
          emailVerified: true,
          updatedAt: new Date(),
        };

        if (assertion.firstName || assertion.lastName) {
          const name = [assertion.firstName, assertion.lastName].filter(Boolean).join(' ');
          if (name) {
            updateData.name = name;
          }
        }

        if (!existingUser.domainId) {
          updateData.domainId = domainId;
        }

        await tx.update(users).set(updateData).where(eq(users.id, userId));

        if (!existingUser.domainId) {
          const existingMembership = await tx
            .select()
            .from(domainMembers)
            .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.userId, userId)))
            .limit(1);

          if (existingMembership.length === 0) {
            await tx.insert(domainMembers).values({ domainId, userId });
          }
        }
      } else {
        const name = [assertion.firstName, assertion.lastName].filter(Boolean).join(' ') || null;

        const [newUser] = await tx
          .insert(users)
          .values({
            email: assertion.email,
            emailVerified: true,
            name,
            domainId,
          })
          .returning();

        if (!newUser) {
          throw new Error('Failed to create user from SAML assertion');
        }

        userId = newUser.id;

        await tx.insert(domainMembers).values({ domainId, userId });
      }

      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await tx.insert(sessions).values({
        userId,
        token: sessionToken,
        expiresAt,
      });

      return { userId, sessionToken };
    });
  }

  async getLoginUrl(domainConfig: SamlConfig, relayState?: string): Promise<string> {
    const saml = this.createSamlInstance(domainConfig);

    const authorizeUrl = await saml.getAuthorizeUrlAsync(relayState ?? '', undefined, {});

    return authorizeUrl;
  }

  async findDomainBySlug(
    domainSlug: string
  ): Promise<{ domain: typeof domains.$inferSelect; ssoConfig: SamlConfig } | null> {
    const db = getDb();

    const domainName = domainSlug.replace(/~/g, '.');

    const [domain] = await db.select().from(domains).where(eq(domains.name, domainName)).limit(1);

    if (!domain || !domain.ssoEnabled || !domain.ssoConfig) {
      return null;
    }

    return { domain, ssoConfig: domain.ssoConfig };
  }

  private createSamlInstance(config: SamlConfig): SAML {
    const samlConfig: NodeSamlConfig = {
      callbackUrl: config.spAcsUrl,
      entryPoint: config.idpSsoUrl,
      issuer: config.spEntityId,
      idpCert: config.idpCertificate,
      wantAssertionsSigned: config.wantAssertionsSigned,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
    };

    return new SAML(samlConfig);
  }

  private extractAttribute(
    profile: Record<string, unknown>,
    attributeName: string
  ): string | undefined {
    const value = profile[attributeName];
    if (Array.isArray(value)) {
      return value[0] as string | undefined;
    }
    return value as string | undefined;
  }
}
