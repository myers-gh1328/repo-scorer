import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import { readRepoConfig } from '$lib/server/repoConfig';
import type { ImprovementPlansStore, RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
  const { name } = params;

  const repos: RepoConfig[] = await readRepoConfig();
  const repo = repos.find(r => r.name === name);

  if (!repo) {
    throw error(404, `Repo "${name}" not found in repos.config.json`);
  }

  let result = null;
  if (existsSync('scores.json')) {
    try {
      const scores: ScoresStore = JSON.parse(await readFile('scores.json', 'utf-8'));
      result = scores[name] ?? null;
    } catch {
      // corrupt scores.json — show as unscored
    }
  }

  let improvementPlan = null;
  if (existsSync('improvement-plans.json')) {
    try {
      const plans: ImprovementPlansStore = JSON.parse(await readFile('improvement-plans.json', 'utf-8'));
      improvementPlan = plans[name] ?? null;
    } catch {
      // corrupt improvement-plans.json - show as not generated
    }
  }

  return { name, repoPath: repo.path, result, improvementPlan };
};
