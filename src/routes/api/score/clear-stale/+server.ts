import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { clearStaleScoringJobs } from '$lib/server/scoreConcurrency';
import { parseEvaluationMode } from '$lib/evaluationModes';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const mode = parseEvaluationMode(body?.mode);
	return json({ cleared: clearStaleScoringJobs(mode) });
};
