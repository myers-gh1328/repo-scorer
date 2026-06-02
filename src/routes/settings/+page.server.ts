import type { PageServerLoad } from './$types';
import { discoverRepos, readRepoConfig } from '$lib/server/repoConfig';

export const load: PageServerLoad = async () => {
	const [configured, discovered] = await Promise.all([readRepoConfig(), discoverRepos()]);
	return { configured, discovered };
};

