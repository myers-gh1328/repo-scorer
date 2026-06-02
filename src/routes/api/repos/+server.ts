import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import {
	discoverRepos,
	isGitRepo,
	normalizeRepoName,
	readRepoConfig,
	writeRepoConfig
} from '$lib/server/repoConfig';

export const GET: RequestHandler = async () => {
	const [configured, discovered] = await Promise.all([readRepoConfig(), discoverRepos()]);
	return json({ configured, discovered });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const action = body?.action;
	const path = typeof body?.path === 'string' ? body.path.trim() : '';
	const explicitName = typeof body?.name === 'string' ? body.name.trim() : '';

	if (!path) {
		throw error(400, 'Repo path is required');
	}

	const repos = await readRepoConfig();

	if (action === 'remove') {
		await writeRepoConfig(repos.filter(repo => repo.path !== path));
		return json({ configured: await readRepoConfig() });
	}

	if (action !== 'add') {
		throw error(400, 'Unsupported repo action');
	}

	if (!(await isGitRepo(path))) {
		throw error(400, 'Path must be an existing Git repository');
	}

	const name = explicitName || normalizeRepoName(path);
	if (!name) {
		throw error(400, 'Repo name is required');
	}
	if (repos.some(repo => repo.path === path)) {
		throw error(400, 'Repo is already configured');
	}
	if (repos.some(repo => repo.name === name)) {
		throw error(400, `Repo name "${name}" is already configured`);
	}

	repos.push({ name, path });
	await writeRepoConfig(repos);
	return json({ configured: await readRepoConfig() });
};

