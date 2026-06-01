import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async () => {
  const configRaw = await readFile('repos.config.json', 'utf-8');
  const repos: RepoConfig[] = JSON.parse(configRaw);

  let scores: ScoresStore = {};
  if (existsSync('scores.json')) {
    scores = JSON.parse(await readFile('scores.json', 'utf-8'));
  }

  return { repos, scores };
};
