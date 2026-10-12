import { CATEGORY_LABELS, CATEGORY_MAX } from './types';
import type { CategoryScores, ImprovementPlan, ImprovementTask, ScoreResult } from './types';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];
const IMPACT_VALUES = ['high', 'medium', 'low'] as const;

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

export function tryParseImprovementPlan(raw: string, repoName: string, score: ScoreResult): ImprovementPlan | null {
	try {
		return parseImprovementPlan(raw, repoName, score);
	} catch {
		return null;
	}
}

export function renderImprovementMarkdown(plan: ImprovementPlan): string {
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
			`Category: ${CATEGORY_LABELS[task.category] ?? task.category}`,
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

function normalizeImprovementPlan(value: unknown, repoName: string, score: ScoreResult): ImprovementPlan {
	if (!isRecord(value)) {
		throw new Error('Improvement plan must be an object');
	}
	const allowedCategories = Object.keys(score.categories ?? {});
	const prioritizedTasks = normalizeTasks(value.prioritizedTasks, allowedCategories)
		.concat(normalizeTasks(value.tasks, allowedCategories))
		.concat(normalizeTasks(value.recommendations, allowedCategories));
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
		sourceRepoPath: typeof value.sourceRepoPath === 'string' ? value.sourceRepoPath : undefined,
		repoName,
		summary,
		currentScore: score.score,
		currentBand: score.band,
		strongestCategories: normalizeCategoryList(value.strongestCategories, allowedCategories),
		weakestCategories: normalizeCategoryList(value.weakestCategories, allowedCategories),
		prioritizedTasks,
		markdown: ''
	};
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

function normalizeTasks(value: unknown, allowedCategories: string[]): ImprovementTask[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): ImprovementTask | null => {
			if (!isRecord(item)) return null;
			const title = stringValue(item.title);
			const category = categoryValue(item.category, allowedCategories);
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

function normalizeCategoryList(value: unknown, allowedCategories: string[]): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(item => categoryValue(item, allowedCategories)).filter((item): item is string => Boolean(item));
}

function categoryValue(value: unknown, allowedCategories = CATEGORY_KEYS): string | null {
	return typeof value === 'string' && allowedCategories.includes(value)
		? value
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
