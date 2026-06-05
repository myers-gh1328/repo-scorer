import { CATEGORY_MAX, bandForScore } from './types';
import type { AppliedScoreCap, CategoryScores, ScoreResult } from './types';
import type { EvidenceInventory } from './scanner';

interface ScoreCapRule {
  category: keyof CategoryScores;
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

export function applyEvidenceCaps(result: ScoreResult, evidence: EvidenceInventory): ScoreResult {
  const rawCategories = { ...(result.rawCategories ?? result.categories) };
  const categories = { ...result.categories };
  const appliedCaps: AppliedScoreCap[] = [];

  for (const rule of SCORE_CAP_RULES) {
    if (!rule.applies(evidence)) continue;
    const originalScore = categories[rule.category];
    const cappedScore = Math.min(originalScore, rule.maxScore, CATEGORY_MAX[rule.category]);
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

  const score = Object.values(categories).reduce((sum, value) => sum + value, 0);
  return {
    ...result,
    rawScore: result.rawScore ?? Object.values(rawCategories).reduce((sum, value) => sum + value, 0),
    rawCategories,
    categories,
    appliedCaps,
    score,
    band: bandForScore(score)
  };
}
