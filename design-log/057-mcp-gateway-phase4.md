# Design Log #057: MCP Gateway — Phase 4 (Go Data Plane, gRPC, In-VPC, Shadow AI, On-Prem)

## Background

The three prior phases built a complete, production-grade MCP gateway running as TypeScript services:

- **Phase 1** (Design Log #054): Registry, credentials, TypeScript data plane proxy, Layer 0
  static guard, audit log.
- **Phase 2** (Design Log #055): RBAC/ABAC, parameter policies, PII masking, financial firewall,
  session anomaly detection, review queue, guardrail evaluation.
- **Phase 3** (Design Log #056): LLM semantic guard sidecar, manifest poisoning defense, connector
  SDK + WASM sandbox, 4 verified connectors, SCIM 2.0 user provisioning, KMS envelope encryption,
  tag-based intent discovery.

What remains deferred from prior phases:

- **Go data plane**: The TypeScript proxy satisfies functional correctness. Phase 1 explicitly
  deferred a Go rewrite until traffic patterns were known. With Phase 3 in production, the data
  plane's hot path is well-understood and the bottlenecks are clear.
- **gRPC control-to-data plane**: The current architecture has the data plane making PostgreSQL
  and REST calls directly. For the in-VPC split-plane model, a typed gRPC protocol is required —
  the data plane cannot carry a database connection into the customer's VPC.
- **True in-VPC deployment**: The data plane today runs on the same host as the control plane.
  Enterprise CISOs require that agent traffic and raw credentials never cross into the SaaS
  network. The data plane must run entirely inside the customer's VPC, fetching policy from the
  SaaS control plane but processing requests locally.
- **Shadow AI detection**: IT teams need to know what AI tool usage is happening outside the
  governed gateway — developers running local MCP servers with hardcoded credentials, agents
  calling AI APIs directly. Detection enables migration, not just blocking.
- **On-prem Helm chart**: Enterprises that cannot use SaaS at all (air-gapped environments,
  regulated industries) need a complete self-hosted deployment package.
- **SCIM Groups**: Phase 3 shipped static group-to-role mappings. Dynamic group sync (the IdP
  pushes group membership changes as they happen) requires the full SCIM `/Groups` endpoint.
- **Embedding-based intent discovery**: Phase 3 shipped tag-based tool filtering. As orgs grow
  to hundreds of connectors, tags become imprecise. Vector search over tool descriptions against
  a natural-language agent intent is the right long-term solution.
- **OpenTelemetry + SIEM integration**: The audit log exists but is siloed in the gateway
  database. Enterprise security operations centers need real-time event streaming to their
  existing SIEM (Splunk, Datadog, Elastic). Compliance teams need structured export for SOC 2
  and GDPR audits.

## Problem

1. **Performance ceiling of the TypeScript data plane**: The TypeScript proxy adds 5–20ms per
   request on typical hardware. At high concurrency (1,000+ simultaneous agents), GC pauses and
   the event loop become the bottleneck. The team's blueprint promises <15μs overhead — achievable
   only with a compiled language and no GC on the hot path.

2. **Architectural coupling**: The data plane today holds a PostgreSQL connection, calls Redis
   directly, and makes local HTTP calls to the guard service. This architecture cannot be
   physically separated from the control plane. In-VPC deployment requires the data plane to be
   stateless except for an in-memory policy cache, communicating with the control plane only via
   a defined protocol.

3. **CISO blocker for large enterprises**: "Your proxy touches our credentials" is the top
   enterprise sales objection in Phase 3. With a SaaS-hosted data plane, the raw OAuth token
   passes through the vendor's network, even if encrypted in transit. An in-VPC data plane
   eliminates this objection: credentials are fetched from the customer's own Vault and never
   leave the customer's network.

4. **Shadow AI is invisible today**: Governance without detection has a blind spot. Enterprises
   using the gateway cannot see how much AI tool usage is happening outside it. Without detection,
   there is no business case for full migration, and shadow usage creates ongoing risk even after
   the gateway is deployed.

5. **SCIM group membership lag**: Static group mappings in Phase 3 mean that when an employee
   joins or leaves a group in Okta, their gateway permissions do not update until an admin
   manually edits the mapping. For regulated industries, this lag is a compliance failure.

6. **Tag staleness at scale**: Tag-based discovery breaks down when connectors are numerous or
   when an agent's task is nuanced. "I need to read Jira tickets and correlate them with GitHub
   commits and Slack discussion threads" is not well-served by a union of three tag sets — it
   needs semantic matching against tool descriptions.

7. **Audit data is trapped**: The `mcpAuditLog` table is queryable via the admin UI, but
   security operations centers work in Splunk or Datadog. Exporting audit data is currently a
   manual CSV download. Real-time streaming to SIEM and scheduled compliance exports are
   enterprise table-stakes.

## Questions and Answers

> Q: The TypeScript data plane works. What is the concrete justification for a Go rewrite?

A: Three reasons, in priority order:

1. **In-VPC deployment requires it.** A Go binary with no external DB dependency can be deployed
   as a single container in any VPC. The TypeScript service requires Node.js runtime, npm
   dependencies, and today carries database and Redis connections that cannot move into the
   customer's network without replicating the entire stack.

2. **Latency at scale.** TypeScript with V8 GC adds unpredictable tail latency. At p99, a
   gateway handling 10,000 requests/minute will show GC-induced spikes of 50-200ms. Go's
   goroutine scheduler and low-pause GC eliminate this. The policy cache lookup (the hot path)
   becomes a simple mutex-protected map read: <1μs.

3. **Operational simplicity of a single binary.** A Go binary can be distributed as a Docker
   image with no runtime dependency other than the OS. It starts in <100ms and has a predictable
   memory footprint. This matters for the on-prem Helm chart — customers running it in air-gapped
   environments cannot pull npm dependencies at runtime.

> Q: Does the Go rewrite change any external interface?

A: No. The data plane exposes `POST /gateway/:orgSlug/:serverTypeSlug` over HTTP/HTTPS. Agents
do not change how they call the gateway. The guard service HTTP interface (`POST /scan`) is
unchanged. The connector SDK is unchanged. The only new interface is the gRPC channel between
data plane and control plane, which is internal.

> Q: Why gRPC instead of REST for the control-to-data plane protocol?

A: Three reasons. First, streaming: `WatchPolicies` uses server-streaming RPC so the control
plane can push policy updates to all connected data planes instantly — no polling, no TTL
expiry. Second, typing: Protobuf schemas are the contract; a control plane API change that
breaks the data plane is caught at compile time. Third, performance: binary framing and HTTP/2
multiplexing make the gRPC channel efficient for the high-frequency `PushAuditEvents` stream
without per-request connection overhead.

> Q: For in-VPC mode, does the data plane ever phone home to the SaaS control plane mid-request?

A: For two things only, and both are designed to be non-blocking:

1. **Policy cache miss**: On first request for a new `(orgId, serverTypeSlug)` combination, the
   data plane fetches the policy bundle via gRPC `GetPolicyBundle`. This is the only synchronous
   cross-boundary call and adds ~20-50ms once per pair (subsequent requests use cache).

2. **Audit events**: Pushed asynchronously via the `PushAuditEvents` stream. The data plane
   buffers events in memory and flushes them in batches. If the stream is unavailable, events
   are written to a local write-ahead log (WAL file) and replayed on reconnect.

Credentials are never fetched via the control plane in in-VPC mode. The data plane calls the
customer's local Vault/KMS directly.

> Q: Shadow AI detection — is this a network intrusion detection feature? How does it work
> without being invasive?

A: Shadow AI detection in Phase 4 is **visibility, not blocking**. Two non-invasive approaches,
deployed in combination:

1. **DNS telemetry**: Corporate DNS resolvers log queries to known MCP and AI API domains
   (`api.openai.com`, `api.anthropic.com`, known public MCP server hostnames). The gateway
   aggregates these into a "shadow usage" view — who is querying which AI endpoints and how
   often. No traffic inspection required, no packet capture, no agent on endpoints.

2. **Gateway coverage gap analysis**: The gateway knows which agents are using it. By comparing
   agent API key activity against the DNS telemetry (same IP/subnet, no corresponding gateway
   traffic), it can infer that a machine is using AI tools outside the gateway. This is not a
   security block — it generates a "migration opportunity" prompt in the admin UI.

The Shadow AI dashboard is a conversion tool, not an enforcement tool. Its goal is to show IT
the ROI of full migration and to let employees self-report ("I see you're running local MCP tools
— click here to get the same tools governed and with better capabilities in the gateway").

> Q: How does embedding-based discovery use the existing Weaviate instance?

A: A new Weaviate collection `GatewayTool` is indexed at install time (when a connector is
registered) and refreshed on manifest updates. Each object stores:

```json
{
  "orgId": "uuid",
  "serverTypeId": "uuid",
  "serverTypeSlug": "github",
  "toolName": "create_issue",
  "fullName": "github:create_issue",
  "description": "Creates a new issue in a GitHub repository...",
  "capabilities": ["write"],
  "intentTags": ["code", "github"]
}
```

On a `tools/list` request with an `X-Agent-Intent` header, the gateway does a hybrid search
(vector + keyword) over `GatewayTool` filtered by `orgId`. The top-K results (configurable,
default 20) are returned as the tool manifest. This reuses the same Weaviate client and search
patterns already in `packages/backend/src/services/search.service.ts`.

> Q: On-prem vs SaaS — which components run where?

A: There are three deployment topologies, all supported by the Helm chart:

| Topology                                 | Control Plane   | Data Plane      | Customer Data        |
| ---------------------------------------- | --------------- | --------------- | -------------------- |
| **Full SaaS**                            | agentinsync.com | agentinsync.com | Encrypted in SaaS DB |
| **Split-plane** (recommended enterprise) | agentinsync.com | Customer VPC    | Never leaves VPC     |
| **Full on-prem**                         | Customer DC     | Customer DC     | Customer DC entirely |

The Helm chart targets Split-plane by default (control plane as SaaS, data plane deployed by
customer). Full on-prem deploys all components including the control plane, requiring the
customer to run PostgreSQL, Redis, Weaviate, and the guard service themselves.

## Design

### A. Go Data Plane (`packages/mcp-gateway-go/`)

A new Go module that replaces `packages/mcp-gateway/` on the hot path. The TypeScript gateway
remains running during the transition as a compatibility fallback; traffic is migrated
progressively per org via a control plane feature flag.

#### Project structure

```
packages/mcp-gateway-go/
  cmd/
    gateway/
      main.go               Entry point: parse config, start server
  internal/
    auth/
      apikey.go             Validate ask_ API key via gRPC PolicyBundle cache
    authz/
      rbac.go               RBAC evaluation from cached policy
      abac.go               ABAC attribute resolution + condition check
      param_policy.go       Parameter deny/allow pattern evaluation
    guard/
      layer0.go             Static regex evaluation (compiled at startup)
      layer1.go             Structural limits: size cap, budget check, domain allowlist
      layer2.go             HTTP client to guard service sidecar
      session.go            Redis session anomaly (N-strike, token spike)
    proxy/
      router.go             Main request orchestration (full 16-step flow)
      forwarder.go          Upstream HTTP client with keep-alive pool
      credential.go         Vault/KMS credential fetch + DEK decrypt
    policy/
      cache.go              In-memory PolicyBundle cache (sync.Map + TTL)
      watcher.go            gRPC stream subscription to control plane WatchPolicies
    audit/
      logger.go             gRPC stream push to control plane PushAuditEvents
      wal.go                Local write-ahead log for audit events during disconnection
    discovery/
      tags.go               Tag-based tool manifest filtering (Phase 3 behavior, default)
      embedding.go          Weaviate hybrid search for embedding-based discovery
    config/
      config.go             Config struct loaded from env + YAML file
  Dockerfile
  go.mod
```

#### Hot path — policy cache lookup

The most performance-sensitive operation is policy evaluation. It must not touch the network on
the common case (cache hit):

```go
// internal/policy/cache.go

type PolicyBundle struct {
    ServerType      ServerTypeConfig
    ToolPermissions []ToolPermission
    GuardProfile    GuardProfile
    FetchedAt       time.Time
}

type PolicyCache struct {
    mu    sync.RWMutex
    store map[string]*PolicyBundle   // key: "orgId:serverTypeSlug"
    ttl   time.Duration              // default 60s
}

func (c *PolicyCache) Get(orgID, slug string) (*PolicyBundle, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    b, ok := c.store[orgID+":"+slug]
    if !ok || time.Since(b.FetchedAt) > c.ttl {
        return nil, false
    }
    return b, true
}

func (c *PolicyCache) Set(orgID, slug string, bundle *PolicyBundle) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.store[orgID+":"+slug] = bundle
}
```

Cache hit path: RLock → map lookup → RUnlock → proceed. No allocations. Measured at <1μs on
modern hardware. Cache miss: gRPC call to control plane `GetPolicyBundle`, adds ~20-50ms once
per (org, serverType) pair per TTL window.

#### Credential fetch — in-VPC mode

In split-plane mode, the data plane fetches credentials directly from the customer's Vault:

```go
// internal/proxy/credential.go

type CredentialFetcher interface {
    Fetch(ctx context.Context, connectionID string) ([]byte, error)
}

// VaultFetcher: calls HashiCorp Vault Transit unseal + KV read
type VaultFetcher struct { client *vault.Client }

// ControlPlaneFetcher: calls gRPC FetchCredential (SaaS mode only)
type ControlPlaneFetcher struct { client pb.GatewayControlClient }

// LocalFetcher: reads from env/file (development/testing only)
type LocalFetcher struct { secrets map[string]string }
```

The `CredentialFetcher` is injected at startup based on deployment mode. No credential is ever
written to disk or retained in memory beyond the request scope. Go's garbage collector reclaims
the byte slice immediately after the upstream request completes.

#### Connection pooling to upstream MCP servers

The TypeScript forwarder created a new HTTP connection per request. The Go forwarder maintains
a persistent connection pool per upstream URL:

```go
// internal/proxy/forwarder.go

var upstreamTransport = &http.Transport{
    MaxIdleConns:        200,
    MaxIdleConnsPerHost: 20,
    IdleConnTimeout:     90 * time.Second,
    TLSHandshakeTimeout: 5 * time.Second,
    DisableCompression:  false,
}

var upstreamClient = &http.Client{
    Transport: upstreamTransport,
    Timeout:   30 * time.Second,
}
```

This eliminates TCP + TLS handshake overhead on repeat calls to the same upstream. For an org
with a heavily-used GitHub connector, the connection pool means the first call establishes the
connection; subsequent calls reuse it.

### B. gRPC Control-to-Data Plane Protocol

The control plane (TypeScript Express backend) gains a gRPC server. The Go data plane is the
only gRPC client today, but the protocol is designed to support future non-Go data plane
implementations.

#### Protobuf definitions

```protobuf
// packages/shared-proto/gateway.proto
syntax = "proto3";
package agentinsync.gateway.v1;

service GatewayControl {
  // Data plane calls at startup and on cache miss
  rpc GetPolicyBundle(GetPolicyBundleRequest) returns (PolicyBundle);

  // Control plane streams policy updates to all connected data planes
  rpc WatchPolicies(WatchPoliciesRequest) returns (stream PolicyUpdate);

  // Data plane streams audit events to control plane (batched)
  rpc PushAuditEvents(stream AuditEventBatch) returns (PushAuditEventsResponse);

  // SaaS mode only: data plane fetches decrypted credential
  rpc FetchCredential(FetchCredentialRequest) returns (FetchCredentialResponse);

  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message PolicyBundle {
  ServerTypeConfig server_type         = 1;
  repeated ToolPermission permissions  = 2;
  GuardProfile guard_profile           = 3;
  int64 version                        = 4; // monotonically increasing
}

message PolicyUpdate {
  string org_id           = 1;
  string server_type_slug = 2;
  PolicyBundle bundle     = 3; // null = server type removed/suspended
  int64 version           = 4;
}

message AuditEventBatch {
  repeated AuditEvent events = 1;
}

message FetchCredentialRequest {
  string connection_id = 1;
  string org_id        = 2;
}

message FetchCredentialResponse {
  bytes  plaintext_credential = 1; // decrypted, in-memory only
  string credential_type      = 2; // "api_key" | "oauth_token"
}
```

#### mTLS between planes

The gRPC channel uses mutual TLS:

- Control plane presents a server certificate (from Let's Encrypt or a managed CA).
- Data plane presents a client certificate issued per deployment instance.
- Client certificate is provisioned at data plane startup via a certificate issuance flow
  (either ACME + a private CA, or a short-lived cert fetched from the control plane's `/data-plane/register` REST endpoint at first boot).
- Certificate rotation: data plane refreshes its client cert 24 hours before expiry without
  downtime (rotate-then-reconnect).

#### TypeScript gRPC server (control plane addition)

```typescript
// packages/backend/src/grpc/gatewayControl.ts
import { Server, ServerCredentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

const packageDef = loadSync('gateway.proto', { keepCase: true, longs: String });
const proto      = loadPackageDefinition(packageDef).agentinsync.gateway.v1 as GatewayProto;

export function startGrpcServer(port: number) {
  const server = new Server();
  server.addService(proto.GatewayControl.service, {
    getPolicyBundle:   handleGetPolicyBundle,
    watchPolicies:     handleWatchPolicies,   // uses server-streaming
    pushAuditEvents:   handlePushAuditEvents, // uses client-streaming
    fetchCredential:   handleFetchCredential,
    healthCheck:       handleHealthCheck,
  });
  server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createSsl(...), () => {
    server.start();
  });
}
```

`handleWatchPolicies` maintains a registry of open streams. When an admin updates a policy in
the control plane UI, the relevant streams are immediately written to — all data planes receive
the update within milliseconds without polling.

### C. In-VPC Deployment Mode

A Go data plane container is the only component the customer deploys in their VPC. Everything
else runs in the AgentInSync SaaS environment (Split-plane topology) or in the customer's DC
(Full on-prem topology).

#### Data flow in Split-plane mode

```
Agent (inside customer VPC)
    │
    │ HTTPS POST /gateway/:org/:serverType
    ▼
Go Data Plane (customer VPC, port 443)
    │
    ├──── Policy cache hit: proceed without network call (~1μs)
    ├──── Policy cache miss: gRPC GetPolicyBundle → AgentInSync SaaS (~30ms, once per 60s per type)
    │
    ├──── Credential fetch: call customer's HashiCorp Vault (~5ms)
    │      (raw credential never leaves customer VPC)
    │
    ├──── Forward to upstream MCP server (customer VPC or internet, depending on server type)
    │
    ├──── Audit events: gRPC PushAuditEvents stream → AgentInSync SaaS (async, batched)
    │      (only metadata flows to SaaS: tool name, duration, guard result, token count)
    │      (request params are PII-masked before leaving VPC)
    │
    └──── Return response to agent
```

**What crosses the VPC boundary:**

- Outbound: PII-masked audit metadata, policy fetch requests, health heartbeats.
- Inbound: Policy bundles (permissions, guard rules), policy update pushes.

**What never leaves the VPC:**

- Raw OAuth tokens and API keys.
- Unmasked request parameters.
- Tool response content.

#### Data plane configuration

The Go data plane reads a YAML config file mounted via Kubernetes Secret or Docker volume:

```yaml
# gateway-config.yaml
mode: split_plane # "split_plane" | "full_saas" | "full_on_prem"

control_plane:
  grpc_endpoint: 'gateway.agentinsync.com:443'
  client_cert_path: '/etc/certs/data-plane.crt'
  client_key_path: '/etc/certs/data-plane.key'
  ca_cert_path: '/etc/certs/ca.crt'

credential_backend:
  type: vault # "vault" | "aws_kms" | "azure_key_vault" | "control_plane"
  vault_addr: 'https://vault.company.internal:8200'
  vault_auth_method: kubernetes # uses pod service account token

guard_service:
  url: 'http://guard-service:3003' # sidecar in same pod or adjacent pod
  fail_policy: fail_open

policy_cache:
  ttl_seconds: 60

audit:
  batch_size: 100
  flush_interval_seconds: 5
  wal_path: '/var/lib/gateway/audit.wal' # local WAL for disconnection tolerance
```

### D. Shadow AI Detection

#### DNS telemetry integration

Corporate DNS resolvers (Infoblox, Cisco Umbrella, Pi-hole, or any resolver supporting DNS
query logging) are configured to forward query logs to the gateway's telemetry endpoint:

```
POST /api/orgs/:id/telemetry/dns
Content-Type: application/json
X-Telemetry-Token: <org telemetry token>

{
  "queries": [
    { "client_ip": "10.1.2.100", "domain": "api.anthropic.com", "timestamp": "..." },
    { "client_ip": "10.1.2.101", "domain": "localhost:3001",     "timestamp": "..." }
  ]
}
```

The gateway matches inbound DNS queries against a catalog of known AI endpoints:

```typescript
// packages/backend/src/services/shadowAi.service.ts

const KNOWN_AI_DOMAINS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  // ... and known public MCP server hostnames
];

const SUSPICIOUS_LOCAL_PATTERNS = [/^localhost:\d+$/, /^127\.0\.0\.\d+:\d+$/, /^0\.0\.0\.0:\d+$/];
```

#### Shadow AI table

```typescript
export const shadowAiEvents = pgTable('shadow_ai_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientIp: text('client_ip').notNull(),
  resolvedUserId: uuid('resolved_user_id').references(() => users.id), // if IP→user mapped
  domain: text('domain').notNull(),
  queryCount: integer('query_count').notNull().default(1),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  isGatewayed: boolean('is_gatewayed').notNull().default(false), // already using gateway?
});
```

#### IP → User mapping

Corporate DHCP logs or Active Directory/LDAP can be imported to map IP addresses to user
identities. The gateway accepts a daily import:

```
POST /api/orgs/:id/telemetry/ip-user-map
[{ "ip": "10.1.2.100", "userId": "uuid", "validFrom": "...", "validUntil": "..." }]
```

#### Shadow AI dashboard

Admin view showing:

- **AI usage outside gateway**: unique IPs/users querying known AI endpoints, ranked by volume.
- **Local MCP server usage**: IPs making requests to `localhost:*` patterns matching MCP JSON-RPC.
- **Migration opportunity score**: users with high shadow AI volume but no gateway API key — these
  are the highest-priority users to migrate.
- **One-click outreach**: admin can trigger a "Move to the governed gateway" email to shadow users,
  linking to the Connector Marketplace and a guide to getting an API key.

#### Coverage gap analysis (no DNS required)

Even without DNS telemetry, the gateway can surface gaps: if an org has 50 registered developers
but only 20 active gateway API keys in the last 30 days, the "Shadow AI Likelihood" score for
the 30 inactive developers is high. This metric requires no additional infrastructure.

### E. On-Prem Helm Chart

Supports Split-plane (data plane only) and Full on-prem (all components) via a single chart with
topology-controlled value overrides.

#### Chart structure

```
helm/
  agentinsync-gateway/
    Chart.yaml
    values.yaml              # defaults: split_plane mode, external control plane
    values-full-onprem.yaml  # override for full on-prem deployment
    templates/
      # Data plane (always deployed)
      data-plane-deployment.yaml
      data-plane-service.yaml
      data-plane-hpa.yaml          # HorizontalPodAutoscaler: scale on CPU + request latency
      data-plane-pdb.yaml          # PodDisruptionBudget: min 1 available during upgrades
      data-plane-configmap.yaml
      data-plane-secret.yaml       # client cert + key

      # Guard service (always deployed, sidecar pattern optional)
      guard-service-deployment.yaml
      guard-service-service.yaml

      # Control plane (full on-prem only)
      control-plane-deployment.yaml
      control-plane-service.yaml
      control-plane-ingress.yaml

      # Infrastructure (full on-prem only, or use existingXxx values)
      postgres-statefulset.yaml
      redis-statefulset.yaml
      weaviate-statefulset.yaml

      # Shared
      namespace.yaml
      serviceaccount.yaml
      rbac.yaml
      networkpolicy.yaml           # restricts data plane egress to control plane + upstreams only
```

#### Key `values.yaml` knobs

```yaml
topology: split_plane # "split_plane" | "full_on_prem"

dataPlane:
  image:
    repository: ghcr.io/agentinsync/mcp-gateway-go
    tag: '4.0.0'
  replicas: 3
  resources:
    requests: { cpu: '250m', memory: '128Mi' }
    limits: { cpu: '1', memory: '512Mi' }
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70

controlPlane:
  externalEndpoint: 'gateway.agentinsync.com:443' # SaaS endpoint (split_plane)
  # OR:
  # internalEndpoint: "control-plane:50051"         # (full_on_prem)

credentialBackend:
  type: vault
  vaultAddr: 'https://vault.company.internal:8200'
  vaultAuthMethod: kubernetes

guardService:
  model: prompt_guard_2
  ollamaUrl: 'http://ollama:11434'
  # OR:
  # provider: azure_cs
  # azureEndpoint: "https://..."

postgres:
  external: true
  url: 'postgresql://user:pass@rds.company.internal:5432/agentinsync'

redis:
  external: true
  url: 'redis://elasticache.company.internal:6379'
```

#### Zero-downtime upgrades

The data plane Deployment uses `RollingUpdate` with `maxUnavailable: 0`. During an upgrade:

1. New pods start and connect to the control plane gRPC stream.
2. Old pods finish in-flight requests (graceful shutdown with 30s drain).
3. Traffic shifts to new pods as they pass readiness checks.

Policy cache warm-up: new pods pre-fetch all policy bundles for their org on startup (a single
gRPC call per active org) so the first request is never a cache miss.

### F. SCIM 2.0 Groups (Complete Dynamic Sync)

Phase 3 shipped `/Users` endpoints and static group-to-role mappings. Phase 4 adds `/Groups`
endpoints and bidirectional sync.

#### New SCIM Group endpoints

```
GET    /scim/v2/Groups                  List groups
POST   /scim/v2/Groups                  Create group (IdP-initiated)
GET    /scim/v2/Groups/:id              Get group
PUT    /scim/v2/Groups/:id              Replace group (full member list)
PATCH  /scim/v2/Groups/:id             Update group (add/remove members)
DELETE /scim/v2/Groups/:id             Delete group
```

#### New table: `scimGroups`

```typescript
export const scimGroups = pgTable('scim_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  scimGroupId: text('scim_group_id').notNull(), // IdP-assigned external ID
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scimGroupMembers = pgTable('scim_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => scimGroups.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});
```

#### Dynamic role re-evaluation

When a `PATCH /scim/v2/Groups/:id` changes membership:

1. For each added member: re-evaluate their org role against `scimGroupMappings`. If a mapping
   matches, update `organizationMembers.role`. If multiple mappings match, take the highest role.
2. For each removed member: re-evaluate without that group. If their role should change, update.
3. If role changes: push a `PolicyUpdate` via gRPC to all connected data planes — permissions
   take effect within milliseconds, not on the next cache TTL.

The gRPC `WatchPolicies` stream already handles this: the control plane emits a `PolicyUpdate`
with the user-scoped permission bundle whenever any permission determinant changes.

### G. Embedding-Based Tool Discovery

Replaces (or augments) tag-based discovery for orgs that opt in.

#### Weaviate collection: `GatewayTool`

```typescript
// packages/backend/src/services/gatewayToolIndex.service.ts

const GATEWAY_TOOL_CLASS = {
  class: 'GatewayTool',
  vectorizer: 'text2vec-transformers',
  properties: [
    { name: 'orgId', dataType: ['text'], tokenization: 'field' },
    { name: 'serverTypeId', dataType: ['text'], tokenization: 'field' },
    { name: 'serverTypeSlug', dataType: ['text'], tokenization: 'word' },
    { name: 'toolName', dataType: ['text'], tokenization: 'word' },
    { name: 'fullName', dataType: ['text'], tokenization: 'field' }, // "github:create_issue"
    { name: 'description', dataType: ['text'], tokenization: 'word' },
    { name: 'capabilities', dataType: ['text[]'], tokenization: 'field' },
    { name: 'intentTags', dataType: ['text[]'], tokenization: 'field' },
  ],
};
```

The `description` field is the primary vector source. The `t2v-transformers` model already
running in the stack handles embedding generation — no new ML infrastructure required.

#### Indexing triggers

Tool manifests are indexed (or re-indexed) in three situations:

1. A connector is installed or its manifest is refreshed.
2. A server type's `intentTags` are updated by an admin.
3. A server type is suspended: its tools are removed from the index.

#### Discovery query

```typescript
// packages/mcp-gateway-go/internal/discovery/embedding.go (Go client)
// Uses the same Weaviate GraphQL API as the existing search service

async function discoverToolsByIntent(
  orgId: string,
  agentIntent: string, // natural language: "create GitHub issues and check CI status"
  topK: number = 20
): Promise<ToolDefinition[]> {
  const result = await weaviateClient.graphql
    .get()
    .withClassName('GatewayTool')
    .withHybrid({ query: agentIntent, alpha: 0.75 }) // 75% vector, 25% keyword
    .withWhere({
      operator: 'Equal',
      path: ['orgId'],
      valueText: orgId,
    })
    .withLimit(topK)
    .withFields('fullName description serverTypeSlug toolName capabilities')
    .do();

  return result.data.Get.GatewayTool.map(buildToolDefinition);
}
```

The `alpha: 0.75` hybrid weighting (75% semantic, 25% keyword) is the same setting used by the
existing search service (Design Log #034, #046), reusing validated tuning.

#### Activation

Embedding-based discovery is activated per org via a guard profile setting:

```typescript
// New column on mcpGuardProfiles
discoveryMode: discoveryModeEnum('discovery_mode').notNull().default('tag_based'),
discoveryTopK: integer('discovery_top_k').default(20),
```

```typescript
export const discoveryModeEnum = pgEnum('discovery_mode', [
  'all', // return all approved tools (Phase 1/2 behavior)
  'tag_based', // Phase 3: filter by X-Agent-Intent-Tags header
  'embedding', // Phase 4: vector search on X-Agent-Intent header
  'hybrid', // Phase 4: tag filter first, then embedding rerank within filtered set
]);
```

### H. OpenTelemetry + SIEM Integration

#### OpenTelemetry instrumentation (Go data plane)

```go
// internal/telemetry/otel.go

import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
)

func InitTracer(endpoint string) func() {
    exporter, _ := otlptracehttp.New(context.Background(),
        otlptracehttp.WithEndpoint(endpoint))
    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithSampler(trace.TraceIDRatioBased(0.1)), // 10% sampling default
    )
    otel.SetTracerProvider(tp)
    return func() { tp.Shutdown(context.Background()) }
}
```

Each request produces a trace with spans for: auth, policy fetch (or cache hit), RBAC, ABAC,
parameter policy, Layer 0 guard, Layer 2 guard (if sync), credential fetch, upstream forward,
output cap, PII masking, audit write. Span attributes include: `orgId`, `serverTypeSlug`,
`toolName`, `guardAction`, `durationMs`.

Exporters: Jaeger (self-hosted), Grafana Tempo, Datadog APM, Honeycomb — any
OpenTelemetry-compatible backend via OTLP endpoint.

#### SIEM webhook integration

```typescript
// packages/backend/src/services/siemSink.service.ts

export interface SiemSink {
  id: string;
  name: 'splunk_hec' | 'datadog_logs' | 'elastic' | 'generic_webhook';
  url: string;
  headers: Record<string, string>; // auth headers, stored encrypted
  filter: SiemFilter; // { minSeverity, serverTypeIds, guardActionsOnly }
}

// Real-time: audit events are pushed to all configured sinks within 5 seconds of occurrence
// Batch: hourly JSONL export to S3/GCS/Azure Blob for cold storage
```

#### New table: `siemSinks`

```typescript
export const siemSinks = pgTable('siem_sinks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: siemSinkTypeEnum('name').notNull(),
  url: text('url').notNull(),
  encryptedHeaders: text('encrypted_headers').notNull(), // AES-256-GCM, same as credentials
  filter: jsonb('filter'),
  isActive: boolean('is_active').notNull().default(true),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  failureCount: integer('failure_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siemSinkTypeEnum = pgEnum('siem_sink_type', [
  'splunk_hec',
  'datadog_logs',
  'elastic',
  'generic_webhook',
]);
```

#### Compliance export

Pre-built report templates for common frameworks:

```
POST /api/orgs/:id/mcp/compliance/export
Body: {
  framework: "soc2" | "gdpr" | "iso27001" | "hipaa",
  dateFrom: "2026-01-01",
  dateTo:   "2026-03-31",
  format:   "jsonl" | "csv" | "pdf"
}
```

Report content per framework:

- **SOC 2 CC6.1**: all authentication events, API key lifecycle, session events.
- **GDPR Article 30**: all data processing activities with PII classification, data categories, purposes.
- **ISO 27001 A.12.4**: audit log completeness, log integrity hash, retention periods.
- **HIPAA §164.312(b)**: PHI access events, user identification, access timestamps.

Audit log rows carry a SHA-256 chain hash (each row hashes its content + the previous row's
hash) to provide tamper evidence for compliance reports.

#### New columns on `mcpAuditLog`

```typescript
// Tamper-evident chain
rowHash:      text('row_hash'),      // SHA-256(content fields + previousHash)
previousHash: text('previous_hash'), // hash of the preceding row (null for first row)
```

The chain is computed at insert time in the audit logger. A compliance report can verify
integrity by re-hashing each row and checking the chain.

### I. Updated Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  AgentInSync SaaS (Control Plane)                       │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  REST API   │  │  gRPC Server │  │  Admin Portal │  │
│  │  (Express)  │  │  (TypeScript)│  │  (React)      │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                              │
│  ┌──────▼──────────────────────────────────────────┐    │
│  │  PostgreSQL  │  Redis  │  Weaviate               │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────┘
                             │ gRPC / mTLS
                             │ (policy bundles, audit events)
┌────────────────────────────▼────────────────────────────┐
│  Customer VPC (Data Plane)                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Go Data Plane  (Kubernetes Deployment)         │    │
│  │  - Policy cache (sync.Map, 60s TTL)             │    │
│  │  - Guard L0 + L1 (in-process)                  │    │
│  │  - Guard L2 (HTTP → guard-service pod)          │    │
│  │  - Audit WAL (local file, async push)           │    │
│  └────────────────┬────────────────────────────────┘    │
│                   │ fetch credential                     │
│  ┌────────────────▼────────────────────────────────┐    │
│  │  Customer Vault / KMS                           │    │
│  │  (raw credential never leaves VPC)              │    │
│  └─────────────────────────────────────────────────┘    │
│                   │ forward tool call                    │
│  ┌────────────────▼────────────────────────────────┐    │
│  │  Upstream MCP Servers                           │    │
│  │  (GitHub, Jira, Slack, internal DBs, ...)       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### J. Migration from TypeScript to Go Data Plane

Traffic is shifted progressively using a control plane feature flag per org:

```
Phase 1 of migration: 0% of orgs on Go data plane (TypeScript default)
Phase 2: internal AgentInSync orgs on Go data plane (dogfood)
Phase 3: 10% of orgs (canary)
Phase 4: 50% (gradual rollout)
Phase 5: 100% (TypeScript data plane deprecated and removed)
```

The feature flag is stored in `organizations.dataPlaneVersion: "typescript" | "go"`. The load
balancer reads this flag and routes accordingly. Both planes are running simultaneously during
the transition. The TypeScript plane is removed in a follow-up cleanup.

## Implementation Plan

### Step 1: Protobuf definitions + TypeScript gRPC server

- Create `packages/shared-proto/gateway.proto`
- Add `@grpc/grpc-js` + `@grpc/proto-loader` to backend
- Implement gRPC server in `packages/backend/src/grpc/gatewayControl.ts`
- Implement `WatchPolicies` stream with in-memory subscriber registry
- Implement `PushAuditEvents` receiver (writes to `mcpAuditLog`)
- Unit tests: stream push on policy change, audit batch write

### Step 2: Go data plane core

- `packages/mcp-gateway-go/` — Go module, full project structure
- `cmd/gateway/main.go` — config load, server start, graceful shutdown
- `internal/policy/` — cache + gRPC watcher
- `internal/auth/` — API key validation via cached policy bundle
- `internal/authz/` — RBAC + ABAC + parameter policy (port from TypeScript)
- `internal/guard/` — Layer 0 compiled regexes + Layer 1 limits + Layer 2 HTTP client
- `internal/proxy/` — router, forwarder (connection pool), credential fetcher
- `internal/audit/` — gRPC stream push + WAL fallback
- Integration tests: full request flow end-to-end against TypeScript control plane

### Step 3: mTLS certificate provisioning

- Control plane REST endpoint: `POST /api/data-planes/register` — issues short-lived client cert
- Data plane: fetch cert at startup, schedule renewal 24h before expiry
- Local CA for development (using `mkcert` or `certutil`)

### Step 4: Shadow AI detection

- Schema: `shadowAiEvents`, telemetry token auth
- Backend: `POST /api/orgs/:id/telemetry/dns` + `POST /api/orgs/:id/telemetry/ip-user-map`
- `shadowAi.service.ts` — domain matching + gap analysis
- Frontend: Shadow AI dashboard + migration outreach flow

### Step 5: SCIM Groups

- Schema: `scimGroups`, `scimGroupMembers`
- Backend: 6 `/scim/v2/Groups` endpoints
- Dynamic role re-evaluation on group membership change
- gRPC policy push on role change (uses WatchPolicies stream from Step 1)

### Step 6: Embedding-based discovery

- Weaviate: create `GatewayTool` collection schema
- `gatewayToolIndex.service.ts` — index on install, re-index on refresh, remove on suspend
- Schema: `discoveryMode` + `discoveryTopK` on `mcpGuardProfiles`
- Go data plane: `internal/discovery/embedding.go` — GraphQL hybrid search client
- Integration test: install GitHub connector → tools indexed → intent query returns them

### Step 7: Helm chart

- `helm/agentinsync-gateway/` — full chart
- `values.yaml` (split-plane defaults), `values-full-onprem.yaml`
- NetworkPolicy restricting data plane egress
- HPA + PDB for data plane
- README with install instructions for split-plane and full on-prem

### Step 8: OpenTelemetry + SIEM

- Go data plane: `internal/telemetry/otel.go` + spans on all request phases
- Schema: `siemSinks`; backend: SIEM sink CRUD + delivery service
- Schema: `rowHash` + `previousHash` on `mcpAuditLog`; audit logger: chain hash at insert
- Compliance export endpoint + SOC 2 / GDPR report templates

### Step 9: Migration rollout + TypeScript data plane deprecation

- Control plane: `dataPlaneVersion` feature flag per org
- Load balancer routing based on flag
- Canary (10%) → gradual (50%) → full (100%) over 4-week window
- TypeScript `packages/mcp-gateway/` marked deprecated, removed in Phase 5 cleanup

### Step 10: Tests

- Go data plane: full integration test suite (mirrors TypeScript test suite from Phase 1)
- gRPC: policy push received within 200ms of control plane change
- mTLS: expired client cert rejected, valid cert accepted
- Shadow AI: DNS telemetry ingestion, gap analysis, dashboard
- SCIM Groups: add/remove member, role re-evaluated, policy pushed
- Embedding discovery: indexed tool appears in intent-based query
- Helm: deploy chart in kind cluster, run smoke tests
- SIEM: audit event delivered to mock Splunk HEC endpoint
- Compliance export: SOC 2 report contains all expected event types
- Audit chain: tamper a row hash, report flags it

## Examples

### Policy push on permission change

```
Admin changes "database:query" tool permission from minRole=admin to minRole=member.
Control plane: UPDATE mcpToolPermissions → trigger PolicyUpdate.
gRPC WatchPolicies stream: push PolicyUpdate to all 3 connected data planes.
All data plane policy caches updated within 150ms.
Next request: member-role agent can now call database:query.
```

### In-VPC credential fetch

```
Agent calls POST /gateway/acme-corp/github
Go data plane resolves serverType, passes auth + authz.
Calls HashiCorp Vault:
  GET /v1/secret/data/agentinsync/connections/{connectionId}
  → { "data": { "token": "ghp_abc123..." } }
Decrypts credential (DEK fetched from Vault Transit).
Injects "Authorization: Bearer ghp_abc123" into upstream request.
Raw token never sent to AgentInSync SaaS.
Audit event pushed to control plane: { toolName, durationMs, outputBytes } — no raw params.
```

### Shadow AI detection

```
DNS log: user alice@company.com (IP 10.1.2.55) queried api.anthropic.com 847 times today.
Alice has no gateway API key.
shadowAiEvents: { clientIp: "10.1.2.55", resolvedUserId: alice, domain: "api.anthropic.com",
                  queryCount: 847, isGatewayed: false }

Shadow AI dashboard: Alice ranks #1 in "Migration Opportunities".
Admin sends outreach email: "We noticed you're using Claude directly. Here's how to get
more tools with less credential management through our governed gateway..."
```

### Embedding-based discovery

```
Agent sends:
  GET /gateway/acme-corp/tools/list
  X-Agent-Intent: "I want to create GitHub issues, check CI build status, and notify Slack"

discoverToolsByIntent(orgId, agentIntent="create GitHub issues check CI build notify Slack", topK=20)
Weaviate hybrid search returns:
  github:create_issue (score 0.94)
  github:get_workflow_run (score 0.87)
  slack:post_message (score 0.85)
  github:list_issues (score 0.79)
  ... (16 more)

Agent receives 20 tool definitions.
Without discovery: 340 tool definitions (all connectors for this org).
Token savings: ~8,800 tokens per tools/list call.
```

## Trade-offs

| Pro                                                                                    | Con                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Go data plane achieves <1ms policy evaluation (cache hit), <5ms total overhead         | Rewriting in Go duplicates the request flow logic — requires full re-test of all Phase 1-3 behaviors        |
| gRPC policy push: permissions apply within milliseconds of admin change                | gRPC adds operational complexity: protobuf compilation, certificate management, stream reconnection logic   |
| In-VPC mode: raw credentials never cross SaaS boundary — eliminates top CISO objection | Split-plane introduces a new operational dependency: customer must run and monitor the data plane container |
| Audit WAL: gateway survives control plane disconnection without data loss              | WAL requires local disk (persistent volume in Kubernetes) — adds to pod spec complexity                     |
| Shadow AI detection surfaces migration opportunities without blocking                  | DNS telemetry requires customer DNS infrastructure changes — not all customers can do this                  |
| Helm chart enables fully self-hosted deployment                                        | Full on-prem customers run all infrastructure themselves — increases their ops burden                       |
| SCIM Groups enables real-time role sync — no provisioning lag                          | PATCH operations array in SCIM spec is complex to implement correctly across all IdP vendors                |
| Embedding discovery improves tool relevance at scale                                   | Weaviate indexing adds 50-200ms latency on connector install/refresh (async, does not block the install)    |
| OpenTelemetry traces give full per-request visibility                                  | 10% sampling (default) means 90% of requests have no trace — increase sampling for debugging, at cost       |
| Audit chain hashes enable tamper detection                                             | Hash chain is append-only — retroactive log deletion is detectable but not preventable at DB level          |

## Implementation Notes

New packages:

- `packages/mcp-gateway-go/` — Go data plane (replaces `packages/mcp-gateway/` on hot path)
- `packages/shared-proto/` — Protobuf definitions shared between TypeScript + Go
- `helm/agentinsync-gateway/` — Helm chart (not a pnpm workspace package)

New services/tables:

- `packages/backend/src/grpc/gatewayControl.ts` — gRPC server
- `packages/backend/src/services/shadowAi.service.ts` — shadow AI telemetry
- `packages/backend/src/services/gatewayToolIndex.service.ts` — Weaviate tool indexing
- `packages/backend/src/services/siemSink.service.ts` — SIEM delivery
- Schema: `shadowAiEvents`, `scimGroups`, `scimGroupMembers`, `siemSinks`
- Schema additions: `mcpAuditLog.rowHash`, `mcpAuditLog.previousHash`,
  `mcpGuardProfiles.discoveryMode`, `mcpGuardProfiles.discoveryTopK`,
  `organizations.dataPlaneVersion`

New environment variables (data plane only, set in `values.yaml`):

| Variable                      | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `GATEWAY_MODE`                | `split_plane` \| `full_saas` \| `full_on_prem`      |
| `CONTROL_PLANE_GRPC_ENDPOINT` | gRPC server address (`gateway.agentinsync.com:443`) |
| `DATA_PLANE_CLIENT_CERT_PATH` | mTLS client certificate                             |
| `DATA_PLANE_CLIENT_KEY_PATH`  | mTLS client key                                     |
| `AUDIT_WAL_PATH`              | Local WAL file path (`/var/lib/gateway/audit.wal`)  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint                    |
| `OTEL_TRACES_SAMPLER_ARG`     | Sampling ratio (default `0.1`)                      |
| `DATA_PLANE_VERSION_FLAG`     | Override for migration rollout testing              |

---

_Created: 2026-05-12_
_Status: Draft_
