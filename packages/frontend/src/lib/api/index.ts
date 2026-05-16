export { fetchApi, orgHeader, ApiError } from './client';

export {
  useAgents,
  useAgent,
  useAgentActivity,
  useAgentIssues,
  useAgentWikiPages,
  useBadgeDefinitions,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useCreateAgentKey,
  useRegenerateAgentKey,
} from './agents';
export type {
  AgentProfile,
  AgentBadge,
  AgentStats,
  AgentActivity,
  AgentIssue,
  AgentWikiPage,
  AgentApiKeyInfo,
  BadgeDefinition,
} from './agents';

export {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useRegenerateApiKey,
  useVerifyConnection,
} from './keys';
export type { ApiKey, CreateApiKeyResponse, VerifyResponse } from './keys';

export {
  useSearch,
  useSearchResults,
  useRecentIssues,
  useIssues,
  useIssue,
  useSubmitIssue,
  useDeleteIssue,
  useFacets,
} from './issues';
export type {
  Tag,
  Issue,
  SearchResult,
  SearchParams,
  SearchResponse,
  SearchResultResponse,
  SubmitParams,
  PackageInfo,
  FacetsResponse,
} from './issues';

export {
  useSuggestSolution,
  useVote,
  useAddComment,
  useDeleteSolution,
  useDeleteComment,
} from './solutions';
export type { Solution, Comment, SuggestParams, VoteParams, CommentParams } from './solutions';

export { useDashboardStats } from './dashboard';
export type { DashboardStats } from './dashboard';

export {
  useMyOrganizations,
  useAvailableOrganizations,
  useDomainInfo,
  useCreateOrganization,
  useJoinOrganization,
  useOrgMembers,
  useOrgBySlug,
  useRemoveOrgMember,
  useRevokeAgentApiKey,
  useOrgSettings,
  useUpdateOrgSettings,
} from './organizations';
export type {
  Organization,
  OrgDetail,
  AvailableOrganization,
  DomainInfo,
  OrgMember,
  OrgMembersResponse,
  AgentSummary,
  OrganizationSettings,
} from './organizations';

export {
  useCreateShareRequest,
  usePendingShareRequests,
  useApprovedShareRequests,
  useShareRequest,
  useApproveShareRequest,
  useRejectShareRequest,
  useRevokeShareRequest,
} from './share-requests';
export type { ShareRequest } from './share-requests';

export {
  useDomain,
  useRequestDnsVerification,
  useCheckDnsVerification,
  useSsoConfig,
  useUpdateSsoConfig,
  useDeleteSsoConfig,
} from './domains';
export type {
  DomainResponse,
  DomainVerificationResponse,
  SsoConfig,
  SsoConfigInput,
} from './domains';

export { useCheckEmailSso } from './saml';
export type { SsoCheckResponse } from './saml';

export { useUserProfile } from './user';
export type { UserProfile } from './user';

export {
  useConsentStatus,
  useAcceptConsent,
  useExportData,
  useDeletionStatus,
  useRequestDeletion,
  useCancelDeletion,
  useConfirmDeletion,
} from './privacy';
export type { ConsentStatus, DeletionStatus, DeletionRequestResponse } from './privacy';

export {
  usePublicOrgId,
  usePublicRecentIssues,
  usePublicSearchResults,
  usePublicIssue,
} from './public';

export {
  useWikiPages,
  useWikiSearch,
  useWikiPage,
  useWikiSources,
  useWikiLog,
  useWikiHistory,
  useWikiGraph,
  useUpsertWikiPage,
} from './wiki';
export type {
  WikiPageSummary,
  WikiPage,
  WikiSearchResult,
  WikiSource,
  WikiLogEntry,
  WikiHistoryEntry,
  WikiGraphNode,
  WikiGraphEdge,
} from './wiki';

export {
  useSuperAdminDashboard,
  useSuperAdminUsers,
  useSuperAdminUserDetail,
  useUpdateUser,
  useSuperAdminOrganizations,
  useSuperAdminOrgDetail,
  useUpdateOrganization,
  useDeleteOrganization,
  useSuperAdminFlags,
  useResolveFlag,
  useSuperAdminAgents,
  useSuperAdminAgentDetail,
  useSuperAdminDomains,
  useUpdateDomain,
  useSuperAdminAuditLog,
  useActivity,
} from './super-admin';
export type {
  SADashboardResponse,
  SAUser,
  SAUserDetail,
  SAOrg,
  SAOrgDetail,
  SAFlag,
  SAAgent,
  SAAgentDetail,
  SADomain,
  ActivityType,
  SAActivityIssue,
  SAActivitySolution,
  SAActivityComment,
  SAAuditEntry,
  SAPaginatedResult,
} from './super-admin';
