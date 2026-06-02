import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import {
	exportImprovementPlanToRepo,
	generateImprovementPlan,
	markImprovementPlanExported,
	parseImprovementPlan
} from './improvementPlanner';
import { callMLX } from './mlxClient';
import type { ScoreResult } from './types';

vi.mock('./mlxClient', () => ({ callMLX: vi.fn() }));

beforeEach(() => {
	vi.clearAllMocks();
});

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

const validPlan = {
	...plan,
	summary: 'Add portable agent guidance, workflow instructions, and validation checks so coding agents can improve the repository safely.',
	prioritizedTasks: [
		{
			title: 'Add scoped Cursor rules',
			category: 'scoped_rules',
			impact: 'high',
			effort: 'medium',
			targetFiles: ['.cursor/rules/backend.mdc'],
			instructions: 'Create backend-specific agent rules for service code, including repo conventions, ownership boundaries, and exact checks agents should run before completion.',
			acceptanceCriteria: ['Rules are path-scoped to backend code', 'Rules include validation commands'],
			validationCommands: ['test -f .agent/rules/backend.md']
		},
		{
			title: 'Add reusable improvement skill',
			category: 'skills',
			impact: 'high',
			effort: 'medium',
			targetFiles: ['.agent/skills/repo-improvement/SKILL.md'],
			instructions: 'Create a reusable skill that explains how agents should apply repo maturity improvements in small batches with evidence and validation.',
			acceptanceCriteria: ['Skill file exists', 'Skill includes step-by-step workflow instructions'],
			validationCommands: ['test -f .agent/skills/repo-improvement/SKILL.md']
		},
		{
			title: 'Document validation workflow',
			category: 'validation_reproducibility',
			impact: 'medium',
			effort: 'low',
			targetFiles: ['AGENTS.md'],
			instructions: 'Update the repo guidance with the exact commands agents should run before reporting maturity-improvement changes as complete.',
			acceptanceCriteria: ['AGENTS.md lists validation commands', 'Guidance explains when to run each command'],
			validationCommands: ['test -f AGENTS.md']
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

	it('accepts tasks under a tasks key', () => {
		const result = parseImprovementPlan(JSON.stringify({
			summary: 'Use alternate task key.',
			tasks: plan.prioritizedTasks
		}), 'repo-scorer', score);

		expect(result.prioritizedTasks).toHaveLength(1);
	});

	it('marks a stored plan as exported', async () => {
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const plansPath = join(outDir, 'improvement-plans.json');
		const parsed = parseImprovementPlan(JSON.stringify(plan), 'repo-scorer', score);
		await writeFile(plansPath, JSON.stringify({ 'repo-scorer': parsed }));

		const updated = await markImprovementPlanExported(plansPath, 'repo-scorer', {
			planPath: '.agent/improvement-plan.md',
			agentsPath: 'AGENTS.md'
		});

		expect(updated.exportedAt).toBeTruthy();
		expect(updated.exportedPlanPath).toBe('.agent/improvement-plan.md');
		expect(updated.exportedAgentsPath).toBe('AGENTS.md');
	});
});

describe('exportImprovementPlanToRepo', () => {
	it('writes the plan and an AGENTS.md pointer into the target repo', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-export-'));
		const parsed = parseImprovementPlan(JSON.stringify(plan), 'repo-scorer', score);

		const result = await exportImprovementPlanToRepo(repoDir, parsed);

		expect(result.planPath).toBe('.agent/improvement-plan.md');
		expect(await readFile(join(repoDir, '.agent', 'improvement-plan.md'), 'utf-8'))
			.toContain('You are an AI coding agent working in this repository');
		expect(await readFile(join(repoDir, 'AGENTS.md'), 'utf-8'))
			.toContain('.agent/improvement-plan.md');
	});

	it('does not duplicate the AGENTS.md pointer', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-export-'));
		await mkdir(join(repoDir, '.git'));
		await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide\n');
		const parsed = parseImprovementPlan(JSON.stringify(plan), 'repo-scorer', score);

		await exportImprovementPlanToRepo(repoDir, parsed);
		await exportImprovementPlanToRepo(repoDir, parsed);

		const content = await readFile(join(repoDir, 'AGENTS.md'), 'utf-8');
		expect(content.match(/\.agent\/improvement-plan\.md/g)?.length).toBe(1);
	});
});

describe('generateImprovementPlan', () => {
	it('rewrites vendor-specific recommendations to generic files by default', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callMLX).mockResolvedValue(JSON.stringify(validPlan));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(result.prioritizedTasks[0].title).not.toContain('Cursor');
		expect(result.prioritizedTasks[0].targetFiles[0]).toBe('.agent/rules/backend.md');
	});

	it('falls back to score recommendations when the model cannot repair its output', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callMLX).mockResolvedValue('not valid json');

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			{
				...score,
				recommendations: ['Add portable scoped guidance for this repository']
			},
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(result.summary).toContain('fallback improvement plan');
		expect(result.prioritizedTasks[0].instructions).toContain('Add portable scoped guidance');
	});

	it('keeps Cursor recommendations when Cursor is selected', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callMLX).mockResolvedValue(JSON.stringify({
			...validPlan,
			prioritizedTasks: [{
				...validPlan.prioritizedTasks[0],
				targetFiles: ['.agent/rules/backend.md']
			}, ...validPlan.prioritizedTasks.slice(1)]
		}));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json'),
			'cursor'
		);

		expect(result.prioritizedTasks[0].targetFiles[0]).toBe('.cursor/rules/backend.mdc');
	});

	it('repairs parsed plans that fail validation before falling back', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callMLX)
			.mockResolvedValueOnce(JSON.stringify(plan))
			.mockResolvedValueOnce(JSON.stringify(validPlan));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callMLX).mock.calls[1][1]).toContain('Validation errors to fix');
		expect(result.prioritizedTasks).toHaveLength(3);
		expect(result.summary).not.toContain('fallback improvement plan');
	});

	it('repairs plans that reference nonexistent repo paths', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		await mkdir(join(repoDir, 'src'), { recursive: true });
		await writeFile(join(repoDir, 'src', 'RealFile.cs'), 'class RealFile {}');
		const invalidReferencePlan = {
			...validPlan,
			prioritizedTasks: [{
				...validPlan.prioritizedTasks[0],
				instructions: 'Update src/DefinitelyMissing.cs with concrete agent-facing guidance, then compare it against src/RealFile.cs so the implementation follows existing conventions.'
			}, ...validPlan.prioritizedTasks.slice(1)]
		};
		vi.mocked(callMLX)
			.mockResolvedValueOnce(JSON.stringify(invalidReferencePlan))
			.mockResolvedValueOnce(JSON.stringify(validPlan));

		await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callMLX).mock.calls[1][1]).toContain('src/DefinitelyMissing.cs');
	});
});
