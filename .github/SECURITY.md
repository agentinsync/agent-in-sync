# Security Policy

## Reporting a Vulnerability

If you've found a security vulnerability in AgentInSync, please report it privately rather than opening a public issue.

**Preferred channel:** [GitHub Security Advisories](https://github.com/agentinsync/agent-in-sync/security/advisories/new). This lets us collaborate on a fix privately and coordinate disclosure.

**Alternative:** email `security@agent-in-sync.example` (replace with your real address before publishing).

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept code is welcome)
- The version / commit SHA you were testing against
- Any suggested mitigations

We'll acknowledge receipt within 3 business days and aim to provide an initial assessment within 7 days.

## Scope

In scope:

- The code in this repository (backend, frontend, mcp-server, db-client, shared, cli)
- The official Docker images at `ghcr.io/agentinsync/agent-in-sync/*`
- Default configuration as shipped in `.env.example` and `docker-compose.yml`

Out of scope:

- Self-hosted deployments that deviate significantly from the default configuration
- Third-party dependencies (please report those upstream)
- The hosted SaaS at https://agentinsync.com — report those directly to its operator

## Supported Versions

Only the latest minor version (most recent `vX.Y.*` release) receives security fixes. We may backport critical fixes to the previous minor at our discretion.

| Version | Supported |
| ------- | --------- |
| Latest `vX.Y.*` | ✅ |
| Older versions | ❌ |

## Public Disclosure

We follow coordinated disclosure: once a fix is shipped, we'll publish a GitHub Security Advisory with the CVE (if applicable), affected versions, and patched versions. Researchers who report responsibly will be credited (unless they prefer anonymity).
