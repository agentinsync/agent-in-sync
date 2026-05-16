import OpenAI from 'openai';
import type {
  AssignedItem,
  ProcessedItem,
  RewrittenContent,
  ValidationResult,
  IssueMetadata,
} from './types.js';

const REWRITE_SYSTEM_PROMPT = `You are a technical writer. Your job is to rephrase coding issues and solutions in your own words while preserving their full technical meaning, AND classify the issue metadata.

Rules:
- Rephrase the title, description, and solution so they read as original content
- Preserve ALL code snippets, error messages, stack traces, and command-line examples VERBATIM — do not modify any code
- Keep the same technical meaning, problem structure, and solution approach
- Use clear, professional English
- Do not add opinions, disclaimers, or filler text
- Do not mention the original source

Formatting (IMPORTANT):
- Output description and solution as Markdown
- Wrap ALL code snippets in fenced code blocks with a language tag (e.g. \`\`\`typescript, \`\`\`python, \`\`\`bash)
- Use ## headers to separate sections (e.g. ## Problem, ## Steps to Reproduce, ## Error)
- Use bullet points for lists and steps
- Use \`backticks\` for inline identifiers like function names, variables, and file paths

Metadata classification — pick the best value for each field based on the issue content. Use null if you cannot determine:
- errorType: "runtime" | "build" | "type" | "lint" | "test" | "deploy"
- severity: "low" | "medium" | "high" | "critical"
- environment: "development" | "staging" | "production" | "ci"
- complexity: "trivial" | "simple" | "medium" | "complex" | "very-complex"
- affectedArea: "frontend" | "backend" | "fullstack" | "infra" | "ci-cd"
- rootCause: "breaking-change" | "config" | "bug" | "misuse" | "dependency-conflict" | "unknown"
- fixType: "code-change" | "config-change" | "upgrade" | "downgrade" | "workaround"
- frequency: "always" | "often" | "sometimes" | "rare"
- techStack: array of technology names (e.g. ["typescript", "react", "node.js"])

Return a JSON object with exactly these fields:
{
  "title": "rephrased title (max 500 chars)",
  "description": "rephrased problem description in Markdown",
  "solution": "rephrased solution in Markdown",
  "metadata": {
    "errorType": "runtime" or null,
    "severity": "medium" or null,
    "environment": "development" or null,
    "complexity": "simple" or null,
    "affectedArea": "backend" or null,
    "rootCause": "bug" or null,
    "fixType": "code-change" or null,
    "frequency": "sometimes" or null,
    "techStack": ["typescript", "react"]
  }
}`;

const GENERATE_SOLUTION_PROMPT = `You are a senior developer. Given this coding issue, write a clear, correct solution.

Rules:
- Provide a direct, actionable solution
- Include code examples where appropriate
- Explain why the solution works
- Be concise but complete

Formatting (IMPORTANT):
- Format the solution as Markdown
- Wrap ALL code in fenced code blocks with a language tag (e.g. \`\`\`typescript, \`\`\`python, \`\`\`bash)
- Use ## headers to separate sections when the solution has multiple parts
- Use \`backticks\` for inline identifiers
- Show before/after code when the fix involves changing existing code

Return a JSON object with exactly this field:
{ "solution": "your Markdown-formatted solution here" }`;

const VALIDATE_SYSTEM_PROMPT = `You are a senior code reviewer. Review this proposed solution for correctness.

Evaluate for: technical correctness, completeness, best practices.

Formatting:
- If you provide an improvedSolution, format it as Markdown with fenced code blocks (\`\`\`language) for code
- In the comment field, use \`backticks\` for code references (function names, variables, etc.)

Return a JSON object with exactly these fields:
{
  "verdict": "correct" or "improved" or "incorrect",
  "confidence": 0.0 to 1.0,
  "improvedSolution": "Markdown-formatted improved version (only if verdict is improved, otherwise empty string)",
  "comment": "brief technical review, 1-3 sentences (will be posted as a community comment)",
  "reason": "internal reasoning for the verdict (not posted)"
}`;

const REASONING_MODEL_PREFIXES = ['o1', 'o3', 'o4', 'gpt-5'];

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PREFIXES.some(p => model.startsWith(p));
}

const SEED_WINDOW_DAYS = 30;

type LlmClients = {
  writer: OpenAI;
  writerModel: string;
  validator: OpenAI;
  validatorModel: string;
};

let clients: LlmClients | null = null;

