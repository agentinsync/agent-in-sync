import type { RawItem } from '../types.js';
import { htmlToMarkdown } from '../html-to-markdown.js';

const BASE_URL = 'https://api.stackexchange.com/2.3';

const POPULAR_TAGS = [
  // --- Original List ---
  'javascript',
  'typescript',
  'python',
  'react',
  'node.js',
  'docker',
  'kubernetes',
  'git',
  'sql',
  'java',
  'go',
  'rust',
  'aws',
  'linux',
  'nginx',
  'postgresql',
  'redis',
  'graphql',
  'security',
  'terraform',

  // --- AI & Machine Learning (The 2024-2026 Surge) ---
  'llm', // Large Language Models (the most common new tag)
  'generative-ai', // Catch-all for GenAI projects
  'langchain', // The standard for AI orchestration
  'rag', // Retrieval-Augmented Generation (essential for DB/AI)
  'pytorch', // Dominant ML framework for model development
  'openai', // Tracking API integrations and wrappers
  'ai-agents', // Shift from simple chatbots to autonomous agents

  // --- Modern Web & Runtime ---
  'nextjs', // Now the default for production React apps
  'tailwind-css', // The industry standard for styling
  'bun', // The high-growth alternative to Node.js
  'trpc', // End-to-end typesafe API development
  'serverless', // Fundamental to modern Vercel/AWS workflows

  // --- Database & Infrastructure ---
  'supabase', // The primary "Backend-as-a-Service" choice
  'orm', // Crucial for Prisma, Drizzle, and TypeORM issues
  'mongodb', // Still the leader for NoSQL/Document storage
  'cloudflare', // Massive growth in Edge workers and hosting
  'devops', // High-level tag for CI/CD and automation
  'prometheus', // The standard for observability and metrics

  // --- New Standards ---
  'web-assembly', // (Wasm) High-performance code in the browser
  'pnpm', // Increasingly preferred over npm/yarn for speed
];

type SOQuestion = {
  question_id: number;
  title: string;
  body: string;
  tags: string[];
  score: number;
  link: string;
  accepted_answer_id?: number;
};

type SOAnswer = {
  answer_id: number;
  question_id: number;
  body: string;
  score: number;
  is_accepted: boolean;
};

type SOResponse<T> = {
  items: T[];
  has_more: boolean;
  quota_remaining: number;
};

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url);
    if (response.ok) return response;

    if (response.status === 429 || response.status === 502) {
      const wait = Math.pow(2, i + 1) * 1000;
      console.log(`  Rate limited, waiting ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`SO API error: ${response.status} ${response.statusText}`);
  }
  throw new Error('SO API: max retries exceeded');
}

async function fetchQuestionsByTag(
  tag: string,
  page: number,
  pageSize: number,
  apiKey?: string
): Promise<SOResponse<SOQuestion>> {
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'votes',
    site: 'stackoverflow',
    tagged: tag,
    page: String(page),
    pagesize: String(pageSize),
    filter: 'withbody',
  });
  if (apiKey) params.set('key', apiKey);

  const res = await fetchWithRetry(`${BASE_URL}/questions?${params}`);
  return res.json() as Promise<SOResponse<SOQuestion>>;
}

async function fetchAnswersForQuestions(
  questionIds: number[],
  apiKey?: string
): Promise<SOResponse<SOAnswer>> {
  const ids = questionIds.join(';');
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'votes',
    site: 'stackoverflow',
    filter: 'withbody',
  });
  if (apiKey) params.set('key', apiKey);

  const res = await fetchWithRetry(`${BASE_URL}/questions/${ids}/answers?${params}`);
  return res.json() as Promise<SOResponse<SOAnswer>>;
}

function pickBestAnswer(answers: SOAnswer[], questionId: number): SOAnswer | undefined {
  const forQuestion = answers.filter(a => a.question_id === questionId);
  const accepted = forQuestion.find(a => a.is_accepted);
  if (accepted) return accepted;
  return forQuestion.sort((a, b) => b.score - a.score)[0];
}

/** Fetch popular Stack Overflow questions with their best answers. */
export async function fetchStackOverflow(count: number): Promise<RawItem[]> {
  const apiKey = process.env.STACK_EXCHANGE_API_KEY;
  const items: RawItem[] = [];
  const perTag = Math.ceil(count / POPULAR_TAGS.length);
  const pageSize = Math.min(perTag, 100);

  console.log(`[SO] Fetching ~${count} questions across ${POPULAR_TAGS.length} tags...`);

  for (const tag of POPULAR_TAGS) {
    if (items.length >= count) break;

    const pagesNeeded = Math.ceil(perTag / pageSize);
    let fetched = 0;

    for (let page = 1; page <= pagesNeeded; page++) {
      if (items.length >= count) break;

      console.log(`  [SO] tag=${tag} page=${page}/${pagesNeeded}`);
      const questionsRes = await fetchQuestionsByTag(tag, page, pageSize, apiKey);

      if (questionsRes.items.length === 0) break;

      const questionIds = questionsRes.items.map(q => q.question_id);

      // Fetch answers in chunks of 100 (API limit)
      const allAnswers: SOAnswer[] = [];
      for (let i = 0; i < questionIds.length; i += 100) {
        const chunk = questionIds.slice(i, i + 100);
        const answersRes = await fetchAnswersForQuestions(chunk, apiKey);
        allAnswers.push(...answersRes.items);
      }

      for (const q of questionsRes.items) {
        if (items.length >= count) break;

        const bestAnswer = pickBestAnswer(allAnswers, q.question_id);

        items.push({
          sourceType: 'stackoverflow',
          sourceId: String(q.question_id),
          sourceUrl: q.link,
          title: q.title,
          body: htmlToMarkdown(q.body),
          answer: bestAnswer ? htmlToMarkdown(bestAnswer.body) : null,
          tags: q.tags,
          votes: q.score,
        });
      }

      fetched += questionsRes.items.length;
      console.log(
        `  [SO] tag=${tag}: ${fetched} questions fetched (quota remaining: ${questionsRes.quota_remaining})`
      );

      if (!questionsRes.has_more) break;

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`[SO] Total fetched: ${items.length}`);
  return items.slice(0, count);
}
