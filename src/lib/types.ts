import type { GuidanceLevel } from './rubricGuidance';
export interface RepoConfig {
  name: string;
  path: string;
  visibility?: 'private' | 'public';
  openSource?: boolean;
  allowPlanExport?: boolean;
}

export type CategoryScores = Record<string, number>;

export interface StructuredGap {
  description: string;
  severity?: 'blocking' | 'high' | 'medium' | 'low';
  evidenceNeeded?: string[];
}

export interface CategoryRationale {
  score: number;
  evidence: string[];
  gaps: string[];
  structuredGaps?: StructuredGap[];
}

export type CategoryRationales = Record<string, CategoryRationale | undefined>;

export interface AppliedScoreCap {
  category: string;
  originalScore: number;
  cappedScore: number;
  maxScore: number;
  reason: string;
}

export type ConsistencySeverity = 'blocking' | 'high' | 'medium' | 'low';

export interface ConsistencyCheckImpact {
  bandCeiling?: HealthBand;
  scoreCeiling?: number;
  warningOnly?: boolean;
}

export interface ConsistencyCheckResult {
  id: string;
  requirement: string;
  severity: ConsistencySeverity;
  passed: boolean;
  categories: string[];
  evidence: string[];
  reason: string;
  impact: ConsistencyCheckImpact;
}

// Base weights match the rubric v2.x cloud profile (rubric.schema.json).
export const CATEGORY_MAX: Record<string, number> = {
  persistent_guidance: 12,
  scoped_rules: 8,
  skills: 10,
  specialized_agents: 6,
  tool_manifests_mcp: 6,
  validation_reproducibility: 15,
  ci_pr_automation: 10,
  security_sandboxing_hooks: 12,
  domain_context: 8,
  governance_observability: 7,
  versioning_provenance: 3,
  onboarding_discoverability: 3
};

export const CATEGORY_LABELS: Record<string, string> = {
  persistent_guidance: 'Persistent Guidance',
  scoped_rules: 'Scoped Rules',
  skills: 'Skills',
  specialized_agents: 'Specialized Agents',
  tool_manifests_mcp: 'Tool Manifests / MCP',
  validation_reproducibility: 'Validation & Reproducibility',
  ci_pr_automation: 'CI & PR Automation',
  security_sandboxing_hooks: 'Security, Sandboxing & Hooks',
  domain_context: 'Domain Context',
  governance_observability: 'Governance & Observability',
  versioning_provenance: 'Versioning & Provenance',
  onboarding_discoverability: 'Onboarding & Discoverability'
};

export type HealthBand = string;

export const LOCAL_MODEL_TIERS = ['tiny', 'small', 'medium'] as const;
export type LocalModelTier = typeof LOCAL_MODEL_TIERS[number];
export const DEFAULT_LOCAL_MODEL_TIER: LocalModelTier = 'medium';

export function localProfileKey(tier: LocalModelTier): string {
  return `local-${tier}`;
}

export interface ProfileGuidanceBudget {
  tool: string;
  files: string[];
  estimatedTokens: number;
  budget: number;
  factor: number;
  withinBudget: boolean;
}

export interface ProfileScore {
  key: string;
  label: string;
  sizeRange?: string;
  score: number;
  band: HealthBand;
  weights: CategoryScores;
  categories: CategoryScores;
  guidanceBudget?: ProfileGuidanceBudget;
  consistencyChecks: ConsistencyCheckResult[];
  riskFlags: string[];
}

export interface ScoreResult {
  evaluationMode?: EvaluationMode;
  resultVersion?: number;
  rubricVersion?: string;
  scannerEvidenceVersion?: string;
  referenceDataVersion?: string;
  referenceDataLastUpdated?: string;
  scoredAt: string;
  modelScore?: number;
  cappedScore?: number;
  finalScore?: number;
  modelBand?: HealthBand;
  cappedBand?: HealthBand;
  finalBand?: HealthBand;
  score: number;
  rawScore?: number;
  band: HealthBand;
  primaryLanguage: string;
  rawCategories?: CategoryScores;
  categories: CategoryScores;
  categoryRationales?: CategoryRationales;
  appliedCaps?: AppliedScoreCap[];
  consistencyChecks?: ConsistencyCheckResult[];
  profileScores?: Record<string, ProfileScore>;
  /** How much rubric text each category prompt carried, and why. Absent before rubric v2.1. */
  promptContext?: PromptContext;
  qualityFlags: string[];
  riskFlags: string[];
  recommendations: string[];
}

