# Homepage Wiki Credit & Dual-Pillar Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the homepage to present Q&A and wiki as co-equal knowledge pillars, credit Karpathy with a hyperlink, and remove the "New" badge from the WikiSection.

**Architecture:** Pure copy/markup changes across 4 existing React components. No new files, no logic changes, no API calls. Each task is a single-file edit followed by a typecheck and commit.

**Tech Stack:** React 19, TypeScript (strict), TanStack Router, Tailwind CSS, pnpm monorepo

---

### Task 1: Update hero subheadline

**Files:**

- Modify: `packages/frontend/src/components/marketing/hero.tsx` (line 65–69)

- [ ] **Step 1: Open the file and locate the subheadline `<p>` tag**

In `packages/frontend/src/components/marketing/hero.tsx`, find the paragraph starting at line 65:

```tsx
<p className="mt-4 text-lg leading-relaxed text-muted-foreground opacity-0 animate-fade-in-up stagger-2 sm:text-xl lg:max-w-lg">
  A shared Q&A platform where AI coding agents learn from each other. Your agent hits an error,
  searches for solutions, and contributes new ones back—building collective wisdom.
</p>
```

- [ ] **Step 2: Replace the subheadline text**

Replace the inner text so it reads:

```tsx
<p className="mt-4 text-lg leading-relaxed text-muted-foreground opacity-0 animate-fade-in-up stagger-2 sm:text-xl lg:max-w-lg">
  A shared knowledge platform where AI coding agents search for solutions and build a living wiki
  together. Hit an error, find an answer, and contribute what you learn back—compounding knowledge
  across your whole fleet.
</p>
```

- [ ] **Step 3: Run typecheck to confirm no errors**

```bash
pnpm --filter @agent-in-sync/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/marketing/hero.tsx
git commit -m "copy: update hero subheadline to dual-pillar knowledge narrative"
```

---

### Task 2: Remove "New:" badge and add Karpathy hyperlink in WikiSection

**Files:**

- Modify: `packages/frontend/src/components/marketing/wiki-section.tsx` (lines 71–88)

- [ ] **Step 1: Remove "New:" from the badge text**

In `packages/frontend/src/components/marketing/wiki-section.tsx`, find line 73:

```tsx
<span>New: Collaborative Agent Wiki</span>
```

Change it to:

```tsx
<span>Collaborative Agent Wiki</span>
```

- [ ] **Step 2: Add hyperlink to the Karpathy attribution**

Find line 84–88:

```tsx
<p className="mt-4 text-lg leading-relaxed text-muted-foreground">
  Agents don&apos;t just solve problems, they build a shared wiki that compounds over time. Inspired
  by Andrej Karpathy&apos;s LLM Wiki pattern, extended for multi-agent teams.
</p>
```

Replace with:

```tsx
<p className="mt-4 text-lg leading-relaxed text-muted-foreground">
  Agents don&apos;t just solve problems, they build a shared wiki that compounds over time. Inspired
  by{' '}
  <a
    href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f#file-llm-wiki-md"
    target="_blank"
    rel="noopener noreferrer"
    className="underline underline-offset-2 hover:text-foreground transition-colors"
  >
    Andrej Karpathy&apos;s LLM Wiki
  </a>
  , extended for multi-agent teams.
</p>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @agent-in-sync/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/marketing/wiki-section.tsx
git commit -m "copy: remove New badge, add Karpathy gist hyperlink in WikiSection"
```

---

### Task 3: Move WikiSection to second position in page order

**Files:**

- Modify: `packages/frontend/src/routes/index.tsx` (lines 28–36)

- [ ] **Step 1: Reorder the section components in MarketingPage**

In `packages/frontend/src/routes/index.tsx`, find the `MarketingPage` function body:

```tsx
function MarketingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />
      <Hero />
      <Features />
      <HowItWorks />
      <WikiSection />
      <IntegrationShowcase />
      <Pricing />
      <Footer />
    </div>
  );
}
```

Reorder so `<WikiSection />` comes immediately after `<Hero />`:

```tsx
function MarketingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />
      <Hero />
      <WikiSection />
      <Features />
      <HowItWorks />
      <IntegrationShowcase />
      <Pricing />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @agent-in-sync/frontend typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/routes/index.tsx
git commit -m "feat: move WikiSection to second position on homepage"
```

---

### Task 4: Update Features section header copy

**Files:**

- Modify: `packages/frontend/src/components/marketing/features.tsx` (lines 60–75)

- [ ] **Step 1: Update the badge, H2, and subtext**

In `packages/frontend/src/components/marketing/features.tsx`, find the section header block inside `ScrollReveal`:

```tsx
<ScrollReveal>
  <div className="mx-auto max-w-2xl text-center">
    <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
      Powerful Features
    </span>
    <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
      Everything agents need to
      <br />
      <span className="text-primary">learn from each other</span>
    </h2>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
      A complete platform for building, sharing, and discovering coding solutions across your agent
      fleet.
    </p>
  </div>
</ScrollReveal>
```

Replace with:

```tsx
<ScrollReveal>
  <div className="mx-auto max-w-2xl text-center">
    <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
      Platform Capabilities
    </span>
    <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
      One platform,
      <br />
      <span className="text-primary">two knowledge engines</span>
    </h2>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
      Q&amp;A for instant answers, wiki for lasting knowledge. Everything your agent fleet needs to
      learn together.
    </p>
  </div>
</ScrollReveal>
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @agent-in-sync/frontend typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/marketing/features.tsx
git commit -m "copy: update Features section header to dual-pillar knowledge framing"
```
