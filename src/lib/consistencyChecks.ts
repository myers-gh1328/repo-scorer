import type { EvidenceInventory } from './scanner';
import type { RubricBandConstraintDefinition, RubricDefinition } from './rubricSchema';
import type { ConsistencyCheckResult, ScoreResult } from './types';

type CheckEvaluator = (evidence: EvidenceInventory) => { passed: boolean; evidence: string[]; reason: string };
type ConsistencyCheckId = typeof CONSISTENCY_CHECK_IDS[number];

export const CONSISTENCY_CHECK_IDS = [
	'has_agent_context_review_cadence',
	'has_reproducibility_evidence',
	'has_agent_asset_ci_checks',
	'has_sandbox_or_deny_controls',
	'has_tool_access_governance'
] as const;

const CHECKS: Record<ConsistencyCheckId, CheckEvaluator> = {
	has_agent_context_review_cadence(evidence) {
		const paths = [
			...evidence.agentDocs,
			...evidence.guidanceFiles,
			...evidence.recipeLikeDocs
		];
		const matches = paths.filter(path => /review|owner|governance|context|agent/i.test(path));
		return {
			passed: matches.length > 0,
			evidence: matches.length > 0 ? matches : ['No scanned agent governance, owner, or review-cadence document path found'],
			reason: matches.length > 0
				? 'Agent-context ownership or review-cadence evidence was found'
				: 'Mature requires documented ownership or review cadence for agent-context assets'
		};
	},
	has_reproducibility_evidence(evidence) {
		const matches = [
			...evidence.lockfiles,
			...evidence.workflowFiles.filter(path => /ci|build|test/i.test(path))
		];
		return {
			passed: matches.length > 0,
			evidence: matches.length > 0 ? matches : ['No lockfile or CI/build workflow evidence found'],
			reason: matches.length > 0
				? 'Reproducibility evidence was found'
				: 'Mature requires deterministic build/test environment evidence'
		};
	},
	has_agent_asset_ci_checks(evidence) {
		const matches = evidence.workflowFiles.filter(path => /agent|claude|copilot|prompt|skill|rule|ci|pr-check/i.test(path));
		return {
			passed: evidence.hasPushOrPrCi && matches.length > 0,
			evidence: matches.length > 0 ? matches : ['No push/PR CI workflow evidence for agent assets found'],
			reason: evidence.hasPushOrPrCi && matches.length > 0
				? 'Push/PR CI evidence was found'
				: 'Mature requires CI evidence for normal and agent-related assets'
		};
	},
	has_sandbox_or_deny_controls(evidence) {
		const matches = evidence.hookFiles;
		return {
			passed: evidence.hasHooks && !evidence.hasExternalUnversionedHookReference,
			evidence: matches.length > 0 ? matches : ['No hook, sandbox, or deny-control evidence found'],
			reason: evidence.hasHooks
				? 'Versioned hook/control evidence was found'
				: 'Mature requires deterministic safety controls such as hooks, deny rules, or sandbox defaults'
		};
	},
	has_tool_access_governance(evidence) {
		const matches = evidence.mcpManifestFiles;
		return {
			passed: evidence.hasMcpManifest,
			evidence: matches.length > 0 ? matches : ['No MCP/tool manifest evidence found'],
			reason: evidence.hasMcpManifest
				? 'Tool manifest evidence was found'
				: 'Mature requires governed tool access evidence when evaluating agentic tooling maturity'
		};
	}
};

export function applyConsistencyChecks(
	result: ScoreResult,
	evidence: EvidenceInventory,
	rubric: RubricDefinition
): ScoreResult {
	const cappedScore = result.cappedScore ?? result.score;
	const cappedBand = result.cappedBand ?? rubric.bandForScore(cappedScore);
	const constraints = rubric.bandConstraints ?? [];
	if (constraints.length === 0) {
		return withScoreStages(result, rubric, cappedScore, cappedBand, cappedScore, cappedBand, []);
	}

	let finalBand = cappedBand;
	const checks: ConsistencyCheckResult[] = [];
	const evaluatedBands = new Set<string>();

	while (!evaluatedBands.has(finalBand)) {
		evaluatedBands.add(finalBand);
		const bandChecks = constraints
			.filter(constraint => constraint.band === finalBand)
			.map(constraint => evaluateConstraint(constraint, evidence, rubric));
		checks.push(...bandChecks);
		const failedCeilings = bandChecks
			.filter(check => !check.passed && check.impact.bandCeiling)
			.map(check => check.impact.bandCeiling as string);
		const nextBand = mostRestrictiveBand([finalBand, ...failedCeilings], rubric);
		if (nextBand === finalBand) break;
		finalBand = nextBand;
	}

	const finalScore = Math.min(cappedScore, maxScoreForBand(finalBand, rubric));

	return withScoreStages(result, rubric, cappedScore, cappedBand, finalScore, finalBand, checks);
}

function evaluateConstraint(
	constraint: RubricBandConstraintDefinition,
	evidence: EvidenceInventory,
	rubric: RubricDefinition
): ConsistencyCheckResult {
	const evaluator = isConsistencyCheckId(constraint.check) ? CHECKS[constraint.check] : undefined;
	const evaluated = evaluator
		? evaluator(evidence)
		: {
			passed: false,
			evidence: [`No deterministic evaluator registered for "${constraint.check}"`],
			reason: `Unknown consistency check "${constraint.check}"`
		};
	const scoreCeiling = maxScoreForBand(constraint.maxBandOnFailure, rubric);
	return {
		id: constraint.check,
		requirement: constraint.requirement,
		severity: constraint.severity,
		passed: evaluated.passed,
		categories: [constraint.category],
		evidence: evaluated.evidence,
		reason: evaluated.reason,
		impact: evaluated.passed
			? { warningOnly: true }
			: { bandCeiling: constraint.maxBandOnFailure, scoreCeiling }
	};
}

function isConsistencyCheckId(value: string): value is ConsistencyCheckId {
	return (CONSISTENCY_CHECK_IDS as readonly string[]).includes(value);
}

function withScoreStages(
	result: ScoreResult,
	rubric: RubricDefinition,
	cappedScore: number,
	cappedBand: string,
	finalScore: number,
	finalBand: string,
	checks: ConsistencyCheckResult[]
): ScoreResult {
	const modelScore = result.modelScore ?? result.rawScore ?? result.score;
	const modelBand = result.modelBand ?? rubric.bandForScore(modelScore);
	return {
		...result,
		resultVersion: result.resultVersion ?? 2,
		rubricVersion: result.rubricVersion ?? rubric.version,
		modelScore,
		modelBand,
		cappedScore,
		cappedBand,
		finalScore,
		finalBand,
		score: finalScore,
		band: finalBand,
		consistencyChecks: checks
	};
}

function mostRestrictiveBand(labels: string[], rubric: RubricDefinition): string {
	const ranked = labels
		.map(label => rubric.bands.find(band => band.label === label))
		.filter((band): band is NonNullable<typeof band> => Boolean(band))
		.sort((a, b) => a.max - b.max);
	return ranked[0]?.label ?? labels[0] ?? rubric.bands[0]?.label ?? 'Unknown';
}

function maxScoreForBand(label: string, rubric: RubricDefinition): number {
	const band = rubric.bands.find(band => band.label === label);
	return band?.max ?? rubric.totalScore;
}