export interface ScoresStore {
  [repoName: string]: ScoreResult;
}

export interface ScoreHistoryEntry {
  evaluationMode?: EvaluationMode;
  scoredAt: string;
  rubricVersion?: string;
  resultVersion?: number;
  modelScore?: number;
  cappedScore?: number;
  finalScore: number;
  finalBand: HealthBand;
  categories: Record<string, number>;
  appliedCapCount: number;
  failedConsistencyCheckCount: number;
}

export interface RepoScoreHistory {
  compact: ScoreHistoryEntry[];
  full: ScoreResult[];
}

export interface ScoreHistoryStore {
  [repoName: string]: RepoScoreHistory;
}

export interface ImprovementTask {
  title: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  targetFiles: string[];
  instructions: string;
  acceptanceCriteria: string[];
  validationCommands: string[];
}

export interface ImprovementPlan {
  evaluationMode?: EvaluationMode;
  generatedAt: string;
  exportedAt?: string;
  exportedPlanPath?: string;
  exportedAgentsPath?: string;
  sourceRepoPath?: string;
  repairCount?: number;
  qualityWarnings?: string[];
  repoName: string;
  summary: string;
  currentScore: number;
  currentBand: HealthBand;
  strongestCategories: string[];
  weakestCategories: string[];
  prioritizedTasks: ImprovementTask[];
  markdown: string;
  /** Rubric guidance level the plan prompt used (levels.plan). */
  promptContext?: PromptContext;
}

export interface ImprovementPlansStore {
  [repoName: string]: ImprovementPlan;
}

export interface LLMConfig {
  baseUrl: string;
  model?: string;
  maxTokens?: number;
  responseFormat?: LLMResponseFormat;
  /** Sent as a Bearer token when set (hosted OpenAI-compatible endpoints). */
  apiKey?: string;
  /** Per-attempt request timeout. Defaults to DEFAULT_LLM_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Retries for connection errors and 429/5xx responses. Defaults to DEFAULT_LLM_MAX_RETRIES. */
  maxRetries?: number;
  /** Scoring model's context window. Undefined means unknown: prompts are sent in full. */
  contextTokens?: number;
  contextSource?: ContextWindowSource;
}

export type ContextWindowSource = 'setting' | 'server' | 'catalog' | 'unknown';

export interface PromptContext {
  contextTokens?: number;
  contextSource: ContextWindowSource;
  /** Rubric guidance level used per category (or 'plan' for improvement plans). */
  levels: Record<string, GuidanceLevel>;
  /** Categories whose evidence was trimmed to fit the context window. */
  evidenceTrimmed: string[];
}

export interface LLMResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
  };
}

export type EvaluationMode = 'ai-readiness' | 'maintainability';

export const DEFAULT_EVALUATION_MODE: EvaluationMode = 'ai-readiness';

export function bandForScore(score: number): HealthBand {
  if (score >= 90) return 'Mature';
  if (score >= 75) return 'Managed';
  if (score >= 60) return 'Operational';
  if (score >= 40) return 'Emerging';
  return 'Fragile';
}

export function bandColor(band: HealthBand): string {
  switch (band) {
    case 'Mature':      return '#27ae60';
    case 'Managed':     return '#2ecc71';
    case 'Operational': return '#f39c12';
    case 'Emerging':    return '#e67e22';
    case 'Fragile':     return '#e74c3c';
    case 'Durable':     return '#27ae60';
    case 'Healthy':     return '#2ecc71';
    case 'Serviceable': return '#f39c12';
    case 'Basic':       return '#e67e22';
    case 'Difficult':   return '#e74c3c';
    default:            return '#888';
  }
}
