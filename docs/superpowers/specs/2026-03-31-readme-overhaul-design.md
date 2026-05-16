# Design Spec: README Overhaul

**Date:** 2026-03-31  
**Status:** Approved

## Background

The project has 5 user-facing documentation files that have diverged from the code. The root `README.md` acts as a monolith — it covers setup, API reference, architecture, deployment overview, and a design log table that stops at entry 014 (actual logs go up to 049). There is no dedicated file for contributors/team members.

## Goals

1. Root `README.md` becomes a polished, terminal-hacker-style hub for **external developers and self-hosters**
2. A new `CONTRIBUTING.md` serves **contributors and team members** (includes the full design log table)
3. All existing docs are audited and stale content is corrected

## Non-Goals

- Per-package READMEs (not needed)
- Rewriting DEPLOYMENT.md structure (it's comprehensive and accurate)
- Changing CLAUDE.md or AGENTS.md code conventions

---

## File Plan

### 1. README.md — Rewrite (terminal/hacker aesthetic)

**Audience:** External developers, self-hosters, people evaluating the project.

**Aesthetic:** Terminal/hacker vibe. ASCII art logo, monospace feel, written as if by agents for agents. No emoji. Bold and punchy.

**Structure:**

```
1. ASCII art logo ("AGENT IN SYNC" block letters)
2. One-liner tagline — agent-to-agent framing ("The knowledge base agents share.")
3. Badges — build status, license, Node.js version (shields.io)
4. Feature list — monospace-style bullets
5. Quick Start — exactly 6 commands, zero to running
6. Documentation table — links to all other docs
7. API at a glance — 2-3 curl examples (search, submit, vote)
8. Architecture — ASCII diagram (two-server layout, same as DEPLOYMENT.md)
9. Footer — license line
```

**Staleness fixes in this file:**

- Node.js prerequisite: `>= 20` → `22+`
- Search types: remove `keyword` as standalone; only `vector` and `hybrid`
- CLI command: `pnpm --filter @agent-in-sync/cli start` → `pnpm --filter @agent-in-sync/cli dev`
- Project structure: add `benchmark/`, `benchmark-oss/`, `docs/`, `scripts/seed/`
- Remove design log table entirely (moves to CONTRIBUTING.md)
- Remove full API endpoint tables (keep only 2-3 curl examples)
- Remove full development section (link to README.dev.md instead)

---

### 2. CONTRIBUTING.md — Create new

**Audience:** Team members, contributors, people actively developing the project.

**Structure:**

```
1. Short intro — "you're building this"
2. Quick links — CLAUDE.md, AGENTS.md, design-log/
3. Design Log table — full 001-049 list (moved from README.md), with status column
4. Dev workflow — key commands (lint, test, typecheck, format)
5. Code conventions summary — from CLAUDE.md (module system, TypeScript strict, patterns)
6. Package overview — short table of the 6 packages and their roles
```

---

### 3. README.dev.md — Update

**Fixes:**

- Add a one-line mention of `pnpm seed:dev` in the "optional setup" section (it's documented in README.md but not here)

---

### 4. AGENTS.md — Update

**Fixes:**

- Weaviate version: `1.28.4` → `1.36.6`
- Design log list: add entries `048-org-admin-settings.md` and `049-local-dev-seed.md`
- Node.js runtime version: `20+` → `22+` (consistency)

---

### 5. DEPLOYMENT.md — No changes needed

The deployment guide is accurate and comprehensive. The DL #046 upgrade runbook at the bottom is current. No changes required.

---

## Documentation Navigation Table (for README.md)

| Doc                                                  | Description                                   |
| ---------------------------------------------------- | --------------------------------------------- |
| [README.dev.md](./README.dev.md)                     | Local dev setup — Docker, env vars, seeding   |
| [DEPLOYMENT.md](./DEPLOYMENT.md)                     | Hetzner Cloud deployment guide                |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                 | Contributor guide — design logs, dev workflow |
| [benchmark/README.md](./benchmark/README.md)         | Token savings benchmark                       |
| [benchmark-oss/README.md](./benchmark-oss/README.md) | OSS (Sentry) benchmark                        |
| [scripts/seed/README.md](./scripts/seed/README.md)   | Public content seed pipeline                  |
| [design-log/](./design-log/)                         | Architecture decision records (001–049)       |

---

## Staleness Fix Summary

| File            | Issue                                      | Fix                                                          |
| --------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `README.md`     | Node.js `>= 20`                            | → `22+`                                                      |
| `README.md`     | `keyword` listed as standalone search type | Remove; keep `vector` / `hybrid` only                        |
| `README.md`     | Project structure missing dirs             | Add `benchmark/`, `benchmark-oss/`, `docs/`, `scripts/seed/` |
| `README.md`     | CLI command `start`                        | → `dev`                                                      |
| `README.md`     | Design log table stops at 014              | Remove — move to `CONTRIBUTING.md`                           |
| `AGENTS.md`     | Weaviate `1.28.4`                          | → `1.36.6`                                                   |
| `AGENTS.md`     | Design log list stops at 047               | Add 048, 049                                                 |
| `AGENTS.md`     | Node.js `20+`                              | → `22+`                                                      |
| `README.dev.md` | No mention of `pnpm seed:dev`              | Add brief mention                                            |
