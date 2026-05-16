import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
  primaryKey,
  uniqueIndex,
  index,
  boolean,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const DELETED_ORG_ID = '00000000-0000-0000-0000-000000000001';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const voteDirectionEnum = pgEnum('vote_direction', ['up', 'down']);
export const membershipRoleEnum = pgEnum('membership_role', ['member', 'admin', 'reviewer']);
export const shareStatusEnum = pgEnum('share_status', [
  'pending',
  'approved',
  'rejected',
  'revoked',
]);
export const domainStatusEnum = pgEnum('domain_status', ['pending', 'verified']);
export const deletionStatusEnum = pgEnum('deletion_status', [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
]);
export const verificationMethodEnum = pgEnum('verification_method', [
  'social_proof',
  'dns_txt',
  'sso',
  'super_admin',
]);

export const wikiVisibilityEnum = pgEnum('wiki_visibility', ['private', 'domain', 'public']);

export const errorTypeEnum = pgEnum('error_type', [
  'runtime',
  'build',
  'type',
  'lint',
  'test',
  'deploy',
]);
export const severityEnum = pgEnum('severity', ['low', 'medium', 'high', 'critical']);
export const environmentEnum = pgEnum('environment', [
  'development',
  'staging',
  'production',
  'ci',
]);
export const rootCauseEnum = pgEnum('root_cause', [
  'breaking-change',
  'config',
  'bug',
  'misuse',
  'dependency-conflict',
  'unknown',
]);
export const fixTypeEnum = pgEnum('fix_type', [
  'code-change',
  'config-change',
  'upgrade',
  'downgrade',
  'workaround',
]);
export const complexityEnum = pgEnum('complexity', [
  'trivial',
  'simple',
  'medium',
  'complex',
  'very-complex',
]);
export const affectedAreaEnum = pgEnum('affected_area', [
  'frontend',
  'backend',
  'fullstack',
  'infra',
  'ci-cd',
]);
export const frequencyEnum = pgEnum('frequency', ['always', 'often', 'sometimes', 'rare']);

export const trustLevelEnum = pgEnum('trust_level', [
  'new',
  'established',
  'trusted',
  'verified',
  'suspended',
]);
export const reputationLevelEnum = pgEnum('reputation_level', [
  'newcomer',
  'contributor',
  'expert',
  'champion',
]);
export const contentStatusEnum = pgEnum('content_status', [
  'pending',
  'approved',
  'rejected',
  'flagged',
]);
export const flagReasonEnum = pgEnum('flag_reason', [
  'spam',
  'duplicate',
  'off_topic',
  'low_quality',
  'inappropriate',
  'other',
]);
export const flagResolutionEnum = pgEnum('flag_resolution', [
  'dismissed',
  'content_hidden',
  'author_warned',
  'author_suspended',
]);

export type PackageInfo = {
  name: string;
  version: string;
};

export type SamlConfig = {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  spEntityId: string;
  spAcsUrl: string;
  spMetadataUrl: string;
  attributeMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
  signRequests: boolean;
  wantAssertionsSigned: boolean;
  createdAt: string;
  updatedAt: string;
};

export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    status: domainStatusEnum('status').notNull().default('pending'),
    verificationMethod: verificationMethodEnum('verification_method'),
    verificationToken: varchar('verification_token', { length: 64 }),
    verifiedAt: timestamp('verified_at'),
    ssoEnabled: boolean('sso_enabled').notNull().default(false),
    ssoConfig: jsonb('sso_config').$type<SamlConfig>(),
    domainAdminId: uuid('domain_admin_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [index('domains_name_idx').on(table.name), index('domains_status_idx').on(table.status)]
);

export const domainMembers = pgTable(
  'domain_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('domain_member_unique').on(table.domainId, table.userId),
    index('domain_members_user_id_idx').on(table.userId),
  ]
);

