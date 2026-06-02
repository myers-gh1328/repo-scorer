import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanRepo } from './scanner';
import { callMLX } from './mlxClient';
import { CATEGORY_LABELS, CATEGORY_MAX } from './types';
import type { AiTooling } from './server/appSettings';
import type {
	CategoryScores,
	ImprovementPlan,
	ImprovementPlansStore,
	ImprovementTask,
	MLXConfig,
	ScoreResult
} from './types';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];
const IMPACT_VALUES = ['high', 'medium', 'low'] as const;
const EXPORTED_PLAN_PATH = '.agent/improvement-plan.md';
const AGENTS_POINTER = `## Agent Improvement Plan

This repository has a generated agent-facing improvement plan at \`${EXPORTED_PLAN_PATH}\`. Review it before making repo maturity improvements.
`;

export async function generateImprovementPlan(
	repoName: string,
	repoPath: string,
	rubric: string,
	score: ScoreResult,
	mlxConfig: MLXConfig,
	plansPath: string,
	aiTooling: AiTooling = 'generic'
): Promise<ImprovementPlan> {
	const scan = await scanRepo(repoPath);
	const raw = await callPlanModel(mlxConfig, buildImprovementPrompt(repoName, rubric, score, scan.files, aiTooling));
	let plan = prepareGeneratedPlan(tryParseImprovementPlan(raw, repoName, score), aiTooling);
	let validationErrors = plan ? validateImprovementPlan(plan, aiTooling) : ['Response was not valid JSON matching the required plan schema.'];

	if (!plan || validationErrors.length > 0) {
		const repaired = await callPlanModel(mlxConfig, buildRepairPrompt(raw, repoName, score, validationErrors, aiTooling));
		plan = prepareGeneratedPlan(tryParseImprovementPlan(repaired, repoName, score), aiTooling);
		validationErrors = plan ? validateImprovementPlan(plan, aiTooling) : ['Repaired response was not valid JSON matching the required plan schema.'];
	}

	if (!plan || validationErrors.length > 0) {
		plan = fallbackImprovementPlan(repoName, score);
	}

	plan.generatedAt = new Date().toISOString();
	plan.markdown = renderImprovementMarkdown(plan);

	let plans: ImprovementPlansStore = {};
	try {
		plans = JSON.parse(await readFile(plansPath, 'utf-8'));
	} catch {
		// file missing or corrupt - start fresh
	}
	plans[repoName] = plan;
	await writeFile(plansPath, JSON.stringify(plans, null, 2));
	return plan;
}

function prepareGeneratedPlan(plan: ImprovementPlan | null, aiTooling: AiTooling): ImprovementPlan | null {
	if (!plan) return null;
	plan.prioritizedTasks = plan.prioritizedTasks.map(task => rewriteTaskForTooling(task, aiTooling));
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

export function parseImprovementPlan(raw: string, repoName: string, score: ScoreResult): ImprovementPlan {
	const trimmed = raw.trim();
	const candidates = [
		trimmed,
		trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
		extractJsonObject(trimmed)
	].filter((candidate): candidate is string => Boolean(candidate));

	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			return normalizeImprovementPlan(JSON.parse(candidate), repoName, score);
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Invalid improvement plan JSON');
}

export async function exportImprovementPlanToRepo(repoPath: string, plan: ImprovementPlan): Promise<{ planPath: string; agentsPath: string }> {
	const agentDir = join(repoPath, '.agent');
	const planPath = join(repoPath, EXPORTED_PLAN_PATH);
	const agentsPath = join(repoPath, 'AGENTS.md');

	await mkdir(agentDir, { recursive: true });
	await writeFile(planPath, `${plan.markdown.trim()}\n`);
	await ensureAgentsPointer(agentsPath);

	return { planPath: EXPORTED_PLAN_PATH, agentsPath: 'AGENTS.md' };
}

export async function markImprovementPlanExported(
	plansPath: string,
	repoName: string,
	exported: { planPath: string; agentsPath: string }
): Promise<ImprovementPlan> {
	const plans: ImprovementPlansStore = JSON.parse(await readFile(plansPath, 'utf-8'));
	const plan = plans[repoName];
	if (!plan) {
		throw new Error('PLAN_NOT_FOUND');
	}
	const updated = {
		...plan,
		exportedAt: new Date().toISOString(),
		exportedPlanPath: exported.planPath,
		exportedAgentsPath: exported.agentsPath
	};
	plans[repoName] = updated;
	await writeFile(plansPath, JSON.stringify(plans, null, 2));
	return updated;
}

function tryParseImprovementPlan(raw: string, repoName: string, score: ScoreResult): ImprovementPlan | null {
	try {
		return parseImprovementPlan(raw, repoName, score);
	} catch {
		return null;
	}
}

async function callPlanModel(mlxConfig: MLXConfig, prompt: string): Promise<string> {
	try {
		return await callMLX(mlxConfig, prompt);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`MLX_UNREACHABLE: ${msg}`);
	}
}

