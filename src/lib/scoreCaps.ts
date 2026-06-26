import { CATEGORY_MAX, bandForScore } from './types';
import type { AppliedScoreCap, CategoryScores, ScoreResult } from './types';
import type { EvidenceInventory } from './scanner';
import type { RubricDefinition } from './rubricSchema';

interface ScoreCapRule {
  category: string;
  maxScore: number;
  reason: string;
  applies: (evidence: EvidenceInventory) => boolean;
}

export const SCORE_CAP_RULES: ScoreCapRule[] = [
  {
    category: 'skills',
    maxScore: 4,
    reason: 'No formal SKILL.md files found; adjacent workflow docs can earn only partial Skills credit',
    applies: evidence => !evidence.hasFormalSkills
  },
  {
    category: 'ci_pr_automation',
    maxScore: 3,
    reason: 'No GitHub Actions workflow files found',
    applies: evidence => !evidence.hasCiWorkflow
  },
  {
    category: 'ci_pr_automation',
    maxScore: 6,
    reason: 'CI workflows exist but are not triggered by push or pull_request',
    applies: evidence => evidence.hasManualOnlyCi
  },
  {
    category: 'tool_manifests_mcp',
    maxScore: 5,
    reason: 'No MCP or explicit tool manifest files found',
    applies: evidence => !evidence.hasMcpManifest
  }
];

export function applyEvidenceCaps(result: ScoreResult, evidence: EvidenceInventory, rubricDefinition?: RubricDefinition): ScoreResult {
  const rawCategories = { ...(result.rawCategories ?? result.categories) };
  const categories = { ...result.categories };
  const appliedCaps: AppliedScoreCap[] = [];

  const rules = rubricDefinition
    ? (rubricDefinition.caps ?? []).map(rule => ({
        category: rule.category,
        maxScore: rule.maxScore,
        reason: rule.reason,
        applies: (evidence: EvidenceInventory) => evidenceValue(evidence, rule.when.evidenceField) === rule.when.equals
      }))
    : SCORE_CAP_RULES;

  for (const rule of rules) {
    if (!rule.applies(evidence)) continue;
    const originalScore = categories[rule.category] ?? 0;
    const categoryMax = rubricDefinition?.categoryMax[rule.category] ?? CATEGORY_MAX[rule.category] ?? rule.maxScore;
    const cappedScore = Math.min(originalScore, rule.maxScore, categoryMax);
    if (cappedScore < originalScore) {
      categories[rule.category] = cappedScore;
      appliedCaps.push({
        category: rule.category,
        originalScore,
        cappedScore,
        maxScore: rule.maxScore,
        reason: rule.reason
      });
    }
  }

  const score = Object.values(categories).reduce((sum, value) => sum + (value ?? 0), 0);
  return {
    ...result,
    rawScore: result.rawScore ?? Object.values(rawCategories).reduce((sum, value) => sum + (value ?? 0), 0),
    rawCategories,
    categories,
    appliedCaps,
    score,
    band: rubricDefinition ? rubricDefinition.bandForScore(score) : bandForScore(score)
  };
}

function evidenceValue(evidence: EvidenceInventory, field: string): unknown {
  return (evidence as unknown as Record<string, unknown>)[field];
}
