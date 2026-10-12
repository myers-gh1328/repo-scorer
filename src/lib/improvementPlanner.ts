import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanRepo } from './scanner';
import { callLLM } from './llmClient';
import { DEFAULT_EVALUATION_MODE } from './types';
import { storage } from './server/storage';
import { availableGuidanceLevels, guidanceText, type GuidanceLevel, type RubricGuidance } from './rubricGuidance';
import { chooseGuidanceLevel, inputTokenBudget, isContextLengthError, nextGuidanceLevel } from './promptBudget';
import { buildImprovementPrompt, buildRepairPrompt } from './improvementPrompts';
import { renderImprovementMarkdown, tryParseImprovementPlan } from './improvementPlanParse';
import { isQualityValidationError, validateImprovementPlan } from './improvementPlanValidation';
import { rewriteTaskForTooling } from './improvementTooling';
import { collectRepoInventory, collectValidationCommandCandidates } from './repoInventory';
import type { AiTooling } from './server/appSettings';
import type { ImprovementPlan, LLMConfig, RepoConfig, ScoreResult, EvaluationMode } from './types';

export { parseImprovementPlan } from './improvementPlanParse';

const EXPORTED_PLAN_PATH = '.agent/improvement-plan.md';

export function assertImprovementPlanExportAllowed(repo: RepoConfig): void {
	if (repo.openSource || repo.visibility === 'public') {
		throw new Error('PLAN_EXPORT_BLOCKED_PUBLIC_REPO');
	}
	if (repo.allowPlanExport !== true) {
		throw new Error('PLAN_EXPORT_DISABLED');
	}
}

export async function generateImprovementPlan(
	repoName: string,
	repoPath: string,
	guidance: RubricGuidance,
	score: ScoreResult,
	llmConfig: LLMConfig,
	aiTooling: AiTooling = 'generic',
	evaluationMode: EvaluationMode = score.evaluationMode ?? DEFAULT_EVALUATION_MODE
): Promise<ImprovementPlan> {
	const scan = await scanRepo(repoPath);
	const inventory = await collectRepoInventory(repoPath);
	const validationCandidates = await collectValidationCommandCandidates(repoPath, inventory);
	const categoryKeys = Object.keys(score.categories ?? {});
	const levels = availableGuidanceLevels(guidance, categoryKeys);
	const build = (level: GuidanceLevel) => buildImprovementPrompt(
		repoName, guidanceText(guidance, level, categoryKeys), score, scan.files, inventory, validationCandidates, aiTooling, evaluationMode
	);
	const choice = chooseGuidanceLevel(levels, build, inputTokenBudget(llmConfig));
	let level = choice.level;
	let raw: string;
	let prompt = choice.prompt;
	for (;;) {
		try {
			raw = await callLLM(llmConfig, prompt);
			break;
		} catch (e) {
			const lower = isContextLengthError(e) ? nextGuidanceLevel(levels, level) : undefined;
			if (!lower) {
				const msg = e instanceof Error ? e.message : String(e);
				throw new Error(`LLM_UNREACHABLE: ${msg}`);
			}
			level = lower;
			prompt = build(level);
		}
	}
	let repairCount = 0;
	let plan = prepareGeneratedPlan(tryParseImprovementPlan(raw, repoName, score), aiTooling);
	let validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Response was not valid JSON matching the required plan schema.'];
	const qualityWarnings = new Set(validationErrors.filter(isQualityValidationError));

	if (!plan || validationErrors.length > 0) {
		const repaired = await callPlanModel(llmConfig, buildRepairPrompt(raw, repoName, score, validationErrors, inventory, validationCandidates, aiTooling, evaluationMode));
		repairCount += 1;
		plan = prepareGeneratedPlan(tryParseImprovementPlan(repaired, repoName, score), aiTooling);
		validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Repaired response was not valid JSON matching the required plan schema.'];
		validationErrors.filter(isQualityValidationError).forEach(error => qualityWarnings.add(error));

		if (plan && validationErrors.length > 0 && validationErrors.every(isQualityValidationError)) {
			const repairedQuality = await callPlanModel(llmConfig, buildRepairPrompt(repaired, repoName, score, validationErrors, inventory, validationCandidates, aiTooling, evaluationMode));
			repairCount += 1;
			plan = prepareGeneratedPlan(tryParseImprovementPlan(repairedQuality, repoName, score), aiTooling);
			validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Quality repair response was not valid JSON matching the required plan schema.'];
			validationErrors.filter(isQualityValidationError).forEach(error => qualityWarnings.add(error));
		}
	}

	if (!plan || validationErrors.length > 0) {
		throw new Error(`PLAN_VALIDATION_FAILED: ${validationErrors.join('; ')}`);
	}

	plan.generatedAt = new Date().toISOString();
	plan.evaluationMode = evaluationMode;
	plan.sourceRepoPath = repoPath;
	plan.repairCount = repairCount;
	plan.promptContext = {
		...(llmConfig.contextTokens ? { contextTokens: llmConfig.contextTokens } : {}),
		contextSource: llmConfig.contextSource ?? (llmConfig.contextTokens ? 'setting' : 'unknown'),
		levels: { plan: level },
		evidenceTrimmed: []
	};
	plan.qualityWarnings = [...qualityWarnings];
	plan.markdown = renderImprovementMarkdown(plan);

	storage().saveImprovementPlan(repoName, plan, evaluationMode);
	return plan;
}

function prepareGeneratedPlan(plan: ImprovementPlan | null, aiTooling: AiTooling): ImprovementPlan | null {
	if (!plan) return null;
	plan.prioritizedTasks = plan.prioritizedTasks.map(task => rewriteTaskForTooling(task, aiTooling));
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

export async function exportImprovementPlanToRepo(repoPath: string, plan: ImprovementPlan): Promise<{ planPath: string; agentsPath: string }> {
	const agentDir = join(repoPath, '.agent');
	const exportPath = plan.evaluationMode && plan.evaluationMode !== DEFAULT_EVALUATION_MODE
		? `.agent/improvement-plan-${plan.evaluationMode}.md`
		: EXPORTED_PLAN_PATH;
	const planPath = join(repoPath, exportPath);
	const agentsPath = join(repoPath, 'AGENTS.md');

	await mkdir(agentDir, { recursive: true });
	await writeFile(planPath, `${plan.markdown.trim()}\n`);
	await ensureAgentsPointer(agentsPath, exportPath);

	return { planPath: exportPath, agentsPath: 'AGENTS.md' };
}

async function callPlanModel(llmConfig: LLMConfig, prompt: string): Promise<string> {
	try {
		return await callLLM(llmConfig, prompt);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`LLM_UNREACHABLE: ${msg}`);
	}
}

async function ensureAgentsPointer(agentsPath: string, exportPath: string): Promise<void> {
	let content = '';
	if (existsSync(agentsPath)) {
		content = await readFile(agentsPath, 'utf-8');
	}
	if (content.includes(exportPath)) {
		return;
	}
	const pointer = `## Agent Improvement Plan

This repository has a generated agent-facing improvement plan at \`${exportPath}\`. Review it before making repo maturity improvements.
`;
	const next = content.trim()
		? `${content.trim()}\n\n${pointer}`
		: `# Agent Guidance\n\n${pointer}`;
	await writeFile(agentsPath, next);
}
