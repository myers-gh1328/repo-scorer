import { evaluateBandConstraints, maxScoreForBand } from './consistencyChecks';
import type { EvidenceInventory, GuidanceTool } from './scanner';
import type { RubricBandConstraintDefinition, RubricDefinition, RubricProfileDefinition } from './rubricSchema';
import type { CategoryScores, ConsistencyCheckResult, ProfileGuidanceBudget, ProfileScore, ScoreResult } from './types';

export const GUIDANCE_BUDGET_CHECK_ID = 'within_always_on_guidance_budget';

/**
 * Re-weights the final (post-cap) category scores for every rubric profile.
 * Each category contributes the same fraction of its base weight; local
 * profiles also scale persistent guidance by an always-on token budget.
 */
export function computeProfileScores(
	result: ScoreResult,
	evidence: EvidenceInventory,
	rubric: RubricDefinition,
	tool: GuidanceTool = 'generic'
): Record<string, ProfileScore> | undefined {
	if (!rubric.profiles || rubric.profiles.length === 0) return undefined;
	return Object.fromEntries(
		rubric.profiles.map(profile => [profile.key, computeProfileScore(result, evidence, rubric, profile, tool)])
	);
}

function computeProfileScore(
	result: ScoreResult,
	evidence: EvidenceInventory,
	rubric: RubricDefinition,
	profile: RubricProfileDefinition,
	tool: GuidanceTool
): ProfileScore {
	const riskFlags: string[] = [];
	const guidanceBudget = profile.alwaysOnGuidanceTokenBudget
		? measureGuidanceBudget(evidence, tool, profile.alwaysOnGuidanceTokenBudget)
		: undefined;
	if (guidanceBudget && guidanceBudget.estimatedTokens > guidanceBudget.budget * 2) {
		riskFlags.push(
			`Always-on guidance is ~${guidanceBudget.estimatedTokens} tokens, more than twice the ${profile.label} budget of ${guidanceBudget.budget}`
		);
	}

	const categories: CategoryScores = {};
	let exact = 0;
	for (const category of rubric.categories) {
		const weight = profile.weights[category.key] ?? 0;
		const fraction = category.weight > 0 ? (result.categories[category.key] ?? 0) / category.weight : 0;
		const factor = category.key === 'persistent_guidance' && guidanceBudget ? guidanceBudget.factor : 1;
		const value = fraction * factor * weight;
		categories[category.key] = Math.round(value * 10) / 10;
		exact += value;
	}

	const rawScore = Math.round(exact);
	const { finalScore, finalBand, checks } = evaluateBandConstraints(
		rawScore,
		rubric.bandForScore(rawScore),
		evidence,
		rubric,
		profileConstraints(profile, rubric)
	);

	let score = finalScore;
	let band = finalBand;
	const consistencyChecks: ConsistencyCheckResult[] = [...checks];
	if (guidanceBudget) {
		const budgetCheck = guidanceBudgetCheck(guidanceBudget, profile, rubric, band);
		if (budgetCheck) {
			consistencyChecks.push(budgetCheck);
			if (!budgetCheck.passed && budgetCheck.impact.bandCeiling) {
				band = budgetCheck.impact.bandCeiling;
				score = Math.min(score, maxScoreForBand(band, rubric));
			}
		}
	}

	return {
		key: profile.key,
		label: profile.label,
		...(profile.sizeRange ? { sizeRange: profile.sizeRange } : {}),
		score,
		band,
		weights: { ...profile.weights },
		categories,
		...(guidanceBudget ? { guidanceBudget } : {}),
		consistencyChecks,
		riskFlags
	};
}

export function guidanceBudgetFactor(tokens: number, budget: number): number {
	if (tokens <= budget) return 1;
	if (tokens >= budget * 2) return 0.5;
	return 1 - 0.5 * ((tokens - budget) / budget);
}

function measureGuidanceBudget(evidence: EvidenceInventory, tool: GuidanceTool, budget: number): ProfileGuidanceBudget {
	const entry = evidence.alwaysOnGuidanceByTool?.[tool] ?? { files: [], estimatedTokens: 0 };
	return {
		tool,
		files: entry.files,
		estimatedTokens: entry.estimatedTokens,
		budget,
		factor: guidanceBudgetFactor(entry.estimatedTokens, budget),
		withinBudget: entry.estimatedTokens <= budget
	};
}

function profileConstraints(profile: RubricProfileDefinition, rubric: RubricDefinition): RubricBandConstraintDefinition[] {
	const [topBand, nextBand] = bandsHighestFirst(rubric);
	return profile.bandConstraintChecks.flatMap(check => {
		const defined = (rubric.bandConstraints ?? []).filter(constraint => constraint.check === check);
		if (defined.length > 0) return defined;
		if (!topBand || !nextBand) return [];
		return [{
			band: topBand,
			check,
			category: rubric.categories[0].key,
			severity: 'high' as const,
			requirement: `${topBand} requires ${check.replace(/_/g, ' ')}`,
			maxBandOnFailure: nextBand
		}];
	});
}

function guidanceBudgetCheck(
	budget: ProfileGuidanceBudget,
	profile: RubricProfileDefinition,
	rubric: RubricDefinition,
	currentBand: string
): ConsistencyCheckResult | undefined {
	const [topBand, nextBand] = bandsHighestFirst(rubric);
	if (!topBand || !nextBand || currentBand !== topBand) return undefined;
	return {
		id: GUIDANCE_BUDGET_CHECK_ID,
		requirement: `${topBand} for ${profile.label} requires always-on guidance within ~${budget.budget} tokens`,
		severity: 'high',
		passed: budget.withinBudget,
		categories: ['persistent_guidance'],
		evidence: budget.files.length > 0
			? [`~${budget.estimatedTokens} tokens across ${budget.files.join(', ')}`]
			: ['No always-on guidance files found'],
		reason: budget.withinBudget
			? 'Always-on guidance fits the tier budget'
			: 'Always-on guidance exceeds the tier budget',
		impact: budget.withinBudget
			? { warningOnly: true }
			: { bandCeiling: nextBand, scoreCeiling: maxScoreForBand(nextBand, rubric) }
	};
}

function bandsHighestFirst(rubric: RubricDefinition): string[] {
	return [...rubric.bands].sort((a, b) => b.max - a.max).map(band => band.label);
}
