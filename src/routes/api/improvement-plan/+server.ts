import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readAppSettings } from '$lib/server/appSettings';
import { readRepoConfig } from '$lib/server/repoConfig';
import {
	assertImprovementPlanExportAllowed,
	exportImprovementPlanToRepo,
	generateImprovementPlan,
	markImprovementPlanExported
} from '$lib/improvementPlanner';
import { improvementPlanResponseFormat } from '$lib/responseSchemas';
import type { ImprovementPlansStore, RepoConfig, ScoresStore } from '$lib/types';

const PLANS_PATH = 'improvement-plans.json';
const RUBRIC_PATH = 'rubric.md';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const name = typeof body?.name === 'string' ? body.name : '';
	const path = typeof body?.path === 'string' ? body.path : '';
	const action = typeof body?.action === 'string' ? body.action : 'generate';

	if (!name || !path) {
		throw error(400, 'Request body must include name and path strings');
	}

	const configs: RepoConfig[] = await readRepoConfig();
	const repo = configs.find(repo => repo.name === name && repo.path === path);
	if (!repo) {
		throw error(400, `Repo "${name}" not found in repos.config.json`);
	}
	if (!existsSync(path)) {
		throw error(400, `Repo path not found: ${path}`);
	}

	if (action === 'export') {
		let plans: ImprovementPlansStore = {};
		try {
			plans = JSON.parse(await readFile(PLANS_PATH, 'utf-8'));
		} catch {
			throw error(400, 'Generate an improvement plan before exporting it');
		}
		const plan = plans[name];
		if (!plan) {
			throw error(400, 'Generate an improvement plan before exporting it');
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
		const exported = await exportImprovementPlanToRepo(path, plan);
		return json({ ...(await markImprovementPlanExported(PLANS_PATH, name, exported)), exported });
	}

	if (action !== 'generate') {
		throw error(400, 'Unsupported improvement plan action');
	}

	let rubric: string;
	try {
		rubric = await readFile(RUBRIC_PATH, 'utf-8');
	} catch {
		throw error(500, 'rubric.md not found in project root');
	}

	let scores: ScoresStore = {};
	try {
		scores = JSON.parse(await readFile('scores.json', 'utf-8'));
	} catch {
		throw error(400, 'Score this repo before generating an improvement plan');
	}
	const score = scores[name];
	if (!score) {
		throw error(400, 'Score this repo before generating an improvement plan');
	}

	const { llmBaseUrl, llmModel, aiTooling, useJsonSchema } = await readAppSettings();
	try {
		const plan = await generateImprovementPlan(name, path, rubric, score, {
			baseUrl: llmBaseUrl,
			model: llmModel,
			maxTokens: 4096,
			responseFormat: useJsonSchema ? improvementPlanResponseFormat : undefined
		}, PLANS_PATH, aiTooling);
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
