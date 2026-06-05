import { readFile, writeFile } from 'node:fs/promises';
import { scanRepo } from './scanner';
import { buildPrompt } from './promptBuilder';
import { callLLM } from './llmClient';
import { CATEGORY_MAX, bandForScore } from './types';
import type { CategoryScores, LLMConfig, ScoreResult, ScoresStore } from './types';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];

export function parseScoreResult(raw: string): ScoreResult {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    extractJsonObject(trimmed)
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return normalizeScoreResult(JSON.parse(candidate));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Invalid JSON');
}

function normalizeScoreResult(value: unknown): ScoreResult {
  if (!isRecord(value)) {
    throw new Error('Score result must be an object');
  }
  if (!isRecord(value.categories)) {
    throw new Error('Score result missing categories object');
  }

  const categories = {} as CategoryScores;
  for (const key of CATEGORY_KEYS) {
    categories[key] = parseCategoryScore(key, value.categories[key]);
  }

  const score = CATEGORY_KEYS.reduce((sum, key) => sum + categories[key], 0);
  const primaryLanguage = typeof value.primaryLanguage === 'string' && value.primaryLanguage.trim()
    ? value.primaryLanguage.trim()
    : 'Unknown';

  return {
    scoredAt: typeof value.scoredAt === 'string' ? value.scoredAt : '',
    score,
    band: bandForScore(score),
    primaryLanguage,
    categories,
    qualityFlags: normalizeStringArray(value.qualityFlags),
    riskFlags: normalizeStringArray(value.riskFlags),
    recommendations: normalizeStringArray(value.recommendations)
  };
}

function parseCategoryScore(key: keyof CategoryScores, value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new Error(`Category "${key}" must be numeric`);
  }
  const rounded = Math.round(numeric);
  return Math.min(Math.max(rounded, 0), CATEGORY_MAX[key]);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

export async function scoreRepo(
  name: string,
  repoPath: string,
  rubric: string,
  llmConfig: LLMConfig,
  scoresPath: string
): Promise<ScoreResult> {
  const scan = await scanRepo(repoPath);
  const prompt = buildPrompt(rubric, scan);

  let raw: string;
  try {
    raw = await callLLM(llmConfig, prompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`LLM_UNREACHABLE: ${msg}`);
  }

  let result = tryParseScoreResult(raw);
  if (!result) {
    let raw2: string;
    try {
      raw2 = await callLLM(llmConfig, buildRepairPrompt(raw));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`LLM_UNREACHABLE: ${msg}`);
    }
    result = tryParseScoreResult(raw2);
    if (!result) {
      throw new Error('PARSE_FAILED');
    }
  }

  result.scoredAt = new Date().toISOString();

  let scores: ScoresStore = {};
  try {
    scores = JSON.parse(await readFile(scoresPath, 'utf-8'));
  } catch {
    // file missing or corrupt — start fresh
  }
  scores[name] = result;
  await writeFile(scoresPath, JSON.stringify(scores, null, 2));

  return result;
}

function tryParseScoreResult(raw: string): ScoreResult | null {
  try {
    return parseScoreResult(raw);
  } catch {
    return null;
  }
}

function buildRepairPrompt(raw: string): string {
  return `Convert the text below into one valid JSON object for this exact schema. Return raw JSON only, no markdown.

Required schema:
{
  "score": <integer 0-100>,
  "band": <"Fragile" | "Emerging" | "Operational" | "Managed" | "Mature">,
  "primaryLanguage": <string>,
  "categories": {
    "persistent_guidance": <integer 0-15>,
    "scoped_rules": <integer 0-10>,
    "skills": <integer 0-10>,
    "specialized_agents": <integer 0-10>,
    "tool_manifests_mcp": <integer 0-10>,
    "validation_reproducibility": <integer 0-10>,
    "ci_pr_automation": <integer 0-10>,
    "security_sandboxing_hooks": <integer 0-10>,
    "domain_context": <integer 0-5>,
    "governance_observability": <integer 0-5>,
    "versioning_provenance": <integer 0-3>,
    "onboarding_discoverability": <integer 0-2>
  },
  "qualityFlags": [<strings>],
  "riskFlags": [<strings>],
  "recommendations": [<strings>]
}

Text to convert:
${raw}`;
}