function normalizeImprovementPlan(value: unknown, repoName: string, score: ScoreResult): ImprovementPlan {
	if (!isRecord(value)) {
		throw new Error('Improvement plan must be an object');
	}
	const prioritizedTasks = normalizeTasks(value.prioritizedTasks)
		.concat(normalizeTasks(value.tasks))
		.concat(normalizeTasks(value.recommendations));
	if (prioritizedTasks.length === 0) {
		throw new Error('Improvement plan must include at least one task');
	}

	const summary = typeof value.summary === 'string' && value.summary.trim()
		? value.summary.trim()
		: `Improve ${repoName} from ${score.band} maturity by addressing the lowest-scoring categories.`;

	const plan: ImprovementPlan = {
		generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
		exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : undefined,
		exportedPlanPath: typeof value.exportedPlanPath === 'string' ? value.exportedPlanPath : undefined,
		exportedAgentsPath: typeof value.exportedAgentsPath === 'string' ? value.exportedAgentsPath : undefined,
		repoName,
		summary,
		currentScore: score.score,
		currentBand: score.band,
		strongestCategories: normalizeCategoryList(value.strongestCategories),
		weakestCategories: normalizeCategoryList(value.weakestCategories),
		prioritizedTasks,
		markdown: ''
	};
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

function fallbackImprovementPlan(repoName: string, score: ScoreResult): ImprovementPlan {
	const weakestCategories = CATEGORY_KEYS
		.filter(key => score.categories[key] < CATEGORY_MAX[key])
		.sort((a, b) => score.categories[a] / CATEGORY_MAX[a] - score.categories[b] / CATEGORY_MAX[b])
		.slice(0, 5);
	const recommendations = score.recommendations.length > 0
		? score.recommendations
		: weakestCategories.map(key => `Improve ${CATEGORY_LABELS[key]} with concrete, repo-specific guidance and validation.`);
	const prioritizedTasks = recommendations.slice(0, 5).map((recommendation, index): ImprovementTask => {
		const category = weakestCategories[index] ?? weakestCategories[0] ?? 'persistent_guidance';
		return {
			title: recommendation.replace(/[.!?]+$/, '').slice(0, 80),
			category,
			impact: index < 2 ? 'high' : 'medium',
			effort: 'medium',
			targetFiles: fallbackTargetFiles(category),
			instructions: recommendation,
			acceptanceCriteria: [
				'The improvement is documented in repo-relative files',
				'The guidance is specific to this repository',
				'Validation commands or manual verification steps are included'
			],
			validationCommands: []
		};
	});
	const plan: ImprovementPlan = {
		generatedAt: '',
		repoName,
		summary: `Generated a fallback improvement plan from the score recommendations because the model did not return a valid structured plan.`,
		currentScore: score.score,
		currentBand: score.band,
		strongestCategories: CATEGORY_KEYS
			.sort((a, b) => score.categories[b] / CATEGORY_MAX[b] - score.categories[a] / CATEGORY_MAX[a])
			.slice(0, 3),
		weakestCategories,
		prioritizedTasks,
		markdown: ''
	};
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

function fallbackTargetFiles(category: keyof CategoryScores): string[] {
	switch (category) {
		case 'persistent_guidance':
		case 'onboarding_discoverability':
			return ['AGENTS.md'];
		case 'scoped_rules':
			return ['.agent/rules/repo-guidance.md'];
		case 'skills':
			return ['.agent/skills/repo-improvement/SKILL.md'];
		case 'specialized_agents':
			return ['.agent/agents/repo-reviewer.md'];
		case 'ci_pr_automation':
		case 'validation_reproducibility':
			return ['AGENTS.md'];
		default:
			return ['.agent/improvement-plan.md'];
	}
}

function validateImprovementPlan(plan: ImprovementPlan, aiTooling: AiTooling): string[] {
	const errors: string[] = [];
	if (plan.prioritizedTasks.length < 3 || plan.prioritizedTasks.length > 5) {
		errors.push('prioritizedTasks must contain 3 to 5 tasks.');
	}
	if (!plan.summary || plan.summary.length < 40) {
		errors.push('summary must be a concrete 1-2 sentence repo-specific summary.');
	}

	plan.prioritizedTasks.forEach((task, index) => {
		const label = `Task ${index + 1}`;
		if (task.title.length < 8 || task.title.length > 90) {
			errors.push(`${label} title must be specific and between 8 and 90 characters.`);
		}
		if (task.instructions.length < 80) {
			errors.push(`${label} instructions must be specific enough for a coding agent to execute, at least 80 characters.`);
		}
		if (task.targetFiles.length === 0 || task.targetFiles.some(file => !isConcreteTargetFile(file))) {
			errors.push(`${label} targetFiles must contain concrete repo-relative file paths, not placeholders or vague directories.`);
		}
		if (task.acceptanceCriteria.length < 2) {
			errors.push(`${label} must include at least two acceptance criteria.`);
		}
		if (task.validationCommands.length === 0) {
			errors.push(`${label} should include at least one validation command or manual verification command.`);
		}
		if (aiTooling === 'generic' && task.targetFiles.some(isVendorSpecificPath)) {
			errors.push(`${label} uses vendor-specific target files while AI tooling is generic.`);
		}
	});

	return errors;
}

function isConcreteTargetFile(file: string): boolean {
	if (!file || file.includes('<') || file.includes('>')) return false;
	if (file === 'To be determined') return false;
	if (file.endsWith('/')) return false;
	return file.includes('.') || file.includes('/');
}

function isVendorSpecificPath(file: string): boolean {
	return file.startsWith('.cursor/')
		|| file.startsWith('.claude/')
		|| file.startsWith('.windsurf/')
		|| file === '.github/copilot-instructions.md'
		|| file.startsWith('.github/instructions/')
		|| file.startsWith('.github/prompts/');
}

function normalizeTasks(value: unknown): ImprovementTask[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): ImprovementTask | null => {
			if (!isRecord(item)) return null;
			const title = stringValue(item.title);
			const category = categoryValue(item.category);
			const instructions = stringValue(item.instructions);
			if (!title || !category || !instructions) return null;
			return {
				title,
				category,
				impact: priorityValue(item.impact),
				effort: priorityValue(item.effort),
				targetFiles: stringArray(item.targetFiles),
				instructions,
				acceptanceCriteria: stringArray(item.acceptanceCriteria),
				validationCommands: stringArray(item.validationCommands)
			};
		})
		.filter((task): task is ImprovementTask => Boolean(task))
		.slice(0, 8);
}

