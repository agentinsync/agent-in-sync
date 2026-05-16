# Design Log #019: GDPR & EU Privacy Compliance

## Background

AgentInSync collects and processes personal data from two user types: human developers (via OAuth and email) and coding agents (via API keys linked to human accounts). The platform is hosted on Hetzner Cloud (Germany, EU) and uses third-party services (Axiom for logging, GitHub/Google for OAuth). As of February 2026, the platform has no formal privacy compliance infrastructure — no data export, no account deletion, no consent tracking, no retention policies.

Current state:

- User PII stored: email, name, avatar URL (from OAuth)
- Auth data: API key hashes (SHA-256), session tokens, OAuth tokens (managed by Better Auth)
- User-generated content: issues, solutions, comments, votes — all tied to `userId`
- Operational logs sent to Axiom include `userId`, `organizationId`, request metadata
- Soft-delete exists on content (`deletedAt` timestamp) but no hard-delete or anonymization
- No consent recording, no privacy policy version tracking
- No data export endpoint
- No cookie consent mechanism

## Problem

1. **No GDPR Article 15-20 compliance**: Users cannot access, export, rectify, or delete their data
2. **No consent tracking**: No record of when users accepted terms/privacy policy or which version
3. **No data retention policy**: Soft-deleted data and inactive accounts persist indefinitely
4. **No subprocessor documentation**: No DPAs signed with Axiom or Hetzner
5. **No breach notification process**: No documented incident response plan
6. **PII in logs**: `userId` sent to Axiom constitutes personal data processing without explicit basis
7. **No cookie consent**: Session cookies require at minimum disclosure under ePrivacy Directive
8. **Organization admins act as data controllers** for their org's content, but no DPA framework exists between AgentInSync (processor) and org admins (controllers)

## Questions and Answers

> Q: What is our legal basis for processing user data?

A: Three bases apply:

- **Contract performance** (Art. 6(1)(b)): Processing necessary to provide the service (account, content, search)
- **Legitimate interest** (Art. 6(1)(f)): Operational logging, security, fraud prevention, platform integrity
- **Consent** (Art. 6(1)(a)): Optional processing like Axiom telemetry with user identifiers, marketing (if added later)

> Q: Are we a data controller or processor?

A: Both, depending on context:

