import { getDb } from '@agent-in-sync/db-client';
import { getWeaviateClient } from '../weaviate/index.js';
import type { ServiceDependencies } from './dependencies.js';

import { CommentService, type CommentInput } from './comment.service.js';
import { VoteService, type VoteInput } from './vote.service.js';
import { SuggestService, type SuggestInput } from './suggest.service.js';
import { SubmitService, type SubmitInput } from './submit.service.js';
import { SearchService, type SearchInput } from './search.service.js';
import {
  OrganizationService,
  type CreateOrganizationInput,
  type AddMemberInput,
  type MembershipRole,
} from './organization.service.js';
import {
  ShareRequestService,
  type CreateShareRequestInput,
  type RejectShareRequestInput,
} from './share-request.service.js';
import { DomainService } from './domain.service.js';

export * from './dependencies.js';
export * from './search.service.js';
export * from './submit.service.js';
export * from './vote.service.js';
export * from './comment.service.js';
export * from './suggest.service.js';
export * from './organization.service.js';
export * from './share-request.service.js';
export * from './domain.service.js';
export * from './saml.service.js';
export * from './trust.service.js';
export * from './quota.service.js';
export * from './moderation.service.js';
export * from './duplicate.service.js';
export * from './super-admin.service.js';
export * from './notification.service.js';
export * from './stats.service.js';
export * from './agent.service.js';
export * from './wiki.service.js';
export { BadgeService } from './badges/badge.service.js';
export { NominationService } from './badges/nomination.service.js';
export { BADGE_DEFINITIONS, BADGE_MAP, COMMUNITY_BADGES } from './badges/badge-definitions.js';

export type Services = {
  comment: CommentService;
  vote: VoteService;
  suggest: SuggestService;
  submit: SubmitService;
  search: SearchService;
  organization: OrganizationService;
  shareRequest: ShareRequestService;
  domain: DomainService;
};

export async function createServices(): Promise<Services> {
  const db = getDb();
  const weaviateClient = await getWeaviateClient();
  const deps: ServiceDependencies = { db, weaviateClient };

  return {
    comment: new CommentService(deps),
    vote: new VoteService(deps),
    suggest: new SuggestService(deps),
    submit: new SubmitService(deps),
    search: new SearchService(deps),
    organization: new OrganizationService(deps),
    shareRequest: new ShareRequestService(deps),
    domain: new DomainService(deps),
  };
}

export function createServicesWithDeps(deps: ServiceDependencies): Services {
  return {
    comment: new CommentService(deps),
    vote: new VoteService(deps),
    suggest: new SuggestService(deps),
    submit: new SubmitService(deps),
    search: new SearchService(deps),
    organization: new OrganizationService(deps),
    shareRequest: new ShareRequestService(deps),
    domain: new DomainService(deps),
  };
}

let _services: Services | null = null;

export async function getServices(): Promise<Services> {
  if (!_services) {
    _services = await createServices();
  }
  return _services;
}

export async function createServiceDependencies(): Promise<ServiceDependencies> {
  const db = getDb();
  const weaviateClient = await getWeaviateClient();
  return { db, weaviateClient };
}

export function resetServices(): void {
  _services = null;
}

export function setServices(services: Services): void {
  _services = services;
}

export async function addComment(
  input: CommentInput,
  userId: string,
  organizationId: string,
  apiKeyId?: string,
  agentId?: string
) {
  const services = await getServices();
  return services.comment.addComment(input, userId, organizationId, apiKeyId, agentId);
}

export async function vote(
  input: VoteInput,
  userId: string,
  organizationId: string,
  apiKeyId?: string,
  agentId?: string
) {
  const services = await getServices();
  return services.vote.vote(input, userId, organizationId, apiKeyId, agentId);
}

export async function suggest(
  input: SuggestInput,
  userId: string,
  organizationId: string,
  apiKeyId?: string,
  agentId?: string
) {
  const services = await getServices();
  return services.suggest.suggest(input, userId, organizationId, apiKeyId, agentId);
}

export async function submit(
  input: SubmitInput,
  userId: string,
  organizationId: string,
  apiKeyId?: string,
  agentId?: string
) {
  const services = await getServices();
  return services.submit.submit(input, userId, organizationId, apiKeyId, agentId);
}

export async function search(input: SearchInput, organizationId: string) {
  const services = await getServices();
  return services.search.search(input, organizationId);
}

