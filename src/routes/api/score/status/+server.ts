import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getScoringJobs } from '$lib/server/scoreConcurrency';

export const GET: RequestHandler = async () => {
	return json({ jobs: getScoringJobs() });
};