function rewriteTaskForTooling(task: ImprovementTask, aiTooling: AiTooling): ImprovementTask {
	const targetFiles = task.targetFiles.map(path => rewriteVendorSpecificPath(path, aiTooling));
	return {
		...task,
		title: replaceVendorText(task.title, aiTooling),
		targetFiles,
		instructions: replaceVendorText(task.instructions, aiTooling),
		acceptanceCriteria: task.acceptanceCriteria.map(item => replaceVendorText(item, aiTooling))
	};
}

function rewriteVendorSpecificPath(path: string, aiTooling: AiTooling): string {
	if (aiTooling === 'cursor') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.cursor/rules/').replace(/\.md$/, '.mdc');
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.cursor/');
		return path;
	}
	if (aiTooling === 'claude') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.claude/rules/');
		if (path.startsWith('.agent/skills/')) return path.replace('.agent/skills/', '.claude/skills/');
		if (path.startsWith('.agent/agents/')) return path.replace('.agent/agents/', '.claude/agents/');
		return path;
	}
	if (aiTooling === 'copilot') {
		if (path === '.agent/instructions.md') return '.github/copilot-instructions.md';
		if (path.startsWith('.agent/instructions/')) return path.replace('.agent/instructions/', '.github/instructions/');
		if (path.startsWith('.agent/prompts/')) return path.replace('.agent/prompts/', '.github/prompts/');
		return path;
	}
	if (aiTooling === 'windsurf') {
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.windsurf/');
		return path;
	}
	if (path.startsWith('.cursor/rules/')) return path.replace('.cursor/rules/', '.agent/rules/').replace(/\.mdc$/, '.md');
	if (path.startsWith('.cursor/')) return path.replace('.cursor/', '.agent/');
	if (path.startsWith('.claude/')) return path.replace('.claude/', '.agent/');
	if (path.startsWith('.windsurf/')) return path.replace('.windsurf/', '.agent/');
	if (path === '.github/copilot-instructions.md') return '.agent/instructions.md';
	if (path.startsWith('.github/instructions/')) return path.replace('.github/instructions/', '.agent/instructions/');
	if (path.startsWith('.github/prompts/')) return path.replace('.github/prompts/', '.agent/prompts/');
	return path;
}