export async function getIssueDetail(issueId: string, organizationId: string) {
  const services = await getServices();
  return services.search.getIssueDetail(issueId, organizationId);
}

export async function getFacets(organizationId: string) {
  const services = await getServices();
  return services.search.getFacets(organizationId);
}

export async function createOrganization(input: CreateOrganizationInput, ownerId: string) {
  const services = await getServices();
  return services.organization.createOrganization(input, ownerId);
}

export async function getOrganization(organizationId: string) {
  const services = await getServices();
  return services.organization.getOrganization(organizationId);
}

export async function getPublicOrganization() {
  const services = await getServices();
  return services.organization.getPublicOrganization();
}

export async function ensurePublicOrganization() {
  const services = await getServices();
  return services.organization.ensurePublicOrganization();
}

export async function getUserOrganizations(userId: string) {
  const services = await getServices();
  return services.organization.getUserOrganizations(userId);
}

export async function addMember(organizationId: string, input: AddMemberInput) {
  const services = await getServices();
  return services.organization.addMember(organizationId, input);
}

export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: MembershipRole
) {
  const services = await getServices();
  return services.organization.updateMemberRole(organizationId, userId, role);
}

export async function removeMember(organizationId: string, userId: string) {
  const services = await getServices();
  return services.organization.removeMember(organizationId, userId);
}

export async function getOrganizationMembers(organizationId: string) {
  const services = await getServices();
  return services.organization.getOrganizationMembers(organizationId);
}

export async function createShareRequest(
  input: CreateShareRequestInput,
  requestedById: string,
  organizationId: string,
  membershipRole?: MembershipRole
) {
  const services = await getServices();
  return services.shareRequest.createShareRequest(
    input,
    requestedById,
    organizationId,
    membershipRole
  );
}

export async function getPendingShareRequests(organizationId: string) {
  const services = await getServices();
  return services.shareRequest.getPendingShareRequests(organizationId);
}

export async function getShareRequest(requestId: string) {
  const services = await getServices();
  return services.shareRequest.getShareRequest(requestId);
}

export async function approveShareRequest(
  requestId: string,
  reviewerId: string,
  organizationId: string,
  reason?: string
) {
  const services = await getServices();
  return services.shareRequest.approveShareRequest(requestId, reviewerId, organizationId, reason);
}

export async function rejectShareRequest(
  requestId: string,
  reviewerId: string,
  input: RejectShareRequestInput,
  organizationId: string
) {
  const services = await getServices();
  return services.shareRequest.rejectShareRequest(requestId, reviewerId, input, organizationId);
}

export async function getSharedContentByIssue(issueId: string) {
  const services = await getServices();
  return services.shareRequest.getSharedContentByIssue(issueId);
}

export async function revokeShareRequest(
  requestId: string,
  reviewerId: string,
  organizationId: string,
  reason?: string
) {
  const services = await getServices();
  return services.shareRequest.revokeShareRequest(requestId, reviewerId, organizationId, reason);
}

export async function getApprovedShareRequests(organizationId: string) {
  const services = await getServices();
  return services.shareRequest.getApprovedShareRequests(organizationId);
}

export async function getIssue(issueId: string) {
  const services = await getServices();
  return services.submit.getIssue(issueId);
}

export async function deleteIssue(issueId: string) {
  const services = await getServices();
  return services.submit.deleteIssue(issueId);
}

export async function getSolution(solutionId: string) {
  const services = await getServices();
  return services.submit.getSolution(solutionId);
}

export async function deleteSolution(solutionId: string) {
  const services = await getServices();
  return services.submit.deleteSolution(solutionId);
}

export async function getComment(commentId: string) {
  const services = await getServices();
  return services.comment.getComment(commentId);
}

export async function deleteComment(commentId: string) {
  const services = await getServices();
  return services.comment.deleteComment(commentId);
}

export async function acceptSolution(solutionId: string, userId: string, organizationId: string) {
  const services = await getServices();
  return services.submit.acceptSolution(solutionId, userId, organizationId);
}

export async function getOrgSettings(organizationId: string) {
  const services = await getServices();
  return services.organization.getSettings(organizationId);
}

export async function updateOrgSettings(
  organizationId: string,
  input: import('@agent-in-sync/shared').OrganizationSettings
) {
  const services = await getServices();
  return services.organization.updateSettings(organizationId, input);
}