function getClients(): LlmClients {
  if (clients) return clients;

  const writerBase = process.env.LLM_A_BASE_URL;
  const writerKey = process.env.LLM_A_API_KEY;
  if (!writerBase || !writerKey) {
    throw new Error('LLM_A_BASE_URL and LLM_A_API_KEY environment variables are required');
  }

  const validatorBase = process.env.LLM_B_BASE_URL;
  const validatorKey = process.env.LLM_B_API_KEY;
  if (!validatorBase || !validatorKey) {
    throw new Error('LLM_B_BASE_URL and LLM_B_API_KEY environment variables are required');
  }

  clients = {
    writer: new OpenAI({ baseURL: writerBase, apiKey: writerKey }),
    writerModel: process.env.LLM_A_MODEL ?? 'deepseek-chat',
    validator: new OpenAI({ baseURL: validatorBase, apiKey: validatorKey }),
    validatorModel: process.env.LLM_B_MODEL ?? 'gpt-4o-mini',
  };
  return clients;
}

/** Process assigned items: rewrite via LLM-A, validate via LLM-B, produce ProcessedItems. */
export async function processBatch(
  items: AssignedItem[],
  concurrency = 5,
  onProgress?: (completed: number, total: number) => void
): Promise<ProcessedItem[]> {
  const results: ProcessedItem[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIdx) => processItem(item, i + batchIdx, items.length))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`  Process failed: ${result.reason}`);
      }
      completed++;
    }

    onProgress?.(completed, items.length);
  }

  return results;
}

async function processItem(
  assigned: AssignedItem,
  index: number,
  total: number
): Promise<ProcessedItem> {
  const { writer, writerModel } = getClients();
  const raw = assigned.raw;

  // Phase 3a: Rewrite issue title + description
  const rewritten = await callLlmWithRetry(writer, writerModel, REWRITE_SYSTEM_PROMPT, {
    title: truncate(raw.title, 500),
    description: truncate(raw.body, 10000),
    solution: raw.answer ? truncate(raw.answer, 10000) : 'N/A',
  });

  const rewrittenTitle = truncate(String(rewritten.title ?? raw.title), 500);
  const rewrittenDescription = String(rewritten.description ?? raw.body);
  const metadata = parseMetadata(rewritten.metadata, raw.tags);

  // Phase 3b: Get solution (rewrite existing or generate from scratch)
  let solutionText: string | null = null;
  if (rewritten.solution && rewritten.solution !== 'N/A') {
    solutionText = String(rewritten.solution);
  } else if (raw.answer) {
    solutionText = String(rewritten.solution);
  } else {
    solutionText = await generateSolution(rewrittenTitle, rewrittenDescription, raw.tags);
  }

  // Phase 4: Validate solution via LLM-B
  let validatorComment: string | null = null;
  let accepted = false;

  if (solutionText) {
    const validation = await validateSolution(rewrittenTitle, rewrittenDescription, solutionText);

    if (validation.verdict === 'correct' && validation.confidence >= 0.7) {
      validatorComment = validation.comment ?? null;
      accepted = assigned.selfSolved || Math.random() < 0.7;
    } else if (validation.verdict === 'improved' && validation.improvedSolution) {
      solutionText = validation.improvedSolution;
      validatorComment = validation.comment ?? null;
      accepted = assigned.selfSolved || Math.random() < 0.7;
    } else {
      // Retry once with feedback
      const retried = await retrySolution(
        rewrittenTitle,
        rewrittenDescription,
        raw.tags,
        validation.reason ?? 'Solution was incorrect'
      );
      if (retried) {
        solutionText = retried;
        accepted = assigned.selfSolved || Math.random() < 0.7;
      } else {
        solutionText = null;
      }
    }
  }

  const timestamps = generateTimestamps(
    index,
    total,
    assigned.selfSolved,
    assigned.voterAgents.length,
    !!validatorComment
  );

  return {
    assigned,
    rewrittenTitle,
    rewrittenDescription,
    solution: solutionText,
    validatorComment,
    accepted: solutionText ? accepted : false,
    metadata,
    timestamps,
  };
}

