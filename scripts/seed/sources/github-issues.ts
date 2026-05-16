import type { RawItem } from '../types.js';

const GITHUB_API = 'https://api.github.com';

const TARGET_REPOS = [
  // Your original list
  'vercel/next.js',
  'facebook/react',
  'microsoft/typescript',
  'denoland/deno',
  'vitejs/vite',
  'nodejs/node',
  'docker/compose',
  'prisma/prisma',
  'sveltejs/svelte',
  'kubernetes/kubernetes',
  'hashicorp/terraform',
  'grafana/grafana',

  // High-growth/Commonly used (2024-2026)
  'oven-sh/bun',
  'ollama/ollama',
  'supabase/supabase',
  'shadcn-ui/ui',
  'microsoft/vscode',
  'microsoft/playwright',
  'huggingface/transformers',
  'langchain-ai/langchain',
  'astro-build/astro',
  'tauri-apps/tauri',
  'zed-industries/zed',
  'tailwindlabs/tailwindcss',
  'drizzle-team/drizzle-orm',
  'vllm-project/vllm',
  'appwrite/appwrite',
  'nuxt/nuxt',
  'vuejs/core',
  'hoppscotch/hoppscotch',
  'trpc/trpc',
  'pocketbase/pocketbase',
  'prometheus/prometheus',
  'BurntSushi/ripgrep',
  'tanstack/query',
  'biomejs/biome',
  'rust-lang/rust',
];
type GHIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string }>;
  comments: number;
  state: string;
};

type GHComment = {
  id: number;
  body: string;
  user: { login: string } | null;
};

type GHSearchResponse = {
  total_count: number;
  items: GHIssue[];
};

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AgentInSync-Seed-Script',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
  const headers = getHeaders();

  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, { headers });
    if (response.ok) return response;

    if (response.status === 403 || response.status === 429) {
      const resetHeader = response.headers.get('x-ratelimit-reset');
      const waitMs = resetHeader
        ? Math.max(0, Number(resetHeader) * 1000 - Date.now()) + 1000
        : Math.pow(2, i + 1) * 5000;
      const waitSec = Math.min(waitMs / 1000, 120);
      console.log(`  Rate limited (${response.status}), waiting ${waitSec.toFixed(0)}s...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }

    // 422 from Search API: pagination beyond 1000 results, or transient index issue
    if (response.status === 422) {
      if (i < retries - 1) {
        const waitSec = Math.pow(2, i + 1) * 2;
        console.log(`  GitHub 422 (attempt ${i + 1}/${retries}), retrying in ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      return response;
    }

    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  throw new Error('GitHub API: max retries exceeded');
}

async function fetchFirstComment(repo: string, issueNumber: number): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${repo}/issues/${issueNumber}/comments?per_page=5&sort=created&direction=asc`;
  const res = await fetchWithRetry(url);
  const comments: GHComment[] = await res.json();

  // Pick the first substantive comment (>50 chars, not from a bot)
  const substantive = comments.find(c => {
    if (!c.body || c.body.length < 50) return false;
    if (c.user?.login?.endsWith('[bot]')) return false;
    return true;
  });

  return substantive?.body ?? null;
}

function extractTags(issue: GHIssue, repo: string): string[] {
  const tags: string[] = [];

  // Use the repo name as a tag
  const repoName = repo.split('/')[1];
  if (repoName) tags.push(repoName);

  // Extract label names
  for (const label of issue.labels) {
    const normalized = label.name.toLowerCase().replace(/\s+/g, '-');
    if (normalized.length <= 50 && !normalized.startsWith('p') && normalized !== 'bug') {
      tags.push(normalized);
    }
  }

  if (tags.length === 0) tags.push('general');

  return [...new Set(tags)].slice(0, 10);
}

/** Fetch popular closed bug issues from GitHub repos. */
export async function fetchGitHubIssues(count: number): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const perRepo = Math.ceil(count / TARGET_REPOS.length);

  console.log(`[GH] Fetching ~${count} issues across ${TARGET_REPOS.length} repos...`);

  for (const repo of TARGET_REPOS) {
    if (items.length >= count) break;

    const perPage = Math.min(perRepo, 100);
    const pagesNeeded = Math.ceil(perRepo / perPage);
    // GitHub Search API caps at 1000 results — don't request beyond that
    const maxPage = Math.min(pagesNeeded, Math.floor(1000 / perPage));

    for (let page = 1; page <= maxPage; page++) {
      if (items.length >= count) break;

      const query = `type:issue is:closed comments:>5 repo:${repo}`;
      const params = new URLSearchParams({
        q: query,
        sort: 'comments',
        order: 'desc',
        per_page: String(perPage),
        page: String(page),
      });

      console.log(`  [GH] repo=${repo} page=${page}/${maxPage}`);
      const res = await fetchWithRetry(`${GITHUB_API}/search/issues?${params}`);

      if (!res.ok) {
        console.log(`  [GH] repo=${repo} page=${page}: ${res.status} — skipping`);
        break;
      }

      const data: GHSearchResponse = await res.json();

      if (!data.items || data.items.length === 0) break;

      for (const issue of data.items) {
        if (items.length >= count) break;
        if (!issue.body || issue.body.length < 50) continue;

        const answer = await fetchFirstComment(repo, issue.number);

        items.push({
          sourceType: 'github',
          sourceId: `${repo}#${issue.number}`,
          sourceUrl: issue.html_url,
          title: issue.title,
          body: issue.body,
          answer,
          tags: extractTags(issue, repo),
          votes: issue.comments,
        });

        // GitHub REST API: 5000 req/hr authenticated ≈ 1.4 req/s
        await new Promise(r => setTimeout(r, 750));
      }

      console.log(`  [GH] repo=${repo}: ${items.length} total items so far`);

      // GitHub Search API: 30 req/min authenticated = 1 every 2s
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  console.log(`[GH] Total fetched: ${items.length}`);
  return items.slice(0, count);
}
