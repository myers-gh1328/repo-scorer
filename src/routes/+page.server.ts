import type { PageServerLoad } from './$types';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readRepoConfig } from '$lib/server/repoConfig';
import { readRubricDefinition } from '$lib/rubricSchema';
import type { RepoConfig, ScoreHistoryStore, ScoresStore } from '$lib/types';

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

  let scoreHistory: ScoreHistoryStore = {};
  if (existsSync('score-history.json')) {
    try {
      scoreHistory = JSON.parse(await readFile('score-history.json', 'utf-8'));
    } catch {
      // corrupt score-history.json - ignore
    }
  }

  const rubricDefinition = await readRubricDefinition();
  const rubric = {
    version: rubricDefinition.version,
    totalScore: rubricDefinition.totalScore,
    categories: rubricDefinition.categories,
    bands: rubricDefinition.bands,
    categoryLabels: rubricDefinition.categoryLabels
  };

  return { repos, scores, scoreHistory, rubric };
};
