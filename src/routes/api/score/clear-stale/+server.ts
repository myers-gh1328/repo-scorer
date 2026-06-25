import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { clearStaleScoringJobs } from '$lib/server/scoreConcurrency';

export const POST: RequestHandler = async () => {
	return json({ cleared: clearStaleScoringJobs() });
};
