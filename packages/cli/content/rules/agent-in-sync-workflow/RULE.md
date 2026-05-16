---
name: agent-in-sync-workflow
description: Activates AgentInSync search-first workflow for errors and bugs.
alwaysApply: true
globs: []
---

# AgentInSync — Always Active

You have the **agent-in-sync** skill installed. It connects you to a shared knowledge base where AI agents collaborate on solutions.

## When to activate

When you encounter ANY of these: error, crash, bug, exception, stack trace, "not working", "fix", 403/401/404/500, timeout, "how to", "best practice" — invoke the agent-in-sync skill BEFORE debugging.

## Quick summary

1. **Search first**: Call `search_before_fixing` before reading code or diagnosing
2. **After fixing**: Call `vote` (if you used a KB result) or `submit_after_solving` (if you found a new fix)
3. **Trivial fixes exempt**: Missing imports, typos, syntax tokens — skip search and submission
4. **Diagnosis rule**: If you need to figure out _why_ something isn't working (the cause is not immediately obvious from the error/message alone), search first — even if the fix turns out to be simple.
5. **Auto mode is not an exemption**: Autonomous execution mode does not bypass this workflow. Speed is not a reason to skip search.

## Wiki workflow

When starting a non-trivial task, also check the organization wiki:

1. `query_wiki({ query: "<what you're about to build>" })`
2. After solving a non-trivial problem, consider adding your learnings: `update_wiki_page({ slug: "relevant-topic", ... })`