function replaceVendorText(value: string, aiTooling: AiTooling): string {
	if (aiTooling !== 'generic') return value;
	return value
		.replace(/\bCursor\b/g, 'agent')
		.replace(/\.cursor\/rules\//g, '.agent/rules/')
		.replace(/\.cursor\//g, '.agent/')
		.replace(/\.claude\//g, '.agent/')
		.replace(/\.windsurf\//g, '.agent/')
		.replace(/\.github\/copilot-instructions\.md/g, '.agent/instructions.md')
		.replace(/\.github\/instructions\//g, '.agent/instructions/')
		.replace(/\.github\/prompts\//g, '.agent/prompts/')
		.replace(/\.mdc\b/g, '.md');
}

function renderImprovementMarkdown(plan: ImprovementPlan): string {
	const lines = [
		`# Repo Improvement Plan: ${plan.repoName}`,
		'',
		'You are an AI coding agent working in this repository. Complete the tasks below in order. For each task, make the smallest safe code or documentation changes, run the validation commands, and report what changed.',
		'',
		'## Current Score',
		`Score: ${plan.currentScore}`,
		`Band: ${plan.currentBand}`,
		'',
		'## Summary',
		plan.summary,
		'',
		'## Prioritized Tasks'
	];

	plan.prioritizedTasks.forEach((task, index) => {
		lines.push(
			'',
			`### ${index + 1}. ${task.title}`,
			`Category: ${CATEGORY_LABELS[task.category]}`,
			`Impact: ${task.impact}`,
			`Effort: ${task.effort}`,
			'',
			'Target files:',
			...(task.targetFiles.length > 0 ? task.targetFiles.map(file => `- ${file}`) : ['- To be determined']),
			'',
			'Task:',
			task.instructions,
			'',
			'Acceptance criteria:',
			...(task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map(item => `- ${item}`) : ['- The requested repo improvement exists and is specific to this repository']),
			'',
			'Validation:',
			...(task.validationCommands.length > 0 ? task.validationCommands.map(command => `- ${command}`) : ['- Run the repository validation command documented by the repo'])
		);
	});

	return lines.join('\n');
}

async function ensureAgentsPointer(agentsPath: string): Promise<void> {
	let content = '';
	if (existsSync(agentsPath)) {
		content = await readFile(agentsPath, 'utf-8');
	}
	if (content.includes(EXPORTED_PLAN_PATH)) {
		return;
	}
	const next = content.trim()
		? `${content.trim()}\n\n${AGENTS_POINTER}`
		: `# Agent Guidance\n\n${AGENTS_POINTER}`;
	await writeFile(agentsPath, next);
}

function buildImprovementPrompt(
	repoName: string,
	rubric: string,
	score: ScoreResult,
	files: { relativePath: string; content: string }[],
	aiTooling: AiTooling
): string {
	const evidence = files.length === 0
		? 'No agent-related files found in this repository.'
		: files.map(file => `### ${file.relativePath}\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n');

	return `You are creating a practical improvement plan for a repository.

## REPOSITORY
${repoName}

## CURRENT SCORE RESULT
${JSON.stringify(score, null, 2)}

## RUBRIC
${rubric}

## REPOSITORY EVIDENCE
${evidence}

## TASK
Return ONLY a JSON object that a human or coding LLM can use to improve the repository.

## AI TOOLING TARGET
${toolingInstruction(aiTooling)}

Required schema:
{
  "summary": <short summary string>,
  "strongestCategories": [<category keys>],
  "weakestCategories": [<category keys>],
  "prioritizedTasks": [
    {
      "title": <short task title>,
      "category": <one category key>,
      "impact": <"high" | "medium" | "low">,
      "effort": <"high" | "medium" | "low">,
      "targetFiles": [<repo-relative files or directories to create/update>],
      "instructions": <specific implementation instructions an LLM can execute>,
      "acceptanceCriteria": [<observable completion checks>],
      "validationCommands": [<commands to run, if known>]
    }
  ]
}

Rules:
- Include exactly 3 to 5 prioritized tasks. This is a next-action batch, not a full roadmap.
- Optimize for the highest score impact first.
- Each task must be independently actionable in one coding-agent session.
- Prefer portable, agent-agnostic files such as AGENTS.md, .agent/improvement-plan.md, .agent/rules/*.md, .agent/skills/*/SKILL.md, .agent/agents/*.md, docs/adr/*.md, Makefile, package scripts, and CI workflow files when CI already exists.
- If AI TOOLING TARGET is generic, do not recommend tool/vendor-specific files such as .cursor/**, .claude/**, .windsurf/**, or .github/copilot-instructions.md.
- If AI TOOLING TARGET names a specific tool, recommend that tool's conventional files where appropriate.
- Every task must have concrete repo-relative targetFiles.
- Every task must have at least two acceptanceCriteria.
- Every task must have at least one validationCommands entry, even if it is a manual verification command such as "test -f AGENTS.md".
- Tie each task to one weak or improvable category.
- Do not invent product facts not supported by the evidence.
- Return exactly one raw JSON object. Do not return markdown, commentary, code fences, or explanations.

Example shape:
{
  "summary": "This repo has useful baseline guidance but needs portable scoped rules, reusable workflow instructions, and validation hooks so agents can make repeatable changes safely.",
  "strongestCategories": ["persistent_guidance"],
  "weakestCategories": ["scoped_rules", "skills", "validation_reproducibility"],
  "prioritizedTasks": [
    {
      "title": "Add portable scoped repo rules",
      "category": "scoped_rules",
      "impact": "high",
      "effort": "medium",
      "targetFiles": [".agent/rules/repo-guidance.md"],
      "instructions": "Create repo-specific scoped guidance for the highest-risk code areas. Include conventions, ownership boundaries, and the exact validation commands agents should run before reporting completion.",
      "acceptanceCriteria": ["The file contains repo-specific path or module guidance", "The file includes concrete validation commands"],
      "validationCommands": ["test -f .agent/rules/repo-guidance.md"]
    }
  ]
}`;
}

function toolingInstruction(aiTooling: AiTooling): string {
	switch (aiTooling) {
		case 'cursor':
			return 'Cursor. Use Cursor-specific files such as .cursor/rules/*.mdc only where they are the right target.';
		case 'claude':
			return 'Claude. Use Claude-specific files such as .claude/rules/*.md, .claude/skills/*/SKILL.md, and .claude/agents/*.md only where they are the right target.';
		case 'copilot':
			return 'GitHub Copilot. Use files such as .github/copilot-instructions.md, .github/instructions/*.instructions.md, and .github/prompts/*.prompt.md only where they are the right target.';
		case 'windsurf':
			return 'Windsurf. Use Windsurf-specific files only where they are the right target.';
		default:
			return 'Generic / portable. Use agent-agnostic files such as AGENTS.md and .agent/**. Do not create vendor-specific AI tool files.';
	}
}

function buildRepairPrompt(raw: string, repoName: string, score: ScoreResult, validationErrors: string[], aiTooling: AiTooling): string {
	return `Convert the text below into one valid JSON object for an improvement plan for ${repoName}. Return raw JSON only.

Current score:
${JSON.stringify(score, null, 2)}

AI tooling target:
${toolingInstruction(aiTooling)}

Validation errors to fix:
${validationErrors.map(error => `- ${error}`).join('\n')}

Required keys:
- summary
- strongestCategories
- weakestCategories
- prioritizedTasks with title, category, impact, effort, targetFiles, instructions, acceptanceCriteria, validationCommands

Rules:
- Return exactly one raw JSON object.
- Include exactly 3 to 5 prioritizedTasks.
- Every task needs concrete targetFiles, specific instructions, at least two acceptanceCriteria, and at least one validationCommands entry.
- Generic tooling must use AGENTS.md and .agent/**, not vendor-specific files.

Text to convert:
${raw}`;
}

function normalizeCategoryList(value: unknown): (keyof CategoryScores)[] {
	if (!Array.isArray(value)) return [];
	return value.map(categoryValue).filter((item): item is keyof CategoryScores => Boolean(item));
}

function categoryValue(value: unknown): keyof CategoryScores | null {
	return typeof value === 'string' && CATEGORY_KEYS.includes(value as keyof CategoryScores)
		? value as keyof CategoryScores
		: null;
}

function priorityValue(value: unknown): 'high' | 'medium' | 'low' {
	return typeof value === 'string' && IMPACT_VALUES.includes(value as 'high' | 'medium' | 'low')
		? value as 'high' | 'medium' | 'low'
		: 'medium';
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(stringValue).filter(Boolean);
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonObject(raw: string): string | null {
	const start = raw.indexOf('{');
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < raw.length; i += 1) {
		const char = raw[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) return raw.slice(start, i + 1);
		}
	}
	return null;
}
