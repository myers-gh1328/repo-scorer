import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async () => {
  let repos: RepoConfig[] = [];
  try {
    repos = JSON.parse(await readFile('repos.config.json', 'utf-8'));
  } catch {
    repos = [];
  }

  let scores: ScoresStore = {};
  if (existsSync('scores.json')) {
    scores = JSON.parse(await readFile('scores.json', 'utf-8'));
  }

  return { repos, scores };
};
