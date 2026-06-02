import type { PageServerLoad } from './$types';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readRepoConfig } from '$lib/server/repoConfig';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async () => {
  const repos: RepoConfig[] = await readRepoConfig();

  let scores: ScoresStore = {};
  if (existsSync('scores.json')) {
    try {
      scores = JSON.parse(await readFile('scores.json', 'utf-8'));
    } catch {
      // corrupt scores.json — ignore
    }
  }

  return { repos, scores };
};
