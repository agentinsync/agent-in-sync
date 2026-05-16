import { getAxiomClient, getDataset, isAxiomEnabled } from './axiom.js';

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'agent-in-sync-backend';

type MetricEvent = {
  _time: string;
  type: 'metric';
  service: string;
  metric: string;
  value: number;
  tags?: Record<string, string>;
};

type KpiEvent = {
  _time: string;
  type: 'kpi';
  service: string;
  event: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
};

function sendToAxiom(event: MetricEvent | KpiEvent): void {
  const client = getAxiomClient();
  if (!client) return;
  client.ingest(getDataset(), [event]);
}

export const metrics = {
  increment(metric: string, value = 1, tags?: Record<string, string>): void {
    if (!isAxiomEnabled()) return;

    const event: MetricEvent = {
      _time: new Date().toISOString(),
      type: 'metric',
      service: SERVICE_NAME,
      metric,
      value,
      tags,
    };
    sendToAxiom(event);
  },

  gauge(metric: string, value: number, tags?: Record<string, string>): void {
    if (!isAxiomEnabled()) return;

    const event: MetricEvent = {
      _time: new Date().toISOString(),
      type: 'metric',
      service: SERVICE_NAME,
      metric,
      value,
      tags,
    };
    sendToAxiom(event);
  },

  timing(metric: string, durationMs: number, tags?: Record<string, string>): void {
    if (!isAxiomEnabled()) return;

    const event: MetricEvent = {
      _time: new Date().toISOString(),
      type: 'metric',
      service: SERVICE_NAME,
      metric: `${metric}.duration_ms`,
      value: durationMs,
      tags,
    };
    sendToAxiom(event);
  },

  trackKpi(
    event: string,
    userId?: string,
    organizationId?: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!isAxiomEnabled()) return;

    const kpiEvent: KpiEvent = {
      _time: new Date().toISOString(),
      type: 'kpi',
      service: SERVICE_NAME,
      event,
      userId,
      organizationId,
      metadata,
    };
    sendToAxiom(kpiEvent);
  },

  isEnabled(): boolean {
    return isAxiomEnabled();
  },
};

export const KPI_EVENTS = {
  ISSUE_SUBMITTED: 'issue.submitted',
  SOLUTION_SUBMITTED: 'solution.submitted',
  SOLUTION_VOTED: 'solution.voted',
  SOLUTION_ACCEPTED: 'solution.accepted',
  COMMENT_ADDED: 'comment.added',
  SUGGESTION_CREATED: 'suggestion.created',
  SEARCH_PERFORMED: 'search.performed',
  USER_AUTHENTICATED: 'user.authenticated',
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_JOINED: 'organization.joined',
  SHARE_REQUEST_CREATED: 'share_request.created',
  SHARE_REQUEST_APPROVED: 'share_request.approved',
  SHARE_REQUEST_REJECTED: 'share_request.rejected',
  API_KEY_CREATED: 'api_key.created',
  DOMAIN_CREATED: 'domain.created',
  DOMAIN_VERIFIED: 'domain.verified',
  DOMAIN_SSO_ENABLED: 'domain.sso_enabled',
  // Trust & moderation
  TRUST_LEVEL_CHANGED: 'trust.level_changed',
  CONTENT_FLAGGED: 'content.flagged',
  CONTENT_APPROVED: 'content.approved',
  CONTENT_REJECTED: 'content.rejected',
  QUOTA_EXCEEDED: 'quota.exceeded',
  // Duplicate detection
  DUPLICATE_FOUND: 'duplicate.found',
} as const;

export const OPERATIONS = {
  COMMENT_ADD: 'comment.add',
  VOTE_CAST: 'vote.cast',
  SUBMIT_ISSUE: 'submit.issue',
  SUGGEST_SOLUTION: 'suggest.solution',
  SEARCH_QUERY: 'search.query',
  ORGANIZATION_CREATE: 'organization.create',
  ORGANIZATION_GET: 'organization.get',
  ORGANIZATION_ADD_MEMBER: 'organization.add_member',
  ORGANIZATION_UPDATE_ROLE: 'organization.update_role',
  ORGANIZATION_REMOVE_MEMBER: 'organization.remove_member',
  ORGANIZATION_JOIN: 'organization.join',
  SHARE_REQUEST_CREATE: 'share_request.create',
  SHARE_REQUEST_APPROVE: 'share_request.approve',
  SHARE_REQUEST_REJECT: 'share_request.reject',
  SHARE_REQUEST_GET: 'share_request.get',
  API_KEY_CREATE: 'api_key.create',
  API_KEY_LIST: 'api_key.list',
  API_KEY_REVOKE: 'api_key.revoke',
  WEAVIATE_INDEX: 'weaviate.index',
  WEAVIATE_SEARCH: 'weaviate.search',
  WEAVIATE_UPDATE: 'weaviate.update',
  DOMAIN_CREATE: 'domain.create',
  DOMAIN_GET: 'domain.get',
  DOMAIN_ADD_MEMBER: 'domain.add_member',
  DOMAIN_VERIFY: 'domain.verify',
  DOMAIN_SSO_CONFIG: 'domain.sso_config',
  // Trust & reputation
  TRUST_UPDATE: 'trust.update',
  REPUTATION_UPDATE: 'reputation.update',
  // Quotas
  QUOTA_CHECK: 'quota.check',
  QUOTA_EXCEEDED: 'quota.exceeded',
  // Moderation
  MODERATION_APPROVE: 'moderation.approve',
  MODERATION_REJECT: 'moderation.reject',
  MODERATION_FLAG: 'moderation.flag',
  // Duplicate detection
  DUPLICATE_CHECK: 'duplicate.check',
  DUPLICATE_FOUND: 'duplicate.found',
  // Solution acceptance
  SOLUTION_ACCEPT: 'solution.accept',
} as const;

export function trackSuccess(
  operation: string,
  durationMs?: number,
  tags?: Record<string, string>
): void {
  metrics.increment(`${operation}.success`, 1, tags);
  metrics.increment(`${operation}.total`, 1, tags);
  if (durationMs !== undefined) {
    metrics.timing(operation, durationMs, tags);
  }
}

export function trackError(
  operation: string,
  errorType?: string,
  tags?: Record<string, string>
): void {
  metrics.increment(`${operation}.error`, 1, { ...tags, errorType: errorType ?? 'unknown' });
  metrics.increment(`${operation}.total`, 1, tags);
}
