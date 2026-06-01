import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
  const { name } = params;

  let repos: RepoConfig[] = [];
  try {
    repos = JSON.parse(await readFile('repos.config.json', 'utf-8'));
  } catch {
    throw error(500, 'repos.config.json not found or invalid');
  }
  const repo = repos.find(r => r.name === name);

  if (!repo) {
    throw error(404, `Repo "${name}" not found in repos.config.json`);
  }

  let result = null;
  if (existsSync('scores.json')) {
    const scores: ScoresStore = JSON.parse(await readFile('scores.json', 'utf-8'));
    result = scores[name] ?? null;
  }

  return { name, repoPath: repo.path, result };
};
