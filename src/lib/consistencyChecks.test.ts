import { describe, expect, it } from 'vitest';
import { applyConsistencyChecks } from './consistencyChecks';
import type { EvidenceInventory } from './scanner';
import type { RubricDefinition } from './rubricSchema';
import type { CategoryScores, ScoreResult } from './types';

const evidence: EvidenceInventory = {
	guidanceFiles: ['CLAUDE.md'],
	nestedGuidanceFiles: [],
	skillFiles: ['.claude/skills/verify/SKILL.md'],
	recipeLikeDocs: [],
	specializedAgentFiles: ['.claude/agents/security-reviewer.md'],
	workflowFiles: ['.github/workflows/ci.yml'],
	workflowTriggers: ['push', 'pull_request'],
	mcpManifestFiles: [],
	hookFiles: ['.claude/hooks/edit-write-guard.sh'],
	lockfiles: ['package-lock.json'],
	agentDocs: [],
	hasRootGuidance: false,
	hasFormalSkills: true,
	hasSpecializedAgents: true,
	hasCiWorkflow: true,
	hasPushOrPrCi: true,
	hasManualOnlyCi: false,
	hasMcpManifest: false,
	hasHooks: true,
	hasExternalUnversionedHookReference: false
};

const rubric: RubricDefinition = {
	version: 'test',
	totalScore: 100,
	categories: [
		{ key: 'governance_observability', label: 'Governance', weight: 100, evaluate: 'Governance' }
	],
	bands: [
		{ label: 'Managed', min: 0, max: 89 },
		{ label: 'Mature', min: 90, max: 100 }
	],
	caps: [],
	bandConstraints: [
		{
			band: 'Mature',
			check: 'has_agent_context_review_cadence',
			category: 'governance_observability',
			severity: 'high',
			requirement: 'Agent context has documented ownership and review cadence',
			maxBandOnFailure: 'Managed'
		}
	],
	totalWeight: 100,
	categoryMax: { governance_observability: 100 },
	categoryLabels: { governance_observability: 'Governance' },
	bandForScore(score: number) {
		return score >= 90 ? 'Mature' : 'Managed';
	}
};

function result(score = 94): ScoreResult {
	const band = score >= 90 ? 'Mature' : 'Managed';
	return {
		scoredAt: '',
		resultVersion: 2,
		rubricVersion: 'test',
		modelScore: score,
		cappedScore: score,
		finalScore: score,
		modelBand: band,
		cappedBand: band,
		finalBand: band,
		score,
		rawScore: score,
		band,
		primaryLanguage: 'Unknown',
		rawCategories: { governance_observability: score } as unknown as CategoryScores,
		categories: { governance_observability: score } as unknown as CategoryScores,
		appliedCaps: [],
		consistencyChecks: [],
		qualityFlags: [],
		riskFlags: [],
		recommendations: []
	};
}

describe('applyConsistencyChecks', () => {
	it('caps Mature to Managed when a deterministic Mature constraint fails', () => {
		const adjusted = applyConsistencyChecks(result(94), evidence, rubric);

		expect(adjusted.modelScore).toBe(94);
		expect(adjusted.cappedScore).toBe(94);
		expect(adjusted.finalScore).toBe(89);
		expect(adjusted.finalBand).toBe('Managed');
		expect(adjusted.score).toBe(89);
		expect(adjusted.band).toBe('Managed');
		expect(adjusted.consistencyChecks).toContainEqual(expect.objectContaining({
			id: 'has_agent_context_review_cadence',
			passed: false,
			impact: { bandCeiling: 'Managed', scoreCeiling: 89 }
		}));
	});

	it('does not apply Mature constraints when capped score is below Mature', () => {
		const adjusted = applyConsistencyChecks(result(88), evidence, rubric);

		expect(adjusted.finalScore).toBe(88);
		expect(adjusted.finalBand).toBe('Managed');
		expect(adjusted.consistencyChecks).toEqual([]);
	});

	it('passes the review cadence check when equivalent evidence exists', () => {
		const adjusted = applyConsistencyChecks(result(94), {
			...evidence,
			agentDocs: ['docs/agent/context-review.md']
		}, rubric);

		expect(adjusted.finalScore).toBe(94);
		expect(adjusted.finalBand).toBe('Mature');
		expect(adjusted.consistencyChecks).toContainEqual(expect.objectContaining({
			id: 'has_agent_context_review_cadence',
			passed: true
		}));
	});

	it('evaluates constraints for the final band after a higher band is capped', () => {
		const chainedRubric: RubricDefinition = {
			...rubric,
			bands: [
				{ label: 'Emerging', min: 0, max: 59 },
				{ label: 'Managed', min: 60, max: 89 },
				{ label: 'Mature', min: 90, max: 100 }
			],
			bandConstraints: [
				...(rubric.bandConstraints ?? []),
				{
					band: 'Managed',
					check: 'has_tool_access_governance',
					category: 'governance_observability',
					severity: 'high',
					requirement: 'Managed requires governed tool access evidence',
					maxBandOnFailure: 'Emerging'
				}
			],
			bandForScore(score: number) {
				if (score >= 90) return 'Mature';
				if (score >= 60) return 'Managed';
				return 'Emerging';
			}
		};

		const adjusted = applyConsistencyChecks(result(94), evidence, chainedRubric);

		expect(adjusted.finalScore).toBe(59);
		expect(adjusted.finalBand).toBe('Emerging');
		expect(adjusted.consistencyChecks?.map(check => check.id)).toEqual([
			'has_agent_context_review_cadence',
			'has_tool_access_governance'
		]);
	});
});
