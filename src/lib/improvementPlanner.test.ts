import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import {
	assertImprovementPlanExportAllowed,
	exportImprovementPlanToRepo,
	generateImprovementPlan,
	markImprovementPlanExported,
	parseImprovementPlan
} from './improvementPlanner';
import { callLLM } from './llmClient';
import type { ScoreResult } from './types';

vi.mock('./llmClient', () => ({ callLLM: vi.fn() }));

beforeEach(() => {
	vi.clearAllMocks();
});

describe('assertImprovementPlanExportAllowed', () => {
	it('blocks exports to public or open-source repos', () => {
		expect(() => assertImprovementPlanExportAllowed({
			name: 'LastFMUpload',
			path: '/repos/LastFMUpload',
			visibility: 'public',
			openSource: true
		})).toThrow('PLAN_EXPORT_BLOCKED_PUBLIC_REPO');
	});

	it('allows private repos unless explicitly disabled', () => {
		expect(() => assertImprovementPlanExportAllowed({
			name: 'repo-scorer',
			path: '/repos/repo-scorer',
			visibility: 'private'
		})).not.toThrow();
	});

	it('blocks repos with explicit export opt-out', () => {
		expect(() => assertImprovementPlanExportAllowed({
			name: 'internal-tool',
			path: '/repos/internal-tool',
			allowPlanExport: false
		})).toThrow('PLAN_EXPORT_DISABLED');
	});
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
			validationCommands: ['grep -q "validation" AGENTS.md']
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
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify(validPlan));

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

	it('fails when the model cannot repair invalid output', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callLLM).mockResolvedValue('not valid json');

		await expect(generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			{
				...score,
				recommendations: ['Add portable scoped guidance for this repository']
			},
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		)).rejects.toThrow('PLAN_VALIDATION_FAILED');
	});

	it('keeps Cursor recommendations when Cursor is selected', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify({
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
		vi.mocked(callLLM)
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

		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Validation errors to fix');
		expect(result.prioritizedTasks).toHaveLength(3);
		expect(result.summary).not.toContain('fallback');
		expect(result.repairCount).toBe(1);
	});

	it('includes discovered validation command candidates in the prompt', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		await writeFile(join(repoDir, 'AGENTS.md'), 'Before completion, run dotnet test AiAppTriage.slnx.');
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify(validPlan));

		await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callLLM).mock.calls[0][1]).toContain('VALIDATION COMMAND CANDIDATES');
		expect(vi.mocked(callLLM).mock.calls[0][1]).toContain('dotnet test AiAppTriage.slnx');
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
		vi.mocked(callLLM)
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

		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('src/DefinitelyMissing.cs');
	});

	it('repairs plans that only create agent artifact files', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const agentOnlyPlan = {
			...validPlan,
			prioritizedTasks: validPlan.prioritizedTasks.map((task, index) => ({
				...task,
				targetFiles: [
					index === 0
						? '.agent/rules/backend.md'
						: index === 1
							? '.agent/skills/repo-improvement/SKILL.md'
							: '.agent/agents/verifier.agent.md'
				]
			}))
		};
		vi.mocked(callLLM)
			.mockResolvedValueOnce(JSON.stringify(agentOnlyPlan))
			.mockResolvedValueOnce(JSON.stringify(validPlan));

		await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('should not only create agent artifact files');
	});

	it('repairs plans that only use weak existence validation', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const weakValidationPlan = {
			...validPlan,
			prioritizedTasks: validPlan.prioritizedTasks.map(task => ({
				...task,
				validationCommands: task.targetFiles.map(file => `test -f ${file}`)
			}))
		};
		vi.mocked(callLLM)
			.mockResolvedValueOnce(JSON.stringify(weakValidationPlan))
			.mockResolvedValueOnce(JSON.stringify(validPlan));

		await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('validationCommands are too weak');
	});

	it('uses one extra retry for quality-only validation failures', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const weakValidationPlan = {
			...validPlan,
			prioritizedTasks: validPlan.prioritizedTasks.map(task => ({
				...task,
				validationCommands: task.targetFiles.map(file => `test -f ${file}`)
			}))
		};
		vi.mocked(callLLM)
			.mockResolvedValueOnce(JSON.stringify(weakValidationPlan))
			.mockResolvedValueOnce(JSON.stringify(weakValidationPlan))
			.mockResolvedValueOnce(JSON.stringify(validPlan));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(3);
		expect(result.repairCount).toBe(2);
		expect(result.qualityWarnings).toEqual(expect.arrayContaining([
			expect.stringContaining('validationCommands are too weak')
		]));
	});

	it('allows planned parent directories and generic SKILL.md wording', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		await mkdir(join(repoDir, 'src', 'lib'), { recursive: true });
		await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guidance');
		const directoryReferencePlan = {
			...validPlan,
			prioritizedTasks: [
				{
					...validPlan.prioritizedTasks[0],
					targetFiles: ['.agent/rules/repo-guidance.md'],
					instructions: 'Create .agent/rules repo guidance for this SvelteKit app, covering src/lib scoring modules and validation commands agents should run before completion.',
					validationCommands: ['test -f .agent/rules/repo-guidance.md']
				},
				{
					...validPlan.prioritizedTasks[1],
					instructions: 'Create a reusable repo-improvement skill package. The SKILL.md should explain how to inspect scores, update docs, and validate changes for this repository.'
				},
				validPlan.prioritizedTasks[2]
			]
		};
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify(directoryReferencePlan));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(result.prioritizedTasks[0].targetFiles[0]).toBe('.agent/rules/repo-guidance.md');
		expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(1);
	});

	it('allows planned target parent directory references with sentence punctuation', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const planWithPlannedPathReferences = {
			...validPlan,
			prioritizedTasks: [{
				...validPlan.prioritizedTasks[1],
				targetFiles: ['source/docs/agent-handoff.md'],
				instructions: 'Create source/docs/agent-handoff.md under source/docs. Include a concise handoff checklist that tells agents which repo files to inspect before changing implementation code.',
				validationCommands: ['test -f source/docs/agent-handoff.md']
			}, validPlan.prioritizedTasks[0], validPlan.prioritizedTasks[2]]
		};
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify(planWithPlannedPathReferences));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(result.prioritizedTasks[0].targetFiles[0]).toBe('source/docs/agent-handoff.md');
		expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(1);
	});

	it('allows references to planned target basenames except generic SKILL.md', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		const planWithBasenameReferences = {
			...validPlan,
			prioritizedTasks: [{
				...validPlan.prioritizedTasks[0],
				targetFiles: ['.agent/rules/core-conventions.md'],
				instructions: 'Create .agent/rules/core-conventions.md and make core-conventions.md describe concrete repo conventions, validation commands, and ownership boundaries for agents.',
				validationCommands: ['grep -q "Core" .agent/rules/core-conventions.md']
			}, validPlan.prioritizedTasks[1], validPlan.prioritizedTasks[2]]
		};
		vi.mocked(callLLM).mockResolvedValue(JSON.stringify(planWithBasenameReferences));

		const result = await generateImprovementPlan(
			'repo-scorer',
			repoDir,
			'rubric',
			score,
			{ baseUrl: 'http://localhost:8080' },
			join(outDir, 'improvement-plans.json')
		);

		expect(result.prioritizedTasks[0].targetFiles[0]).toBe('.agent/rules/core-conventions.md');
		expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(1);
	});

	it('includes repository inventory in repair prompts', async () => {
		const repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plan-'));
		const outDir = await mkdtemp(join(tmpdir(), 'repo-scorer-plans-'));
		await mkdir(join(repoDir, 'src', 'lib'), { recursive: true });
		await writeFile(join(repoDir, 'src', 'lib', 'scorer.ts'), 'export const score = 1;');
		const invalidReferencePlan = {
			...validPlan,
			prioritizedTasks: [{
				...validPlan.prioritizedTasks[0],
				instructions: 'Update src/MissingThing.ts with repo-specific guidance, then compare it with src/lib/scorer.ts to keep the implementation consistent.'
			}, ...validPlan.prioritizedTasks.slice(1)]
		};
		vi.mocked(callLLM)
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

		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Repository path inventory');
		expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('src/lib/scorer.ts');
	});
});
