import { readFile, writeFile } from 'node:fs/promises';
import { scanRepo } from './scanner';
import { buildCategoryPrompt, buildPrompt } from './promptBuilder';
import { callLLM } from './llmClient';
import { applyEvidenceCaps } from './scoreCaps';
import { applyConsistencyChecks } from './consistencyChecks';
import { computeProfileScores } from './profileScores';
import { updateScoringProgress, withScoreWriteLock } from './server/scoreConcurrency';
import { appendScoreHistory } from './scoreHistory';
import { CATEGORY_MAX, DEFAULT_EVALUATION_MODE, bandForScore } from './types';
import { storage } from './server/storage';
import type { RuntimeSupportMatrix } from './reference/runtimeSupport';
import type { GuidanceTool } from './scanner';
import type { CategoryRationale, CategoryRationales, CategoryScores, EvaluationMode, LLMConfig, LLMResponseFormat, ScoreResult, ScoresStore, StructuredGap } from './types';
import type { RubricCategoryDefinition, RubricDefinition } from './rubricSchema';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX);
const MAX_CATEGORY_EVIDENCE_CHARS = 48_000;

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

  const score = CATEGORY_KEYS.reduce((sum, key) => sum + (categories[key] ?? 0), 0);
  const primaryLanguage = typeof value.primaryLanguage === 'string' && value.primaryLanguage.trim()
    ? value.primaryLanguage.trim()
    : 'Unknown';

  return {
    scoredAt: typeof value.scoredAt === 'string' ? value.scoredAt : '',
    score,
    rawScore: score,
    band: bandForScore(score),
    primaryLanguage,
    rawCategories: { ...categories },
    categories,
    categoryRationales: normalizeCategoryRationales(value.categoryRationales, categories),
    appliedCaps: [],
    qualityFlags: normalizeStringArray(value.qualityFlags),
    riskFlags: normalizeStringArray(value.riskFlags),
    recommendations: normalizeStringArray(value.recommendations)
  };
}

function parseCategoryScore(key: string, value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new Error(`Category "${key}" must be numeric`);
  }
  const rounded = Math.round(numeric);
  return Math.min(Math.max(rounded, 0), CATEGORY_MAX[key] ?? 100);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeCategoryRationales(value: unknown, categories: CategoryScores): CategoryRationales {
  if (!isRecord(value)) return {};
  const rationales: CategoryRationales = {};
  for (const key of CATEGORY_KEYS) {
    const raw = value[key];
    if (!isRecord(raw)) continue;
    rationales[key] = {
      score: parseCategoryScore(key, raw.score ?? categories[key]),
      evidence: normalizeStringArray(raw.evidence),
      gaps: normalizeGapDescriptions(raw.gaps),
      structuredGaps: normalizeStructuredGaps(raw.structuredGaps ?? raw.gaps)
    } satisfies CategoryRationale;
  }
  return rationales;
}

function normalizeGapDescriptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') return item;
      if (isRecord(item) && typeof item.description === 'string') return item.description;
      return '';
    })
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeStructuredGaps(value: unknown): StructuredGap[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') {
        const description = item.trim();
        return description ? { description } : null;
      }
      if (!isRecord(item) || typeof item.description !== 'string') return null;
      const description = item.description.trim();
      if (!description) return null;
      const severity = typeof item.severity === 'string' && ['blocking', 'high', 'medium', 'low'].includes(item.severity)
        ? item.severity as StructuredGap['severity']
        : undefined;
      const evidenceNeeded = normalizeStringArray(item.evidenceNeeded);
      return {
        description,
        ...(severity ? { severity } : {}),
        ...(evidenceNeeded.length > 0 ? { evidenceNeeded } : {})
      };
    })
    .filter((item): item is StructuredGap => Boolean(item));
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
  scoresPath?: string,
  rubricDefinition?: RubricDefinition,
  historyPath?: string,
  evaluationMode: EvaluationMode = DEFAULT_EVALUATION_MODE,
  metadata: Pick<ScoreResult, 'referenceDataVersion' | 'referenceDataLastUpdated' | 'scannerEvidenceVersion'> & { runtimeSupport?: RuntimeSupportMatrix; guidanceTool?: GuidanceTool } = {}
): Promise<ScoreResult> {
  const { runtimeSupport, guidanceTool, ...scoreMetadata } = metadata;
  updateScoringProgress(name, {
    evaluationMode,
    phase: 'scan',
    phaseLabel: 'Scanning repository',
    currentStep: 0,
    totalSteps: rubricDefinition ? rubricDefinition.categories.length + 4 : 4
  });
  const scan = await scanRepo(repoPath, runtimeSupport, { duplication: evaluationMode === 'maintainability' });
  if (rubricDefinition) {
    let result = await scoreRepoByCategory(rubricDefinition, rubric, scan, llmConfig, name, evaluationMode);
    updateScoringProgress(name, {
      evaluationMode,
      phase: 'caps',
      phaseLabel: 'Applying deterministic evidence caps',
      currentStep: rubricDefinition.categories.length + 1,
      totalSteps: rubricDefinition.categories.length + 4
    });
    result = applyEvidenceCaps(result, scan.evidence, rubricDefinition);
    result.cappedScore = result.score;
    result.cappedBand = rubricDefinition.bandForScore(result.cappedScore);
    updateScoringProgress(name, {
      evaluationMode,
      phase: 'consistency',
      phaseLabel: 'Checking band consistency constraints',
      currentStep: rubricDefinition.categories.length + 2,
      totalSteps: rubricDefinition.categories.length + 4
    });
    result = applyConsistencyChecks(result, scan.evidence, rubricDefinition);
    const profileScores = computeProfileScores(result, scan.evidence, rubricDefinition, guidanceTool);
    if (profileScores) {
      result = { ...result, resultVersion: 3, profileScores };
    }
    result = { ...result, ...scoreMetadata };
    result.scoredAt = new Date().toISOString();
    updateScoringProgress(name, {
      evaluationMode,
      phase: 'persist',
      phaseLabel: 'Persisting score and history',
      currentStep: rubricDefinition.categories.length + 3,
      totalSteps: rubricDefinition.categories.length + 4
    });
    await persistScore(scoresPath, name, result, historyPath, evaluationMode);
    updateScoringProgress(name, {
      evaluationMode,
      phase: 'complete',
      phaseLabel: 'Scoring complete',
      currentStep: rubricDefinition.categories.length + 4,
      totalSteps: rubricDefinition.categories.length + 4
    });
    return result;
  }

  const prompt = buildPrompt(rubric, scan, evaluationMode);

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

  result = applyEvidenceCaps(result, scan.evidence);
  result = { ...result, ...scoreMetadata };
  result.scoredAt = new Date().toISOString();

  updateScoringProgress(name, {
    evaluationMode,
    phase: 'persist',
    phaseLabel: 'Persisting score and history',
    currentStep: 3,
    totalSteps: 4
  });
  result.evaluationMode = evaluationMode;
  await persistScore(scoresPath, name, result, historyPath, evaluationMode);
  updateScoringProgress(name, {
    evaluationMode,
    phase: 'complete',
    phaseLabel: 'Scoring complete',
    currentStep: 4,
    totalSteps: 4
  });

  return result;
}

async function persistScore(scoresPath: string | undefined, name: string, result: ScoreResult, historyPath?: string, evaluationMode: EvaluationMode = DEFAULT_EVALUATION_MODE): Promise<void> {
  if (!scoresPath) {
    storage().saveScoreWithHistory(name, result, evaluationMode);
    return;
  }
  await withScoreWriteLock(async () => {
    let scores: ScoresStore = {};
    try {
      scores = JSON.parse(await readFile(scoresPath, 'utf-8'));
    } catch {
      // file missing or corrupt — start fresh
    }
    scores[name] = { ...result, evaluationMode };
    await writeFile(scoresPath, JSON.stringify(scores, null, 2));
  });
  if (historyPath) {
    await appendScoreHistory(historyPath, name, { ...result, evaluationMode });
  }
}

