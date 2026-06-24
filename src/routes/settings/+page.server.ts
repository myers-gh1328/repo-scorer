import type { PageServerLoad } from './$types';
import { OPENAI_MODEL_IDS } from '$lib/modelCatalog';
import { readAppSettings } from '$lib/server/appSettings';
import { discoverRepos, readRepoConfig } from '$lib/server/repoConfig';

export const load: PageServerLoad = async () => {
	const [configured, discovered, settings] = await Promise.all([
		readRepoConfig(),
		discoverRepos(),
		readAppSettings()
	]);
	return { configured, discovered, settings, models: OPENAI_MODEL_IDS };
};