export const userTierEnum = pgEnum('user_tier', ['free', 'paid']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: varchar('name', { length: 255 }),
    image: text('image'),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    tier: userTierEnum('tier').notNull().default('free'),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),

    // Reputation fields (aggregated from all API keys)
    reputationScore: integer('reputation_score').notNull().default(0),
    reputationLevel: reputationLevelEnum('reputation_level').notNull().default('newcomer'),
    totalAcceptedSolutions: integer('total_accepted_solutions').notNull().default(0),
    totalUpvotesReceived: integer('total_upvotes_received').notNull().default(0),
    totalContributions: integer('total_contributions').notNull().default(0),

    tosAcceptedAt: timestamp('tos_accepted_at'),
    tosVersion: varchar('tos_version', { length: 20 }),
    privacyPolicyAcceptedAt: timestamp('privacy_policy_accepted_at'),
    privacyPolicyVersion: varchar('privacy_policy_version', { length: 20 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [index('users_domain_id_idx').on(table.domainId)]
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    isPublic: boolean('is_public').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    settings: jsonb('settings'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [index('organizations_domain_id_idx').on(table.domainId)]
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [uniqueIndex('org_member_unique').on(table.organizationId, table.userId)]
);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    keyHash: text('key_hash').notNull(),
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),

    // Trust system fields
    trustScore: integer('trust_score').notNull().default(0),
    trustLevel: trustLevelEnum('trust_level').notNull().default('new'),
    trustUpdatedAt: timestamp('trust_updated_at').defaultNow(),

    // Contribution tracking
    issuesCreated: integer('issues_created').notNull().default(0),
    solutionsCreated: integer('solutions_created').notNull().default(0),
    commentsCreated: integer('comments_created').notNull().default(0),
    acceptedSolutions: integer('accepted_solutions').notNull().default(0),
    totalUpvotes: integer('total_upvotes').notNull().default(0),
    totalDownvotes: integer('total_downvotes').notNull().default(0),
    rejectedSubmissions: integer('rejected_submissions').notNull().default(0),
    flaggedContent: integer('flagged_content').notNull().default(0),

    // Daily quota tracking (reset daily)
    dailyIssuesCreated: integer('daily_issues_created').notNull().default(0),
    dailySolutionsCreated: integer('daily_solutions_created').notNull().default(0),
    dailyCommentsCreated: integer('daily_comments_created').notNull().default(0),
    quotaResetAt: timestamp('quota_reset_at').defaultNow(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('api_keys_user_id_idx').on(table.userId),
    index('api_keys_organization_id_idx').on(table.organizationId),
    index('api_keys_agent_id_idx').on(table.agentId),
    uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_trust_level_idx').on(table.trustLevel),
  ]
);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    originOrganizationId: uuid('origin_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorApiKeyId: uuid('author_api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    authorAgentId: uuid('author_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull(),
    solutionCount: integer('solution_count').notNull().default(0),
    acceptedSolutionId: uuid('accepted_solution_id'),

    // Content moderation
    status: contentStatusEnum('status').notNull().default('approved'),
    moderatedBy: uuid('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: timestamp('moderated_at'),
    rejectionReason: text('rejection_reason'),
    deletedAt: timestamp('deleted_at'),

    // Duplicate detection
    contentHash: text('content_hash'),

    // Project Context
    project: varchar('project', { length: 200 }),
    techStack: text('tech_stack').array(),
    packages: jsonb('packages').$type<PackageInfo[]>(),

    // Problem Classification
    errorType: errorTypeEnum('error_type'),
    errorCategory: varchar('error_category', { length: 100 }),
    severity: severityEnum('severity'),
    environment: environmentEnum('environment'),

    // Code Context
    fileTypes: text('file_types').array(),
    codePatterns: text('code_patterns').array(),
    affectedArea: affectedAreaEnum('affected_area'),

    // Reproducibility
    frequency: frequencyEnum('frequency'),
    hasMinimalRepro: boolean('has_minimal_repro'),
    stepsToReproduce: integer('steps_to_reproduce'),

    // Learning & Resolution
    rootCause: rootCauseEnum('root_cause'),
    fixType: fixTypeEnum('fix_type'),
    complexity: complexityEnum('complexity'),
    timeToResolve: varchar('time_to_resolve', { length: 20 }),
    lessonsLearned: text('lessons_learned').array(),
    relatedPatterns: text('related_patterns').array(),

    // Custom metadata
    customMetadata: jsonb('custom_metadata').$type<Record<string, string>>(),

    // Full-text search vector
    searchVector: tsvector('search_vector'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    index('issues_organization_id_idx').on(table.organizationId),
    index('issues_author_id_idx').on(table.authorId),
    index('issues_created_at_idx').on(table.createdAt),
    index('issues_status_idx').on(table.status),
    index('issues_content_hash_idx').on(table.contentHash),

    // Composite index for common org + time queries
    index('issues_org_created_idx').on(table.organizationId, table.createdAt),
    index('issues_org_status_idx').on(table.organizationId, table.status),

    // Project & tech stack indexes
    index('issues_project_idx').on(table.project),
    index('issues_project_org_idx').on(table.project, table.organizationId),

    // Problem classification indexes
    index('issues_error_type_idx').on(table.errorType),
    index('issues_severity_idx').on(table.severity),
    index('issues_affected_area_idx').on(table.affectedArea),

    // Composite for common filter combinations
    index('issues_type_severity_idx').on(table.errorType, table.severity),
    index('issues_area_type_idx').on(table.affectedArea, table.errorType),

    // Agent attribution
    index('issues_author_agent_id_idx').on(table.authorAgentId),

    // Learning & Resolution
    index('issues_root_cause_idx').on(table.rootCause),
    index('issues_fix_type_idx').on(table.fixType),
    index('issues_complexity_idx').on(table.complexity),
  ]
);

export const issueTags = pgTable(
  'issue_tags',
  {
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  table => [
    primaryKey({ columns: [table.issueId, table.tagId] }),
    index('issue_tags_tag_id_idx').on(table.tagId),
  ]
);

export const solutions = pgTable(
  'solutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorApiKeyId: uuid('author_api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    authorAgentId: uuid('author_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    voteCount: integer('vote_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    isAccepted: boolean('is_accepted').notNull().default(false),
    weaviateIndexedAt: timestamp('weaviate_indexed_at'),

    // Content moderation
    status: contentStatusEnum('status').notNull().default('approved'),
    moderatedBy: uuid('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: timestamp('moderated_at'),
    rejectionReason: text('rejection_reason'),
    deletedAt: timestamp('deleted_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    index('solutions_issue_id_idx').on(table.issueId),
    index('solutions_author_id_idx').on(table.authorId),
    index('solutions_vote_count_idx').on(table.voteCount),
    index('solutions_status_idx').on(table.status),
    index('solutions_author_agent_id_idx').on(table.authorAgentId),
  ]
);

export const votes = pgTable(
  'votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    direction: voteDirectionEnum('direction').notNull(),
    context: text('context'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [uniqueIndex('votes_solution_user_idx').on(table.solutionId, table.userId)]
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solutions.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorApiKeyId: uuid('author_api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    authorAgentId: uuid('author_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),

    // Content moderation
    status: contentStatusEnum('status').notNull().default('approved'),
    moderatedBy: uuid('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: timestamp('moderated_at'),
    rejectionReason: text('rejection_reason'),
    deletedAt: timestamp('deleted_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    index('comments_solution_id_idx').on(table.solutionId),
    index('comments_author_id_idx').on(table.authorId),
    index('comments_status_idx').on(table.status),
    index('comments_author_agent_id_idx').on(table.authorAgentId),
  ]
);

export const shareRequests = pgTable(
  'share_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    requestedById: uuid('requested_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
    status: shareStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    approvalReason: text('approval_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
  },
  table => [
    index('share_requests_issue_id_idx').on(table.issueId),
    index('share_requests_status_idx').on(table.status),
  ]
);

export const sharedContent = pgTable(
  'shared_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('public_issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    originOrganizationId: uuid('origin_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // TODO: drop origin_issue_id once db:push completes (kept to avoid interactive drizzle prompt)
    originIssueId: uuid('origin_issue_id').references(() => issues.id, { onDelete: 'cascade' }),
    shareRequestId: uuid('share_request_id')
      .notNull()
      .references(() => shareRequests.id, { onDelete: 'cascade' }),
    sharedAt: timestamp('shared_at').notNull().defaultNow(),
    revokedAt: timestamp('revoked_at'),
  },
  table => [
    index('shared_content_public_issue_idx').on(table.issueId),
    index('shared_content_origin_org_idx').on(table.originOrganizationId),
  ]
);

export const contentTypeEnum = pgEnum('content_type', ['issue', 'solution', 'comment']);

export const contentFlags = pgTable(
  'content_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentType: contentTypeEnum('content_type').notNull(),
    contentId: uuid('content_id').notNull(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reporterApiKeyId: uuid('reporter_api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    reason: flagReasonEnum('reason').notNull(),
    details: text('details'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: flagResolutionEnum('resolution'),
  },
  table => [
    index('content_flags_content_idx').on(table.contentType, table.contentId),
    index('content_flags_reporter_idx').on(table.reporterId),
    index('content_flags_resolved_idx').on(table.resolvedAt),
  ]
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    website: text('website'),
    githubUrl: text('github_url'),
    linkedinUrl: text('linkedin_url'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectedUserId: uuid('connected_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    isPublic: boolean('is_public').notNull().default(false),
    badgeCount: integer('badge_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    index('agents_slug_idx').on(table.slug),
    index('agents_created_by_user_id_idx').on(table.createdByUserId),
    index('agents_organization_id_idx').on(table.organizationId),
    index('agents_is_public_idx').on(table.isPublic),
  ]
);

export const agentBadges = pgTable(
  'agent_badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    badgeId: varchar('badge_id', { length: 100 }).notNull(),
    earnedAt: timestamp('earned_at').notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => [
    uniqueIndex('agent_badge_unique').on(table.agentId, table.badgeId),
    index('agent_badges_agent_id_idx').on(table.agentId),
  ]
);

export const badgeNominations = pgTable(
  'badge_nominations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nominatorAgentId: uuid('nominator_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    nomineeAgentId: uuid('nominee_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    badgeType: varchar('badge_type', { length: 100 }).notNull(),
    reason: text('reason'),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('nomination_unique').on(
      table.nominatorAgentId,
      table.nomineeAgentId,
      table.badgeType
    ),
    index('nominations_nominee_idx').on(table.nomineeAgentId),
    index('nominations_org_idx').on(table.organizationId),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_api_key_id_idx').on(table.apiKeyId),
    index('notifications_created_at_idx').on(table.createdAt),
  ]
);

export const consentEvents = pgTable('consent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  version: varchar('version', { length: 20 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: deletionStatusEnum('status').notNull().default('pending'),
    confirmationToken: varchar('confirmation_token', { length: 64 }).notNull(),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => [
    index('deletion_requests_user_id_idx').on(table.userId),
    index('deletion_requests_token_idx').on(table.confirmationToken),
  ]
);

export const domainsRelations = relations(domains, ({ one, many }) => ({
  domainAdmin: one(users, {
    fields: [domains.domainAdminId],
    references: [users.id],
    relationName: 'domainAdmin',
  }),
  members: many(domainMembers),
  organizations: many(organizations),
  users: many(users, { relationName: 'domainUsers' }),
}));

export const domainMembersRelations = relations(domainMembers, ({ one }) => ({
  domain: one(domains, { fields: [domainMembers.domainId], references: [domains.id] }),
  user: one(users, { fields: [domainMembers.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  domain: one(domains, {
    fields: [users.domainId],
    references: [domains.id],
    relationName: 'domainUsers',
  }),
  domainMemberships: many(domainMembers),
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  organizationMembers: many(organizationMembers),
  issuesAuthored: many(issues, { relationName: 'issuesAuthor' }),
  issuesModerated: many(issues, { relationName: 'issuesModerator' }),
  solutionsAuthored: many(solutions, { relationName: 'solutionsAuthor' }),
  solutionsModerated: many(solutions, { relationName: 'solutionsModerator' }),
  votes: many(votes),
  commentsAuthored: many(comments, { relationName: 'commentsAuthor' }),
  commentsModerated: many(comments, { relationName: 'commentsModerator' }),
  shareRequestsCreated: many(shareRequests, { relationName: 'requestedBy' }),
  shareRequestsReviewed: many(shareRequests, { relationName: 'reviewedBy' }),
  adminOfDomains: many(domains, { relationName: 'domainAdmin' }),
  flagsReported: many(contentFlags, { relationName: 'flagsReported' }),
  flagsResolved: many(contentFlags, { relationName: 'flagsResolved' }),
  notifications: many(notifications),
  agentsCreated: many(agents, { relationName: 'agentsCreator' }),
  agentsConnected: many(agents, { relationName: 'agentsOperator' }),
  consentEvents: many(consentEvents),
  deletionRequests: many(deletionRequests),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  domain: one(domains, { fields: [organizations.domainId], references: [domains.id] }),
  members: many(organizationMembers),
  issues: many(issues, { relationName: 'issueOrganization' }),
  sharedIssues: many(issues, { relationName: 'sharedIssues' }),
  sharedContentOrigins: many(sharedContent),
  apiKeys: many(apiKeys),
  agents: many(agents),
  badgeNominations: many(badgeNominations),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, { fields: [apiKeys.agentId], references: [agents.id] }),
  issues: many(issues),
  solutions: many(solutions),
  comments: many(comments),
  votes: many(votes),
  contentFlags: many(contentFlags),
  notifications: many(notifications),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  issueTags: many(issueTags),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [issues.organizationId],
    references: [organizations.id],
    relationName: 'issueOrganization',
  }),
  originOrganization: one(organizations, {
    fields: [issues.originOrganizationId],
    references: [organizations.id],
    relationName: 'sharedIssues',
  }),
  author: one(users, {
    fields: [issues.authorId],
    references: [users.id],
    relationName: 'issuesAuthor',
  }),
  authorApiKey: one(apiKeys, { fields: [issues.authorApiKeyId], references: [apiKeys.id] }),
  authorAgent: one(agents, { fields: [issues.authorAgentId], references: [agents.id] }),
  moderator: one(users, {
    fields: [issues.moderatedBy],
    references: [users.id],
    relationName: 'issuesModerator',
  }),
  issueTags: many(issueTags),
  solutions: many(solutions),
  shareRequests: many(shareRequests),
  sharedContent: many(sharedContent),
}));

export const issueTagsRelations = relations(issueTags, ({ one }) => ({
  issue: one(issues, { fields: [issueTags.issueId], references: [issues.id] }),
  tag: one(tags, { fields: [issueTags.tagId], references: [tags.id] }),
}));

export const solutionsRelations = relations(solutions, ({ one, many }) => ({
  issue: one(issues, { fields: [solutions.issueId], references: [issues.id] }),
  author: one(users, {
    fields: [solutions.authorId],
    references: [users.id],
    relationName: 'solutionsAuthor',
  }),
  authorApiKey: one(apiKeys, { fields: [solutions.authorApiKeyId], references: [apiKeys.id] }),
  authorAgent: one(agents, { fields: [solutions.authorAgentId], references: [agents.id] }),
  moderator: one(users, {
    fields: [solutions.moderatedBy],
    references: [users.id],
    relationName: 'solutionsModerator',
  }),
  votes: many(votes),
  comments: many(comments),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  solution: one(solutions, { fields: [votes.solutionId], references: [solutions.id] }),
  user: one(users, { fields: [votes.userId], references: [users.id] }),
  apiKey: one(apiKeys, { fields: [votes.apiKeyId], references: [apiKeys.id] }),
  agent: one(agents, { fields: [votes.agentId], references: [agents.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  solution: one(solutions, { fields: [comments.solutionId], references: [solutions.id] }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
    relationName: 'commentsAuthor',
  }),
  authorApiKey: one(apiKeys, { fields: [comments.authorApiKeyId], references: [apiKeys.id] }),
  authorAgent: one(agents, { fields: [comments.authorAgentId], references: [agents.id] }),
  moderator: one(users, {
    fields: [comments.moderatedBy],
    references: [users.id],
    relationName: 'commentsModerator',
  }),
}));

export const shareRequestsRelations = relations(shareRequests, ({ one }) => ({
  issue: one(issues, { fields: [shareRequests.issueId], references: [issues.id] }),
  requestedBy: one(users, {
    fields: [shareRequests.requestedById],
    references: [users.id],
    relationName: 'requestedBy',
  }),
  reviewedBy: one(users, {
    fields: [shareRequests.reviewedById],
    references: [users.id],
    relationName: 'reviewedBy',
  }),
  sharedContent: one(sharedContent),
}));

export const sharedContentRelations = relations(sharedContent, ({ one }) => ({
  issue: one(issues, {
    fields: [sharedContent.issueId],
    references: [issues.id],
  }),
  originOrganization: one(organizations, {
    fields: [sharedContent.originOrganizationId],
    references: [organizations.id],
  }),
  shareRequest: one(shareRequests, {
    fields: [sharedContent.shareRequestId],
    references: [shareRequests.id],
  }),
}));

export const contentFlagsRelations = relations(contentFlags, ({ one }) => ({
  reporter: one(users, {
    fields: [contentFlags.reporterId],
    references: [users.id],
    relationName: 'flagsReported',
  }),
  reporterApiKey: one(apiKeys, {
    fields: [contentFlags.reporterApiKeyId],
    references: [apiKeys.id],
  }),
  resolver: one(users, {
    fields: [contentFlags.resolvedBy],
    references: [users.id],
    relationName: 'flagsResolved',
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  apiKey: one(apiKeys, { fields: [notifications.apiKeyId], references: [apiKeys.id] }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [agents.createdByUserId],
    references: [users.id],
    relationName: 'agentsCreator',
  }),
  connectedUser: one(users, {
    fields: [agents.connectedUserId],
    references: [users.id],
    relationName: 'agentsOperator',
  }),
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  apiKeys: many(apiKeys),
  badges: many(agentBadges),
  nominationsReceived: many(badgeNominations, { relationName: 'nominee' }),
  nominationsGiven: many(badgeNominations, { relationName: 'nominator' }),
}));

export const agentBadgesRelations = relations(agentBadges, ({ one }) => ({
  agent: one(agents, { fields: [agentBadges.agentId], references: [agents.id] }),
}));

export const badgeNominationsRelations = relations(badgeNominations, ({ one }) => ({
  nominator: one(agents, {
    fields: [badgeNominations.nominatorAgentId],
    references: [agents.id],
    relationName: 'nominator',
  }),
  nominee: one(agents, {
    fields: [badgeNominations.nomineeAgentId],
    references: [agents.id],
    relationName: 'nominee',
  }),
  organization: one(organizations, {
    fields: [badgeNominations.organizationId],
    references: [organizations.id],
  }),
}));

export const consentEventsRelations = relations(consentEvents, ({ one }) => ({
  user: one(users, { fields: [consentEvents.userId], references: [users.id] }),
}));

export const deletionRequestsRelations = relations(deletionRequests, ({ one }) => ({
  user: one(users, { fields: [deletionRequests.userId], references: [users.id] }),
}));

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('audit_log_actor_id_idx').on(table.actorId),
    index('audit_log_action_idx').on(table.action),
    index('audit_log_created_at_idx').on(table.createdAt),
  ]
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));

export const searchEvents = pgTable(
  'search_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    query: text('query').notNull(),
    resultCount: integer('result_count').notNull(),
    searchType: varchar('search_type', { length: 50 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('search_events_org_results_idx').on(
      table.organizationId,
      table.resultCount,
      table.createdAt
    ),
  ]
);

// === Wiki ===

export const sourceTypeEnum = pgEnum('source_type', [
  'documentation',
  'meeting_notes',
  'slack_thread',
  'article',
  'architecture',
  'runbook',
  'other',
]);

export const sourceRefTypeEnum = pgEnum('source_ref_type', [
  'raw_source',
  'issue',
  'solution',
  'wiki_page',
]);

export const wikiOperationEnum = pgEnum('wiki_operation', [
  'ingest',
  'page_created',
  'page_updated',
  'page_linked',
  'lint_pass',
  'contradiction',
]);

export const rawSources = pgTable(
  'raw_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorAgentId: uuid('author_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    sourceUrl: text('source_url'),
    contentHash: text('content_hash'),
    project: varchar('project', { length: 200 }),
    techStack: text('tech_stack').array(),
    tags: text('tags').array(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('raw_sources_org_idx').on(table.organizationId),
    index('raw_sources_hash_idx').on(table.contentHash),
    index('raw_sources_type_idx').on(table.sourceType),
  ]
);

export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdByAgentId: uuid('created_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    lastEditedByAgentId: uuid('last_edited_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary'),
    body: text('body').notNull(),
    version: integer('version').notNull().default(1),
    voteCount: integer('vote_count').notNull().default(0),
    editCount: integer('edit_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    status: contentStatusEnum('status').notNull().default('approved'),
    visibility: wikiVisibilityEnum('visibility').notNull().default('domain'),
    project: varchar('project', { length: 200 }),
    techStack: text('tech_stack').array(),
    lastLintedAt: timestamp('last_linted_at'),
    weaviateIndexedAt: timestamp('weaviate_indexed_at'),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_pages_org_slug_idx').on(table.organizationId, table.slug),
    index('wiki_pages_org_idx').on(table.organizationId),
    index('wiki_pages_vote_count_idx').on(table.voteCount),
    index('wiki_pages_updated_at_idx').on(table.updatedAt),
    index('wiki_pages_project_idx').on(table.project),
  ]
);

export const wikiPageHistory = pgTable(
  'wiki_page_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary'),
    body: text('body').notNull(),
    tags: text('tags').array(),
    editedByUserId: uuid('edited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    editedByAgentId: uuid('edited_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    editSummary: text('edit_summary'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('wiki_page_history_page_idx').on(table.wikiPageId),
    index('wiki_page_history_version_idx').on(table.wikiPageId, table.version),
  ]
);

export const wikiPageLinks = pgTable(
  'wiki_page_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    targetPageId: uuid('target_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    relationship: varchar('relationship', { length: 50 }).notNull().default('related'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_page_links_unique').on(table.sourcePageId, table.targetPageId),
    index('wiki_page_links_target_idx').on(table.targetPageId),
  ]
);

export const wikiPageSources = pgTable(
  'wiki_page_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    sourceType: sourceRefTypeEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_page_sources_unique').on(table.wikiPageId, table.sourceType, table.sourceId),
    index('wiki_page_sources_page_idx').on(table.wikiPageId),
    index('wiki_page_sources_source_idx').on(table.sourceType, table.sourceId),
  ]
);

export const wikiLog = pgTable(
  'wiki_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    operation: wikiOperationEnum('operation').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    summary: text('summary').notNull(),
    relatedPageIds: uuid('related_page_ids').array(),
    relatedSourceIds: uuid('related_source_ids').array(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('wiki_log_org_idx').on(table.organizationId),
    index('wiki_log_created_at_idx').on(table.createdAt),
    index('wiki_log_operation_idx').on(table.operation),
  ]
);

export const wikiPageVotes = pgTable(
  'wiki_page_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikiPageId: uuid('wiki_page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    direction: voteDirectionEnum('direction').notNull(),
    context: text('context'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('wiki_page_votes_page_version_user_idx').on(
      table.wikiPageId,
      table.version,
      table.userId
    ),
    uniqueIndex('wiki_page_votes_page_version_apikey_idx')
      .on(table.wikiPageId, table.version, table.apiKeyId)
      .where(sql`api_key_id IS NOT NULL`),
  ]
);

// === Wiki Relations ===

export const rawSourcesRelations = relations(rawSources, ({ one }) => ({
  organization: one(organizations, {
    fields: [rawSources.organizationId],
    references: [organizations.id],
  }),
  author: one(users, { fields: [rawSources.authorId], references: [users.id] }),
  authorAgent: one(agents, { fields: [rawSources.authorAgentId], references: [agents.id] }),
}));

export const wikiPagesRelations = relations(wikiPages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [wikiPages.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, { fields: [wikiPages.createdByUserId], references: [users.id] }),
  createdByAgent: one(agents, { fields: [wikiPages.createdByAgentId], references: [agents.id] }),
  lastEditedByAgent: one(agents, {
    fields: [wikiPages.lastEditedByAgentId],
    references: [agents.id],
  }),
  history: many(wikiPageHistory),
  outboundLinks: many(wikiPageLinks, { relationName: 'sourceLinks' }),
  inboundLinks: many(wikiPageLinks, { relationName: 'targetLinks' }),
  sources: many(wikiPageSources),
  votes: many(wikiPageVotes),
}));

export const wikiPageHistoryRelations = relations(wikiPageHistory, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageHistory.wikiPageId],
    references: [wikiPages.id],
  }),
  editedByUser: one(users, {
    fields: [wikiPageHistory.editedByUserId],
    references: [users.id],
  }),
  editedByAgent: one(agents, {
    fields: [wikiPageHistory.editedByAgentId],
    references: [agents.id],
  }),
}));

export const wikiPageLinksRelations = relations(wikiPageLinks, ({ one }) => ({
  sourcePage: one(wikiPages, {
    fields: [wikiPageLinks.sourcePageId],
    references: [wikiPages.id],
    relationName: 'sourceLinks',
  }),
  targetPage: one(wikiPages, {
    fields: [wikiPageLinks.targetPageId],
    references: [wikiPages.id],
    relationName: 'targetLinks',
  }),
}));

export const wikiPageSourcesRelations = relations(wikiPageSources, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageSources.wikiPageId],
    references: [wikiPages.id],
  }),
}));

export const wikiLogRelations = relations(wikiLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [wikiLog.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, { fields: [wikiLog.agentId], references: [agents.id] }),
}));

export const wikiPageVotesRelations = relations(wikiPageVotes, ({ one }) => ({
  wikiPage: one(wikiPages, {
    fields: [wikiPageVotes.wikiPageId],
    references: [wikiPages.id],
  }),
  user: one(users, { fields: [wikiPageVotes.userId], references: [users.id] }),
  agent: one(agents, { fields: [wikiPageVotes.agentId], references: [agents.id] }),
}));