async function scoreRepoByCategory(
  rubricDefinition: RubricDefinition,
  rubric: string,
  scan: Awaited<ReturnType<typeof scanRepo>>,
  llmConfig: LLMConfig,
  repoName: string,
  evaluationMode: EvaluationMode
): Promise<ScoreResult> {
  const categories = {} as CategoryScores;
  const categoryRationales: CategoryRationales = {};

  for (const [index, category] of rubricDefinition.categories.entries()) {
    updateScoringProgress(repoName, {
      evaluationMode,
      phase: 'category',
      phaseLabel: `Scoring ${category.label} (${index + 1}/${rubricDefinition.categories.length})`,
      currentStep: index + 1,
      totalSteps: rubricDefinition.categories.length + 4
    });
    const bundle = buildCategoryEvidenceBundle(scan.files, category, scan);
    const prompt = buildCategoryPrompt(rubric, rubricDefinition, category, scan, bundle, evaluationMode);
    const config = {
      ...llmConfig,
      responseFormat: llmConfig.responseFormat ? categoryResponseFormat(category) : undefined
    };
    let raw: string;
    try {
      raw = await callLLM(config, prompt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`LLM_UNREACHABLE: ${msg}`);
    }

    let evaluation = tryParseCategoryEvaluation(raw, category);
    if (!evaluation) {
      let repaired: string;
      try {
        repaired = await callLLM(config, buildCategoryRepairPrompt(raw, category));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`LLM_UNREACHABLE: ${msg}`);
      }
      evaluation = tryParseCategoryEvaluation(repaired, category);
      if (!evaluation) {
        throw new Error('PARSE_FAILED');
      }
    }

    categories[category.key] = evaluation.score;
    categoryRationales[category.key] = evaluation;
  }

  const score = rubricDefinition.categories.reduce((sum, category) => sum + (categories[category.key] ?? 0), 0);
  const rationaleEntries = Object.entries(categoryRationales)
    .filter((entry): entry is [string, CategoryRationale] => Boolean(entry[1]));
  return {
    evaluationMode,
    resultVersion: 2,
    rubricVersion: rubricDefinition.version,
    scoredAt: '',
    modelScore: score,
    cappedScore: score,
    finalScore: score,
    modelBand: rubricDefinition.bandForScore(score),
    cappedBand: rubricDefinition.bandForScore(score),
    finalBand: rubricDefinition.bandForScore(score),
    score,
    rawScore: score,
    band: rubricDefinition.bandForScore(score),
    primaryLanguage: inferPrimaryLanguage(scan.files),
    rawCategories: { ...categories },
    categories,
    categoryRationales,
    appliedCaps: [],
    qualityFlags: rationaleEntries
      .flatMap(([key, rationale]) => rationale.evidence.slice(0, 2).map(item => `${key}: ${item}`))
      .slice(0, 8),
    riskFlags: rationaleEntries
      .flatMap(([key, rationale]) => rationale.gaps.slice(0, 2).map(item => `${key}: ${item}`))
      .slice(0, 8),
    recommendations: rationaleEntries
      .filter(([, rationale]) => rationale.gaps.length > 0)
      .map(([key, rationale]) => `Improve ${key}: ${rationale.gaps[0]}`)
      .slice(0, 8)
  };
}

function buildCategoryEvidenceBundle(files: { relativePath: string; content: string }[], category: RubricCategoryDefinition, scan?: Awaited<ReturnType<typeof scanRepo>>) {
  const sorted = [...files].sort((a, b) => relevanceScore(b, category) - relevanceScore(a, category));
  const includedFiles: { relativePath: string; content: string }[] = [];
  const omittedFiles: string[] = [];
  let totalIncludedChars = 0;

  for (const file of sorted) {
    const remaining = MAX_CATEGORY_EVIDENCE_CHARS - totalIncludedChars;
    if (remaining <= 0) {
      omittedFiles.push(file.relativePath);
      continue;
    }
    if (file.content.length <= remaining) {
      includedFiles.push(file);
      totalIncludedChars += file.content.length;
    } else {
      includedFiles.push({ ...file, content: file.content.slice(0, remaining) });
      totalIncludedChars += remaining;
      omittedFiles.push(file.relativePath);
    }
  }

  return {
    includedFiles,
    omittedFiles: uniqueStrings(omittedFiles),
    evidenceInventory: scan ? buildBoundedEvidenceInventory(scan.evidence, category) : {},
    totalIncludedChars,
    truncated: omittedFiles.length > 0
  };
}

function relevanceScore(file: { relativePath: string; content: string }, category: RubricCategoryDefinition): number {
  const path = file.relativePath.toLowerCase();
  const searchable = `${path}\n${file.content.slice(0, 2000).toLowerCase()}`;
  let score = 0;
  for (const token of tokenize(`${category.key} ${category.label} ${category.scannerSection ?? ''}`)) {
    if (path.includes(token)) score += 3;
    else if (searchable.includes(token)) score += 1;
  }
  if (/agents?\.md|claude\.md|gemini\.md|copilot-instructions/.test(path)) score += 1;
  return score;
}