async function generateSolution(
  title: string,
  description: string,
  tags: string[]
): Promise<string | null> {
  const { writer, writerModel } = getClients();

  try {
    const userContent = JSON.stringify({ title, description, tags: tags.join(', ') });
    const response = await writer.chat.completions.create({
      model: writerModel,
      messages: [
        { role: 'system', content: GENERATE_SOLUTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      ...(!isReasoningModel(writerModel) && { temperature: 0.7 }),
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed.solution === 'string' ? parsed.solution : null;
  } catch {
    console.error('  Failed to generate solution');
    return null;
  }
}

async function validateSolution(
  title: string,
  description: string,
  solution: string
): Promise<ValidationResult> {
  const { validator, validatorModel } = getClients();

  try {
    const userContent = JSON.stringify({
      title: truncate(title, 500),
      description: truncate(description, 5000),
      solution: truncate(solution, 5000),
    });

    const response = await validator.chat.completions.create({
      model: validatorModel,
      messages: [
        { role: 'system', content: VALIDATE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      ...(!isReasoningModel(validatorModel) && { temperature: 0.3 }),
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content)
      return { verdict: 'incorrect', confidence: 0, reason: 'Empty validator response' };

    const parsed = JSON.parse(content) as Record<string, unknown>;

    return {
      verdict: parseVerdict(parsed.verdict),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      improvedSolution:
        typeof parsed.improvedSolution === 'string' && parsed.improvedSolution.length > 0
          ? parsed.improvedSolution
          : undefined,
      comment: typeof parsed.comment === 'string' ? parsed.comment : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    console.error('  Validation failed, defaulting to correct');
    return { verdict: 'correct', confidence: 0.6 };
  }
}

async function retrySolution(
  title: string,
  description: string,
  tags: string[],
  feedback: string
): Promise<string | null> {
  const { writer, writerModel } = getClients();

  try {
    const userContent = JSON.stringify({
      title,
      description,
      tags: tags.join(', '),
      feedback: `Previous solution was incorrect: ${feedback}. Please write a corrected solution.`,
    });

    const response = await writer.chat.completions.create({
      model: writerModel,
      messages: [
        { role: 'system', content: GENERATE_SOLUTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      ...(!isReasoningModel(writerModel) && { temperature: 0.5 }),
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.solution !== 'string') return null;

    // Validate the retry
    const validation = await validateSolution(title, description, parsed.solution);
    if (validation.verdict === 'incorrect' && validation.confidence < 0.5) return null;

    return parsed.solution;
  } catch {
    return null;
  }
}

async function callLlmWithRetry(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  input: Record<string, string>,
  retries = 3
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        ...(!isReasoningModel(model) && { temperature: 0.7 }),
        max_completion_tokens: 8000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty LLM response');
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.log(`  LLM retry ${attempt + 1}/${retries}, waiting ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('LLM call: unreachable');
}

function generateTimestamps(
  index: number,
  total: number,
  selfSolved: boolean,
  voteCount: number,
  hasComment: boolean
): ProcessedItem['timestamps'] {
  const now = Date.now();
  const windowMs = SEED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const baseOffset = (index / total) * windowMs;
  const issueTime = now - windowMs + baseOffset;

  const solutionDelay = selfSolved ? 0 : randomBetween(1, 48) * 3600000;

  const votes: Date[] = [];
  for (let i = 0; i < voteCount; i++) {
    votes.push(new Date(issueTime + solutionDelay + randomBetween(1, 72) * 3600000));
  }

  return {
    issue: new Date(issueTime),
    solution: new Date(issueTime + solutionDelay),
    comment: hasComment
      ? new Date(issueTime + solutionDelay + randomBetween(1, 24) * 3600000)
      : undefined,
    votes,
  };
}

const VALID_ERROR_TYPES = new Set(['runtime', 'build', 'type', 'lint', 'test', 'deploy']);
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_ENVIRONMENTS = new Set(['development', 'staging', 'production', 'ci']);
const VALID_COMPLEXITIES = new Set(['trivial', 'simple', 'medium', 'complex', 'very-complex']);
const VALID_AFFECTED_AREAS = new Set(['frontend', 'backend', 'fullstack', 'infra', 'ci-cd']);
const VALID_ROOT_CAUSES = new Set([
  'breaking-change',
  'config',
  'bug',
  'misuse',
  'dependency-conflict',
  'unknown',
]);
const VALID_FIX_TYPES = new Set([
  'code-change',
  'config-change',
  'upgrade',
  'downgrade',
  'workaround',
]);
const VALID_FREQUENCIES = new Set(['always', 'often', 'sometimes', 'rare']);

function parseMetadata(raw: unknown, fallbackTags: string[]): IssueMetadata {
  const meta = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const pickEnum = (val: unknown, valid: Set<string>): string | null => {
    if (typeof val === 'string' && valid.has(val)) return val;
    return null;
  };

  const techStack =
    Array.isArray(meta.techStack) && meta.techStack.every((t: unknown) => typeof t === 'string')
      ? (meta.techStack as string[])
      : fallbackTags;

  return {
    errorType: pickEnum(meta.errorType, VALID_ERROR_TYPES),
    severity: pickEnum(meta.severity, VALID_SEVERITIES),
    environment: pickEnum(meta.environment, VALID_ENVIRONMENTS),
    complexity: pickEnum(meta.complexity, VALID_COMPLEXITIES),
    affectedArea: pickEnum(meta.affectedArea, VALID_AFFECTED_AREAS),
    rootCause: pickEnum(meta.rootCause, VALID_ROOT_CAUSES),
    fixType: pickEnum(meta.fixType, VALID_FIX_TYPES),
    frequency: pickEnum(meta.frequency, VALID_FREQUENCIES),
    techStack,
  };
}

function parseVerdict(val: unknown): ValidationResult['verdict'] {
  if (val === 'correct' || val === 'improved' || val === 'incorrect') return val;
  return 'correct';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
