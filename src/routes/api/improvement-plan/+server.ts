import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readAppSettings, readLlmApiKey } from '$lib/server/appSettings';
import { resolveContextWindow } from '$lib/server/modelContext';
import { isGitRepo, readRepoConfig } from '$lib/server/repoConfig';
import { parseEvaluationMode, readEvaluationRubric } from '$lib/evaluationModes';
import {
	assertImprovementPlanExportAllowed,
	exportImprovementPlanToRepo,
	generateImprovementPlan
} from '$lib/improvementPlanner';
import { improvementPlanResponseFormat } from '$lib/responseSchemas';
import { storage } from '$lib/server/storage';
import type { RepoConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const name = typeof body?.name === 'string' ? body.name : '';
	const path = typeof body?.path === 'string' ? body.path : '';
	const action = typeof body?.action === 'string' ? body.action : 'generate';
	const mode = parseEvaluationMode(body?.mode);

	if (!name || !path) {
		throw error(400, 'Request body must include name and path strings');
	}

	const configs: RepoConfig[] = await readRepoConfig();
	const repo = configs.find(repo => repo.name === name && repo.path === path);
	if (!repo) {
		throw error(400, `Repo "${name}" is not a configured repo`);
	}
	if (!existsSync(path)) {
		throw error(400, `Repo path not found: ${path}`);
	}

	if (action === 'export') {
		const plan = storage().getImprovementPlan(name, mode);
		if (!plan) {
			throw error(400, 'Generate an improvement plan before exporting it');
		}
		if (plan.evaluationMode && plan.evaluationMode !== mode) {
			throw error(409, 'Stored improvement plan belongs to a different evaluation mode');
		}
		try {
			assertImprovementPlanExportAllowed(repo);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg === 'PLAN_EXPORT_BLOCKED_PUBLIC_REPO') {
				throw error(403, 'Export is disabled for public/open-source repos. Copy the plan manually if you decide a repo-local change belongs there.');
			}
			throw error(403, 'Export is disabled for this repo');
		}
		if (!(await isGitRepo(path))) {
			throw error(400, 'Export target must be an existing Git repository');
		}
		if (plan.sourceRepoPath && plan.sourceRepoPath !== path) {
			throw error(409, 'Generated plan belongs to a different repo path. Regenerate the plan before exporting.');
		}
		const exported = await exportImprovementPlanToRepo(path, plan);
		return json({ ...storage().markImprovementPlanExported(name, exported, mode), exported });
	}

	if (action !== 'generate') {
		throw error(400, 'Unsupported improvement plan action');
	}

	const { guidance } = await readEvaluationRubric(mode);

	const score = storage().getScore(name, mode);
	if (!score) {
		throw error(400, 'Score this repo before generating an improvement plan');
	}
	if (score.evaluationMode && score.evaluationMode !== mode) {
		throw error(409, 'Stored score belongs to a different evaluation mode');
	}

	const { llmBaseUrl, llmModel, aiTooling, useJsonSchema, llmContextTokens } = await readAppSettings();
	const apiKey = await readLlmApiKey();
	const contextWindow = await resolveContextWindow({ baseUrl: llmBaseUrl, model: llmModel, configuredTokens: llmContextTokens, apiKey });
	try {
		const plan = await generateImprovementPlan(name, path, guidance, score, {
			baseUrl: llmBaseUrl,
			model: llmModel,
			maxTokens: 4096,
			apiKey,
			contextTokens: contextWindow.tokens,
			contextSource: contextWindow.source,
			responseFormat: useJsonSchema ? improvementPlanResponseFormat : undefined
		}, aiTooling, mode);
		return json(plan);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.startsWith('LLM_UNREACHABLE')) {
			throw error(503, `LLM server unreachable: ${msg.replace(/^LLM_UNREACHABLE:?\s*/, '')}`);
		}
		if (msg === 'PLAN_PARSE_FAILED') {
			throw error(500, 'Improvement plan failed — model response could not be parsed');
		}
		if (msg.startsWith('PLAN_VALIDATION_FAILED')) {
			throw error(500, `Improvement plan failed validation: ${msg.replace(/^PLAN_VALIDATION_FAILED:?\s*/, '')}`);
		}
		throw error(500, `Improvement plan failed: ${msg}`);
	}
};