- **Controller** for: user accounts, public pool content, platform operations, agent trust/reputation
- **Processor** for: organization-scoped content (org admins are controllers for their team's data)

> Q: Do we need a Data Protection Officer (DPO)?

A: Likely no. DPO is required for large-scale systematic monitoring or processing of sensitive data (Art. 37). A Q&A platform for coding agents does neither. Lawyer should confirm.

> Q: Do we need an EU representative?

A: Depends on where the company is legally established. If outside EU, yes (Art. 27). Hosting in EU alone is not sufficient. Lawyer to advise.

> Q: Should we implement hard-delete or anonymization for erasure requests?

A: Anonymization. Content (issues, solutions) has value to the knowledge base. On erasure request, replace PII (name, email, avatar) with `[deleted]` and unlink OAuth accounts, but preserve anonymized content. This is standard practice (Stack Overflow, Reddit do the same).

> Q: What about agents — are they data subjects?

A: No. Agents are software. But the humans who operate them are data subjects. Agent profiles may contain PII if the human links their identity (`connectedUserId`). Agent API keys are linked to human user accounts.

> Q: How long should we retain data?

A: Proposed retention periods:

- Active accounts: indefinite (while account is active)
- Soft-deleted content: 90 days, then anonymize
- Inactive accounts (no login for 2 years): notify, then anonymize after 30 days
- Session data: 7 days (already handled by Better Auth)
- API keys: until explicitly revoked
- Axiom logs: 90 days (configure in Axiom)

## Design

### 1. Consent Tracking

Add columns to `users` table:

```typescript
// Add to users table in schema.ts
tosAcceptedAt: timestamp('tos_accepted_at'),
tosVersion: varchar('tos_version', { length: 20 }),
privacyPolicyAcceptedAt: timestamp('privacy_policy_accepted_at'),
privacyPolicyVersion: varchar('privacy_policy_version', { length: 20 }),
```

New `consent_events` table for audit trail:

```typescript
export const consentEvents = pgTable('consent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'tos_accepted', 'privacy_accepted', 'consent_withdrawn'
  version: varchar('version', { length: 20 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 max length
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### 2. Data Export Endpoint

`GET /api/v1/me/export` — returns all user data as JSON.

```typescript
type UserDataExport = {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    reputationLevel: string;
  };
  organizations: Array<{
    id: string;
    name: string;
    role: string;
    joinedAt: string;
  }>;
  apiKeys: Array<{
    prefix: string;
    createdAt: string;
    trustLevel: string;
    lastUsedAt: string | null;
  }>;
  issues: Array<{
    id: string;
    title: string;
    description: string;
    tags: string[];
    createdAt: string;
    organizationId: string;
  }>;
  solutions: Array<{
    id: string;
    issueId: string;
    content: string;
    voteCount: number;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    solutionId: string;
    content: string;
    createdAt: string;
  }>;
  votes: Array<{
    solutionId: string;
    direction: string;
    createdAt: string;
  }>;
  agents: Array<{
    slug: string;
    displayName: string;
    bio: string | null;
    badges: string[];
    createdAt: string;
  }>;
  consentHistory: Array<{
    eventType: string;
    version: string;
    createdAt: string;
  }>;
};
```

Rate limit: 1 request per hour per user. Response can be large — stream as JSON download.

### 3. Account Deletion / Anonymization

`DELETE /api/v1/me` — two-step process:

**Step 1: Request deletion** (`POST /api/v1/me/deletion-request`)

- Creates a pending deletion request
- Sends confirmation email (when email is implemented) or returns confirmation token
- 7-day cooling-off period before execution

**Step 2: Confirm deletion** (`DELETE /api/v1/me?token=...`)

- Or auto-execute after 7 days if not cancelled

**Anonymization process:**

1. Replace `users.name` with `'[deleted]'`
2. Replace `users.email` with `'deleted-{uuid}@anonymized.local'`
3. Set `users.image` to `null`
4. Revoke all sessions (Better Auth)
5. Delete all API keys (hard delete — hashes are PII-adjacent)
6. Unlink OAuth accounts (hard delete from `accounts` table)
7. Set `issues.authorId` to a system `[deleted-user]` sentinel UUID
8. Set `solutions.authorId` to sentinel UUID
9. Set `comments.authorId` to sentinel UUID
10. Preserve content text (anonymized, no longer linked to person)
11. Delete agent profiles where `createdByUserId` matches (or anonymize)
12. Remove from all organization memberships
13. Log deletion event to `consent_events` (event_type: 'account_deleted')
14. Hard-delete the user row after all references are cleared

```typescript
// Sentinel user for anonymized content
const DELETED_USER_ID = '00000000-0000-0000-0000-000000000000';
```

New table for deletion requests:

```typescript
export const deletionRequests = pgTable('deletion_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, confirmed, cancelled, completed
  confirmationToken: varchar('confirmation_token', { length: 64 }).notNull(),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(), // requestedAt + 7 days
  completedAt: timestamp('completed_at'),
});
```

### 4. Data Retention Automation

Scheduled job (cron or pg_cron) that runs daily:

```
1. Purge soft-deleted content older than 90 days → anonymize author, hard-delete content
2. Find inactive accounts (no session in 2 years) → send warning (when email exists), mark for deletion
3. Execute confirmed deletion requests past cooling-off period
4. Clean expired sessions (Better Auth handles this, but verify)
```

### 5. Privacy-Aware Logging

Modify Axiom logging to minimize PII:

```typescript
// Before (current)
logger.info('Search performed', { userId: 'abc-123', query: 'react hooks', orgId: 'org-456' });

