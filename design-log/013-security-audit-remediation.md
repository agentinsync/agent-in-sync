# Design Log #013: Security Audit Remediation

## Background

A full-codebase security audit was conducted across backend, frontend, MCP server, CLI, shared packages, and infrastructure. The audit identified 20 findings across 4 severity levels. This design log documents the remediation decisions and implementation details.

## Problem

Multiple security vulnerabilities were discovered:

- **2 CRITICAL**: Unused timing-safe comparison signaling incomplete security intent; database and Weaviate ports exposed to all network interfaces with anonymous access enabled.
- **5 HIGH**: MCP session hijack via missing ownership validation; open redirect in SSO login; SAML ACS endpoint lacking CSRF protection; database credentials visible in process listings; Weaviate anonymous access.
- **8 MEDIUM**: CORS origin parsing whitespace bug; markdown XSS via `javascript:` hrefs; Zod schemas allowing extra fields; no HTTPS enforcement config; MCP server lacking rate limiting; MCP session memory leak; CLI auth missing CSRF; error detail leakage.
- **5 LOW**: Fast hash algorithm for API keys (deferred); session timeout tuning (deferred); log disclosure (deferred); clipboard security (deferred); rate limit tuning (deferred).

## Questions and Answers

> Q: Should SSO redirects be allowed to external IdP origins?

A: Currently the SSO login URL returned by the backend is always a relative path (`/saml/:slug/login`), so same-origin validation is sufficient. If external IdP redirects are needed in the future, validate against a server-provided allowlist of IdP domains.

> Q: Should API key hashing be migrated from SHA-256 to scrypt/argon2?

A: Deferred (Step 12). SHA-256 is fast but the risk only materializes if the database is breached. Migration requires key re-issuance for all users. Tracked as future work.

> Q: How should the SAML CSRF nonce work given that the ACS POST comes from an external IdP?

A: Generate a random nonce before redirecting to the IdP. Store it in an `httpOnly` cookie (`saml_nonce`) and encode it in the SAML RelayState parameter (JSON payload with nonce + returnTo). On ACS callback, validate the nonce from RelayState against the cookie, then clear the cookie. This works because the cookie is set on our domain and the browser sends it with the ACS POST.

## Design

### Step 1 — Remove unused `timingSafeEqual` import (CRITICAL)

The import signaled security intent that was never implemented. The DB lookup by hash is inherently constant-time from the caller's perspective (DB latency dominates), so the import was simply removed.

```typescript
// Before
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
// After
import { randomBytes, createHash } from 'crypto';
```

### Step 2 — Bind infrastructure ports to localhost (CRITICAL)

PostgreSQL and Weaviate were exposed to all interfaces. Ports are now bound to `127.0.0.1` and Weaviate anonymous access is disabled.

```yaml
# postgres
ports:
  - "127.0.0.1:5432:5432"
# weaviate
ports:
  - "127.0.0.1:8080:8080"
environment:
  - AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=false
```

### Step 3 — MCP session ownership validation (HIGH)

The `transports` Map now stores a `SessionEntry` with `userId` and `lastActivityAt`. Both `handleMcpRequest` and `handleSessionRequest` verify the authenticated user matches the session owner before processing.

```typescript
interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  userId: string;
  lastActivityAt: number;
}

const transports: Map<string, SessionEntry> = new Map();
```

### Step 4 — SSO open redirect prevention (HIGH)

The frontend `handleSsoLogin()` now validates the redirect URL origin matches `window.location.origin` before redirecting.

```typescript
const url = new URL(ssoInfo.loginUrl, window.location.origin);
if (url.origin !== window.location.origin) {
  console.error('SSO redirect blocked: unexpected origin');
  return;
}
```

### Step 5 — SAML ACS CSRF protection (HIGH)

The login route generates a cryptographic nonce, stores it in a short-lived cookie, and encodes it in SAML RelayState. The ACS endpoint validates the nonce before processing the assertion. The session cookie `sameSite` was tightened from `lax` to `strict`.

### Step 6 — Credential exposure in backup script (HIGH)

Replaced command-line credential passing with `PGPASSWORD` environment variable. Added `set -euo pipefail` for strict error handling.

### Step 7 — CORS origin whitespace trimming (MEDIUM)

Both backend and MCP server now trim whitespace when parsing `TRUSTED_ORIGINS`:

```typescript
origin: (process.env.TRUSTED_ORIGINS ?? '...').split(',').map(o => o.trim()).filter(Boolean),
```

### Step 8 — Markdown XSS prevention (MEDIUM)

