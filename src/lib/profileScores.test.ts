import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { computeProfileScores, guidanceBudgetFactor, GUIDANCE_BUDGET_CHECK_ID } from './profileScores';
import { applyConsistencyChecks } from './consistencyChecks';
import { loadRubricDefinition, type RubricDefinition } from './rubricSchema';
import type { EvidenceInventory } from './scanner';
import type { ScoreResult } from './types';

async function rubric(): Promise<RubricDefinition> {
	return loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
}

function evidence(guidanceTokens: number, overrides: Partial<EvidenceInventory> = {}): EvidenceInventory {
	const entry = { files: guidanceTokens > 0 ? ['AGENTS.md'] : [], chars: guidanceTokens * 4, estimatedTokens: guidanceTokens };
	return {
		guidanceFiles: ['AGENTS.md'],
		nestedGuidanceFiles: [],
		skillFiles: [],
		recipeLikeDocs: [],
		specializedAgentFiles: [],
		workflowFiles: ['.github/workflows/ci.yml'],
		workflowTriggers: ['push'],
		mcpManifestFiles: [],
		hookFiles: ['.claude/hooks/guard.sh'],
		lockfiles: ['package-lock.json'],
		agentDocs: ['docs/agent/review-cadence.md'],
		hasRootGuidance: true,
		hasFormalSkills: false,
		hasSpecializedAgents: false,
		hasCiWorkflow: true,
		hasPushOrPrCi: true,
		hasManualOnlyCi: false,
		hasMcpManifest: false,
		hasHooks: true,
		hasExternalUnversionedHookReference: false,
		alwaysOnGuidanceByTool: { generic: entry, claude: entry, cursor: entry, copilot: entry, windsurf: entry },
		...overrides
	};
}

function result(def: RubricDefinition, fraction: number): ScoreResult {
	const categories = Object.fromEntries(def.categories.map(category => [category.key, Math.round(category.weight * fraction)]));
	const score = Object.values(categories).reduce((sum, value) => sum + value, 0);
	return {
		scoredAt: '',
		score,
		band: def.bandForScore(score),
		cappedScore: score,
		primaryLanguage: 'TypeScript',
		categories,
		qualityFlags: [],
		riskFlags: [],
		recommendations: []
	};
}

describe('guidanceBudgetFactor', () => {
	it('gives full credit within budget and declines linearly to half at twice the budget', () => {
		expect(guidanceBudgetFactor(0, 1000)).toBe(1);
		expect(guidanceBudgetFactor(1000, 1000)).toBe(1);
		expect(guidanceBudgetFactor(1500, 1000)).toBe(0.75);
		expect(guidanceBudgetFactor(2000, 1000)).toBe(0.5);
		expect(guidanceBudgetFactor(9000, 1000)).toBe(0.5);
	});
});

describe('computeProfileScores', () => {
	it('returns undefined when the rubric has no profiles', async () => {
		const def = await rubric();
		const { profiles: _profiles, ...withoutProfiles } = def;
		expect(computeProfileScores(result(def, 1), evidence(100), withoutProfiles as RubricDefinition)).toBeUndefined();
	});

	it('makes the cloud profile equal the headline score after consistency checks', async () => {
		const def = await rubric();
		for (const fraction of [0.3, 0.7, 1]) {
			const ev = evidence(100);
			const base = applyConsistencyChecks(result(def, fraction), ev, def);
			const profiles = computeProfileScores(base, ev, def)!;
			expect(profiles.cloud.score).toBe(base.score);
			expect(profiles.cloud.band).toBe(base.band);
			expect(profiles.cloud.guidanceBudget).toBeUndefined();
		}
	});

	it('scores every profile out of the same total for a perfect repo within budget', async () => {
		const def = await rubric();
		const profiles = computeProfileScores(result(def, 1), evidence(500), def)!;

		expect(Object.keys(profiles)).toEqual(['cloud', 'local-medium', 'local-small', 'local-tiny']);
		for (const profile of Object.values(profiles)) {
			expect(profile.score).toBe(100);
			expect(profile.band).toBe('Mature');
		}
	});

	it('excludes zero-weight categories and re-weights the rest', async () => {
		const def = await rubric();
		const base = result(def, 1);
		base.categories.specialized_agents = 0;

		const profiles = computeProfileScores(base, evidence(500), def)!;

		expect(profiles['local-tiny'].weights.specialized_agents).toBe(0);
		expect(profiles['local-tiny'].score).toBe(100);
		expect(profiles.cloud.score).toBe(94);
	});

	it('reduces persistent guidance credit and blocks Mature when always-on guidance exceeds the tier budget', async () => {
		const def = await rubric();
		const profiles = computeProfileScores(result(def, 1), evidence(2250), def)!;

		const medium = profiles['local-medium'];
		expect(medium.guidanceBudget).toMatchObject({ estimatedTokens: 2250, budget: 3000, withinBudget: true, factor: 1 });
		expect(medium.score).toBe(100);

		const small = profiles['local-small'];
		expect(small.guidanceBudget).toMatchObject({ budget: 1500, withinBudget: false, factor: 0.75 });
		expect(small.categories.persistent_guidance).toBeCloseTo(15.8, 1);
		expect(small.band).toBe('Managed');
		expect(small.score).toBe(89);
		expect(small.consistencyChecks.find(check => check.id === GUIDANCE_BUDGET_CHECK_ID)?.passed).toBe(false);
		expect(small.riskFlags).toEqual([]);

		const tiny = profiles['local-tiny'];
		expect(tiny.guidanceBudget?.factor).toBe(0.5);
		expect(tiny.categories.persistent_guidance).toBe(11);
		expect(tiny.riskFlags[0]).toContain('more than twice');
	});

	it('uses the configured tooling entry for the budget', async () => {
		const def = await rubric();
		const ev = evidence(100);
		ev.alwaysOnGuidanceByTool!.cursor = { files: ['AGENTS.md', '.cursor/rules/big.mdc'], chars: 20_000, estimatedTokens: 5000 };

		const generic = computeProfileScores(result(def, 1), ev, def, 'generic')!;
		const cursor = computeProfileScores(result(def, 1), ev, def, 'cursor')!;

		expect(generic['local-medium'].guidanceBudget?.withinBudget).toBe(true);
		expect(cursor['local-medium'].guidanceBudget).toMatchObject({ tool: 'cursor', estimatedTokens: 5000, withinBudget: false });
	});

	it('applies only the band constraints listed for local profiles', async () => {
		const def = await rubric();
		const ev = evidence(100, { hasHooks: false, hookFiles: [] });

		const profiles = computeProfileScores(result(def, 1), ev, def)!;

		expect(profiles.cloud.band).toBe('Managed');
		expect(profiles['local-medium'].band).toBe('Mature');
		expect(profiles['local-medium'].consistencyChecks.map(check => check.id)).toEqual([
			'has_reproducibility_evidence',
			GUIDANCE_BUDGET_CHECK_ID
		]);
	});
});