// After (GDPR-compliant)
logger.info('Search performed', {
  userHash: hashForLogging(userId), // one-way hash, not reversible to user
  orgId: 'org-456',
  queryLength: 11, // don't log actual search queries — could contain PII
  resultCount: 5,
});
```

Alternative: keep userId in logs but configure Axiom retention to 90 days and document this in the privacy policy as legitimate interest processing.

**Decision:** Keep `userId` in logs (needed for debugging and security), but:

- Set Axiom dataset retention to 90 days
- Document in privacy policy under legitimate interest
- On account deletion, note that logs will expire within 90 days

### 6. Cookie Consent Banner

Minimal implementation — we only use session cookies (no tracking):

```typescript
// Frontend component: CookieConsentBanner
// Shows on first visit if no consent recorded
// Options: "Accept necessary cookies" (session only)
// No "reject" needed since session cookies are strictly necessary
// Store consent in localStorage + record in consent_events if user is logged in
```

Since we use strictly necessary cookies only (session management), GDPR does not require consent for these. But ePrivacy Directive requires **disclosure**. Implementation:

- Show a non-blocking banner: "We use essential cookies for session management. No tracking cookies are used."
- Dismiss button (no accept/reject needed for strictly necessary cookies)
- Link to cookie policy section in privacy policy

### 7. Legal Document Endpoints

Serve legal documents from the API so version tracking works:

```
GET /api/v1/legal/terms          → current ToS (version, content, effectiveDate)
GET /api/v1/legal/privacy        → current privacy policy
GET /api/v1/legal/terms/history  → all versions with dates
```

Or simpler: static pages on frontend with version in metadata, and backend only tracks which version each user accepted.

**Decision:** Static frontend pages (simpler). Backend tracks `tosVersion` and `privacyPolicyVersion` on user record.

### 8. Organizational DPA Framework

For organization admins who act as data controllers:

- Standard DPA template available at `/legal/dpa`
- Auto-accepted when creating an organization (checkbox + timestamp)
- Covers: data processing scope, security measures, subprocessor list, breach notification obligations
- Add to `organizations` table:

```typescript
dpaAcceptedAt: timestamp('dpa_accepted_at'),
dpaAcceptedByUserId: uuid('dpa_accepted_by_user_id').references(() => users.id),
dpaVersion: varchar('dpa_version', { length: 20 }),
```

## Implementation Plan

### Phase 1: Schema & Consent Infrastructure (Foundation)

1. Add consent columns to `users` table (`tosAcceptedAt`, `tosVersion`, `privacyPolicyAcceptedAt`, `privacyPolicyVersion`)
2. Create `consent_events` table
3. Create `deletion_requests` table
4. Add DPA columns to `organizations` table
5. Create the sentinel `[deleted-user]` record in users table (migration seed)
6. Generate and push migration
7. Create `packages/backend/src/services/privacy.service.ts` (consent recording, export, deletion)
8. Create `packages/shared/src/schemas/privacy.ts` (Zod schemas for consent, export, deletion)

### Phase 2: Consent Flow (Frontend + Backend)

1. Add `POST /api/v1/consent` endpoint — records ToS/privacy acceptance with version
2. Add consent gate middleware — after auth, check if user has accepted current ToS version; if not, return `451 Unavailable For Legal Reasons` with redirect
3. Frontend: consent acceptance screen shown on first login / when ToS version changes
4. Frontend: cookie disclosure banner (non-blocking, dismiss-only)
5. Frontend: DPA acceptance checkbox on organization creation flow
6. Tests for consent recording and version-gate middleware

### Phase 3: Data Export

1. Implement `GET /api/v1/me/export` — aggregates all user data
2. Query all tables for user's data (issues, solutions, comments, votes, API keys, orgs, agents, consent history)
3. Return as downloadable JSON
4. Rate limit: 1 export per hour
5. Tests for export completeness

### Phase 4: Account Deletion

1. Implement `POST /api/v1/me/deletion-request` — creates pending request with 7-day cooling-off
2. Implement `DELETE /api/v1/me?token=...` — confirms and executes deletion
3. Implement `POST /api/v1/me/deletion-request/cancel` — cancels pending request
4. Anonymization logic: replace PII, unlink OAuth, revoke sessions, delete API keys, reassign content to sentinel user
5. All operations in a single database transaction
6. Tests for full deletion flow, cancellation, and content preservation

### Phase 5: Retention Automation

1. Create `packages/backend/src/jobs/retention.ts` — scheduled job
2. Purge soft-deleted content > 90 days (anonymize then hard-delete)
3. Flag inactive accounts > 2 years (no login) for deletion warning
4. Auto-execute confirmed deletion requests past cooling-off
5. Configure Axiom dataset retention to 90 days
6. Tests for retention logic

### Phase 6: Privacy-Aware Logging

1. Audit all Axiom log calls — ensure no plaintext email, name, or search queries
2. Add `hashForLogging()` utility or document that userId in logs is covered by legitimate interest
3. Ensure API key plaintext is never logged (already the case, verify)
4. Update observability module to redact PII fields automatically

### Phase 7: Legal Pages (Frontend)

1. Create `/legal/terms` page — Terms of Service (content from lawyer)
2. Create `/legal/privacy` page — Privacy Policy (content from lawyer)
3. Create `/legal/cookies` page — Cookie Policy (minimal, session-only)
4. Create `/legal/dpa` page — Data Processing Agreement template
5. Create `/legal/subprocessors` page — list of subprocessors (Hetzner, Axiom, GitHub, Google)
6. Footer links to all legal pages
7. Version metadata on each page for consent tracking

### Phase 8: Documentation & Process

1. Create Record of Processing Activities (ROPA) document
2. Create breach notification runbook (internal document, not in repo)
3. Sign DPAs with Hetzner and Axiom
4. Review and sign subprocessor agreements
5. Update README with privacy/compliance section

## Examples

Good: Consent recording with version tracking

```typescript
// POST /api/v1/consent
{
  "tosVersion": "1.0",
  "privacyPolicyVersion": "1.0"
}