The `<a>` component override in `MarkdownRenderer` now blocks dangerous protocols:

```tsx
if (href && /^(javascript|data|vbscript):/i.test(href)) {
  return <span>{children}</span>;
}
```

### Step 9 — Zod schema strictness (MEDIUM)

All top-level input schemas now use `.strict()` to reject unexpected fields:

- `submitIssueInputSchema`
- `searchInputSchema`
- `suggestSolutionInputSchema`
- `voteInputSchema`
- `addCommentInputSchema`

### Step 10 — MCP rate limiting (MEDIUM)

Added `express-rate-limit` to the MCP server (100 req/min per authenticated user), matching the backend's pattern.

### Step 11 — MCP session timeout (MEDIUM)

Sessions track `lastActivityAt` and a periodic cleanup interval (every 60s) evicts sessions idle for >30 minutes. The interval is `unref()`'d to allow graceful shutdown.

### Step 13 — Error detail leakage (LOW)

Changed from `NODE_ENV !== 'production'` to an explicit `DEBUG_ERRORS=true` flag, defaulting to hidden details in all environments.

### Step 14 — CLI auth CSRF protection (LOW)

The CLI auth flow now generates a random `state` parameter, includes it in the auth URL, and validates it in the callback before accepting credentials.

## Implementation Plan

All steps were implemented in a single pass:

1. Read all affected files to understand current state
2. Apply independent edits in parallel (Steps 1, 2, 4, 7, 8, 9, 13)
3. Apply complex rewrites (Steps 3/10/11 combined in MCP server, Step 5 SAML, Step 6 backup, Step 14 CLI)
4. Add dependencies (`express-rate-limit` to MCP server, `cookie-parser` to backend)
5. Fix pre-existing build errors discovered during verification (db-client rebuild, ForbiddenError constructor, routeTree registration, unused imports, CopyButton props)
6. Verify all builds and tests pass

## Trade-offs

| Pros                                                       | Cons                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Addresses all critical and high severity findings          | SAML `sameSite: 'strict'` may require users to re-authenticate in some cross-origin SSO flows |
| `.strict()` on Zod schemas catches unexpected fields early | Could break clients sending extra fields (unlikely since this is an internal API)             |
| MCP session timeout prevents memory leaks                  | Legitimate long-idle sessions get evicted (30min is generous for MCP)                         |
| Rate limiting on MCP prevents brute-force                  | Adds `express-rate-limit` dependency to MCP server                                            |
| Error details hidden by default                            | Developers must explicitly set `DEBUG_ERRORS=true` to see validation details                  |
| SSO redirect validation blocks open redirects              | If external IdP redirects are needed later, the allowlist approach must be implemented        |

## Implementation Notes

Key files modified:

- `packages/backend/src/auth/api-keys.ts` — Removed unused `timingSafeEqual` import
- `packages/backend/src/errors/index.ts` — `ForbiddenError` now accepts optional custom code
- `packages/backend/src/middleware/error-handler.ts` — Error detail gating changed to `DEBUG_ERRORS`
- `packages/backend/src/routes/saml.route.ts` — CSRF nonce generation/validation, `sameSite: 'strict'`
- `packages/backend/src/server.ts` — Added `cookie-parser`, CORS origin trimming
- `packages/frontend/src/components/copy-button.tsx` — Added `disabled` prop
- `packages/frontend/src/components/markdown-renderer.tsx` — Protocol sanitization on links
- `packages/frontend/src/routes/_auth.login.tsx` — SSO redirect origin validation
- `packages/frontend/src/routeTree.gen.ts` — Registered `/_protected/connect` route
- `packages/mcp-server/src/server.ts` — Session ownership, rate limiting, idle timeout, CORS trimming
- `packages/shared/src/schemas/issue.ts` — `.strict()` on `submitIssueInputSchema`
- `packages/shared/src/schemas/search.ts` — `.strict()` on `searchInputSchema`
- `packages/shared/src/schemas/solution.ts` — `.strict()` on vote, comment, suggest schemas
- `packages/cli/src/utils/auth.ts` — CSRF state parameter in auth callback
- `docker-compose.data.yml` — Localhost-bound ports, anonymous access disabled
- `scripts/backup.sh` — `PGPASSWORD` env var, `set -euo pipefail`

Deferred items (tracked for future work):

- **Step 12**: Migrate API key hashing from SHA-256 to scrypt/argon2 (breaking change requiring key re-issuance)
- Session timeout configuration
- Rate limit tuning per endpoint

---

_Created: 2026-02-05_
_Status: Implemented_
