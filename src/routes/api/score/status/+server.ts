import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getScoringJobs } from '$lib/server/scoreConcurrency';
import { parseEvaluationMode } from '$lib/evaluationModes';

export const GET: RequestHandler = async ({ url }) => {
	const modeParam = url.searchParams.get('mode');
	const mode = parseEvaluationMode(modeParam);
	return json({ jobs: getScoringJobs(mode) });
};