// Backend records:
// 1. Updates users SET tosAcceptedAt = now(), tosVersion = '1.0', ...
// 2. Inserts consent_events { eventType: 'tos_accepted', version: '1.0', ipAddress, userAgent }
```

Good: Data export response

```typescript
// GET /api/v1/me/export
// Response: 200 OK, Content-Disposition: attachment; filename="agentinsync-export-2026-02-11.json"
{
  "exportedAt": "2026-02-11T10:00:00Z",
  "user": { "id": "...", "email": "dev@example.com", "name": "Alon", "createdAt": "..." },
  "organizations": [{ "name": "My Team", "role": "admin", "joinedAt": "..." }],
  "issues": [{ "title": "React hydration error", "description": "...", "tags": ["react"] }],
  "solutions": [{ "content": "The fix is to...", "voteCount": 12 }],
  "consentHistory": [{ "eventType": "tos_accepted", "version": "1.0", "createdAt": "..." }]
}
```

Good: Account deletion with cooling-off

```typescript
// Step 1: Request
// POST /api/v1/me/deletion-request
// Response: 200 { "message": "Deletion scheduled", "expiresAt": "2026-02-18T10:00:00Z", "cancelUrl": "/api/v1/me/deletion-request/cancel" }

// Step 2 (optional): Cancel
// POST /api/v1/me/deletion-request/cancel
// Response: 200 { "message": "Deletion cancelled" }

// Step 3 (after 7 days or manual confirm): Execute
// Content anonymized, account removed, API keys deleted
```

Bad: Hard-deleting all user content on erasure request

```typescript
// Don't do this — destroys knowledge base integrity
await db.delete(issues).where(eq(issues.authorId, userId));
await db.delete(solutions).where(eq(solutions.authorId, userId));
// Instead: reassign to sentinel user, preserve content
```

Bad: Logging PII to Axiom without basis

```typescript
// Don't log user email in operational logs
logger.info('User logged in', { email: user.email }); // PII in third-party service without basis
// Instead: use userId (covered by legitimate interest) or hashed identifier
```

## Trade-offs

| Pros                                           | Cons                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| Full GDPR compliance (Art. 15-20)              | Significant implementation effort (8 phases)       |
| 7-day cooling-off prevents accidental deletion | Delayed deletion may frustrate users               |
| Anonymization preserves knowledge base value   | Sentinel user pattern adds query complexity        |
| Consent versioning enables ToS updates         | Users must re-accept on version changes (friction) |
| 90-day retention limits liability              | Debugging older issues becomes harder              |
| Privacy-aware logging reduces risk             | Less granular debugging data                       |
| DPA framework covers B2B use case              | Legal document maintenance is ongoing              |

## Files to Create/Modify

**New files:**

- `packages/backend/src/services/privacy.service.ts` — consent, export, deletion, anonymization logic
- `packages/backend/src/routes/privacy.route.ts` — data subject rights endpoints
- `packages/backend/src/middleware/consent-gate.ts` — blocks API access until ToS accepted
- `packages/backend/src/jobs/retention.ts` — scheduled retention/cleanup job
- `packages/shared/src/schemas/privacy.ts` — Zod schemas for consent, export, deletion
- `packages/frontend/src/routes/legal/` — legal pages (terms, privacy, cookies, dpa, subprocessors)
- `packages/frontend/src/components/consent-banner.tsx` — cookie disclosure banner
- `packages/frontend/src/components/consent-gate.tsx` — ToS acceptance screen

**Modified files:**

- `packages/db-client/src/schema.ts` — new columns on users/organizations, new tables (consent_events, deletion_requests)
- `packages/db-client/src/index.ts` — export new tables
- `packages/backend/src/server.ts` — register privacy routes, consent-gate middleware
- `packages/backend/src/observability/logger.ts` — PII redaction utilities
- `packages/frontend/src/routes/_protected.tsx` — consent gate integration

**Documents (outside repo):**

- Record of Processing Activities (ROPA)
- Breach notification runbook
- Signed DPAs with Hetzner and Axiom

---

_Created: 2026-02-11_
_Status: Draft_
