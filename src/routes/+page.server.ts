import type { PageServerLoad } from './$types';
import { readRepoConfig } from '$lib/server/repoConfig';
import { readRubricDefinition } from '$lib/rubricSchema';
import { storage } from '$lib/server/storage';
import type { RepoConfig } from '$lib/types';

export const load: PageServerLoad = async () => {
  const repos: RepoConfig[] = await readRepoConfig();
  const scores = storage().getScoresStore();
  const scoreHistory = storage().getScoreHistoryStore();

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
