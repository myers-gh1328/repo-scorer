import { readFile, writeFile } from 'node:fs/promises';
import { scanRepo } from './scanner';
import { callMLX } from './mlxClient';
import { CATEGORY_LABELS, CATEGORY_MAX } from './types';
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

export async function generateImprovementPlan(
	repoName: string,
	repoPath: string,
	rubric: string,
	score: ScoreResult,
	mlxConfig: MLXConfig,
	plansPath: string
): Promise<ImprovementPlan> {
	const scan = await scanRepo(repoPath);
	const raw = await callPlanModel(mlxConfig, buildImprovementPrompt(repoName, rubric, score, scan.files));
	let plan = tryParseImprovementPlan(raw, repoName, score);
	if (!plan) {
		const repaired = await callPlanModel(mlxConfig, buildRepairPrompt(raw, repoName, score));
		plan = tryParseImprovementPlan(repaired, repoName, score);
		if (!plan) {
			throw new Error('PLAN_PARSE_FAILED');
		}
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
	const prioritizedTasks = normalizeTasks(value.prioritizedTasks);
	if (prioritizedTasks.length === 0) {
		throw new Error('Improvement plan must include at least one task');
	}

	const summary = typeof value.summary === 'string' && value.summary.trim()
		? value.summary.trim()
		: `Improve ${repoName} from ${score.band} maturity by addressing the lowest-scoring categories.`;

	const plan: ImprovementPlan = {
		generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
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

function renderImprovementMarkdown(plan: ImprovementPlan): string {
	const lines = [
		`# Repo Improvement Plan: ${plan.repoName}`,
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

function buildImprovementPrompt(
	repoName: string,
	rubric: string,
	score: ScoreResult,
	files: { relativePath: string; content: string }[]
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
- Include 3 to 6 prioritized tasks.
- Prefer concrete files such as AGENTS.md, .cursor/rules/*.mdc, .agents/skills/*/SKILL.md, .github/workflows/*.yml, docs/adr/*.md.
- Tie each task to one weak or improvable category.
- Do not invent product facts not supported by the evidence.
- Return raw JSON only.`;
}

function buildRepairPrompt(raw: string, repoName: string, score: ScoreResult): string {
	return `Convert the text below into one valid JSON object for an improvement plan for ${repoName}. Return raw JSON only.

Current score:
${JSON.stringify(score, null, 2)}

Required keys:
- summary
- strongestCategories
- weakestCategories
- prioritizedTasks with title, category, impact, effort, targetFiles, instructions, acceptanceCriteria, validationCommands

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