function buildBoundedEvidenceInventory(evidence: object, category: RubricCategoryDefinition): Record<string, unknown> {
  const relevantTokens = tokenize(`${category.key} ${category.label} ${category.scannerSection ?? ''}`);
  const entries = Object.entries(evidence)
    .map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value] as const;
      const sorted = [...value]
        .filter((item): item is string => typeof item === 'string')
        .sort((a, b) => inventoryRelevance(b, key, relevantTokens) - inventoryRelevance(a, key, relevantTokens));
      return [key, sorted.slice(0, 40)] as const;
    });
  return Object.fromEntries(entries);
}

function inventoryRelevance(value: string, key: string, tokens: string[]): number {
  const haystack = `${key} ${value}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function tokenize(value: string): string[] {
  return uniqueStrings(value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2));
}

interface CategoryEvaluation extends CategoryRationale {
  score: number;
}

function tryParseCategoryEvaluation(raw: string, category: RubricCategoryDefinition): CategoryEvaluation | null {
  try {
    return parseCategoryEvaluation(raw, category);
  } catch {
    return null;
  }
}

function parseCategoryEvaluation(raw: string, category: RubricCategoryDefinition): CategoryEvaluation {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    extractJsonObject(trimmed)
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!isRecord(parsed)) throw new Error('Category evaluation must be an object');
      return {
        score: parseDynamicScore(category.key, category.weight, parsed.score),
        evidence: normalizeStringArray(parsed.evidence),
        gaps: normalizeGapDescriptions(parsed.gaps),
        structuredGaps: normalizeStructuredGaps(parsed.structuredGaps ?? parsed.gaps)
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Invalid category evaluation JSON');
}

function parseDynamicScore(key: string, maxScore: number, value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new Error(`Category "${key}" must be numeric`);
  }
  return Math.min(Math.max(Math.round(numeric), 0), maxScore);
}

function buildCategoryRepairPrompt(raw: string, category: RubricCategoryDefinition): string {
  return `Convert the text below into one valid JSON object for category "${category.key}". Return raw JSON only, no markdown.

Required schema:
{
  "score": <integer 0-${category.weight}>,
  "evidence": [<strings>],
  "gaps": [<strings>],
  "structuredGaps": [{"description": <string>, "severity": <"blocking" | "high" | "medium" | "low">, "evidenceNeeded": [<strings>]}]
}

Text to convert:
${raw}`;
}

function categoryResponseFormat(category: RubricCategoryDefinition): LLMResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: `category_score_${category.key}`,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['score', 'evidence', 'gaps'],
        properties: {
          score: { type: 'integer', minimum: 0, maximum: category.weight },
          evidence: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
          structuredGaps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['description'],
              properties: {
                description: { type: 'string' },
                severity: { type: 'string', enum: ['blocking', 'high', 'medium', 'low'] },
                evidenceNeeded: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  };
}

function inferPrimaryLanguage(files: { relativePath: string }[]): string {
  const paths = files.map(file => file.relativePath.toLowerCase());
  if (paths.some(path => path.endsWith('package.json') || path.endsWith('.ts') || path.endsWith('.tsx'))) return 'TypeScript';
  if (paths.some(path => path.endsWith('.csproj') || path.endsWith('.sln'))) return 'C#';
  if (paths.some(path => path.endsWith('pyproject.toml') || path.endsWith('.py'))) return 'Python';
  if (paths.some(path => path.endsWith('go.mod') || path.endsWith('.go'))) return 'Go';
  if (paths.some(path => path.endsWith('cargo.toml') || path.endsWith('.rs'))) return 'Rust';
  return 'Unknown';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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
${CATEGORY_KEYS.map(key => `    "${key}": <integer 0-${CATEGORY_MAX[key]}>`).join(',\n')}
  },
  "categoryRationales": {
    "<category_key>": {
      "score": <integer matching that category score>,
      "evidence": [<strings citing inventory facts or scanned file paths>],
      "gaps": [<strings describing missing or weak evidence>]
    }
  },
  "qualityFlags": [<strings>],
  "riskFlags": [<strings>],
  "recommendations": [<strings>]
}

Text to convert:
${raw}`;
}
