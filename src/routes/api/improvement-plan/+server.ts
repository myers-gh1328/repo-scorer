import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readAppSettings } from '$lib/server/appSettings';
import { readRepoConfig } from '$lib/server/repoConfig';
import { exportImprovementPlanToRepo, generateImprovementPlan } from '$lib/improvementPlanner';
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
	if (!configs.some(repo => repo.name === name && repo.path === path)) {
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
		return json(await exportImprovementPlanToRepo(path, plan));
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

	const { mlxBaseUrl } = await readAppSettings();
	try {
		return json(await generateImprovementPlan(name, path, rubric, score, { baseUrl: mlxBaseUrl }, PLANS_PATH));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.startsWith('MLX_UNREACHABLE')) {
			throw error(503, `MLX server unreachable: ${msg.replace(/^MLX_UNREACHABLE:?\s*/, '')}`);
		}
		if (msg === 'PLAN_PARSE_FAILED') {
			throw error(500, 'Improvement plan failed — model response could not be parsed');
		}
		throw error(500, `Improvement plan failed: ${msg}`);
	}
};
