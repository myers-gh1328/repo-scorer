import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getScoringJobs } from '$lib/server/scoreConcurrency';
import { parseEvaluationMode } from '$lib/evaluationModes';

export const GET: RequestHandler = async ({ url }) => {
	const modeParam = url.searchParams.get('mode');
	const mode = parseMode(modeParam);
	return json({ jobs: getScoringJobs(mode) });
};

function parseMode(value: unknown) {
	try {
		return parseEvaluationMode(value);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Unsupported evaluation mode');
	}
}
