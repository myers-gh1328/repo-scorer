import { describe, expect, it } from 'vitest';
import { parseImprovementPlan } from './improvementPlanner';
import type { ScoreResult } from './types';

const score: ScoreResult = {
	scoredAt: '2026-06-02T00:00:00.000Z',
	score: 34,
	band: 'Fragile',
	primaryLanguage: 'TypeScript',
	categories: {
		persistent_guidance: 15,
		scoped_rules: 0,
		skills: 0,
		specialized_agents: 0,
		tool_manifests_mcp: 0,
		validation_reproducibility: 7,
		ci_pr_automation: 0,
		security_sandboxing_hooks: 3,
		domain_context: 5,
		governance_observability: 2,
		versioning_provenance: 0,
		onboarding_discoverability: 2
	},
	qualityFlags: [],
	riskFlags: [],
	recommendations: []
};

const plan = {
	summary: 'Add missing agent workflow assets.',
	strongestCategories: ['persistent_guidance'],
	weakestCategories: ['scoped_rules', 'skills'],
	prioritizedTasks: [
		{
			title: 'Add scoped Cursor rules',
			category: 'scoped_rules',
			impact: 'high',
			effort: 'medium',
			targetFiles: ['.cursor/rules/backend.mdc'],
			instructions: 'Create backend-specific agent rules for service code.',
			acceptanceCriteria: ['Rules are path-scoped', 'Rules include validation commands'],
			validationCommands: ['npm run check']
		}
	]
};

describe('parseImprovementPlan', () => {
	it('normalizes a raw JSON improvement plan', () => {
		const result = parseImprovementPlan(JSON.stringify(plan), 'repo-scorer', score);

		expect(result.repoName).toBe('repo-scorer');
		expect(result.currentScore).toBe(34);
		expect(result.prioritizedTasks[0].category).toBe('scoped_rules');
		expect(result.markdown).toContain('# Repo Improvement Plan: repo-scorer');
		expect(result.markdown).toContain('You are an AI coding agent working in this repository');
		expect(result.markdown).toContain('.cursor/rules/backend.mdc');
	});

	it('extracts fenced JSON', () => {
		const result = parseImprovementPlan(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``, 'repo-scorer', score);
		expect(result.summary).toBe('Add missing agent workflow assets.');
	});

	it('rejects plans without valid tasks', () => {
		expect(() => parseImprovementPlan(JSON.stringify({ summary: 'no tasks' }), 'repo-scorer', score))
			.toThrow('task');
	});
});
