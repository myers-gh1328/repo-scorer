import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { clearStaleScoringJobs } from '$lib/server/scoreConcurrency';
import { parseEvaluationMode } from '$lib/evaluationModes';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const mode = parseMode(body?.mode);
	return json({ cleared: clearStaleScoringJobs(mode) });
};

function parseMode(value: unknown) {
	try {
		return parseEvaluationMode(value);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Unsupported evaluation mode');
	}
}
