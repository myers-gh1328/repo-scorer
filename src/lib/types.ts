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

export const CATEGORY_MAX: Record<string, number> = {
  persistent_guidance: 15,
  scoped_rules: 10,
  skills: 10,
  specialized_agents: 10,
  tool_manifests_mcp: 10,
  validation_reproducibility: 10,
  ci_pr_automation: 10,
  security_sandboxing_hooks: 10,
  domain_context: 5,
  governance_observability: 5,
  versioning_provenance: 3,
  onboarding_discoverability: 2
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
}

export interface ImprovementPlansStore {
  [repoName: string]: ImprovementPlan;
}

export interface LLMConfig {
  baseUrl: string;
  model?: string;
  maxTokens?: number;
  responseFormat?: LLMResponseFormat;
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
    default:            return '#888';
  }
}
