import type { PageServerLoad } from './$types';
import { readRepoConfig } from '$lib/server/repoConfig';
import { storage } from '$lib/server/storage';
import { evaluationModeDefinition, listEvaluationModes, parseEvaluationMode, readEvaluationRubric } from '$lib/evaluationModes';
import type { RepoConfig } from '$lib/types';

export const load: PageServerLoad = async ({ url }) => {
  const mode = parseEvaluationMode(url.searchParams.get('mode'));
  const repos: RepoConfig[] = await readRepoConfig();
  const scores = storage().getScoresStore(mode);
  const scoreHistory = storage().getScoreHistoryStore(mode);

  const { definition: rubricDefinition } = await readEvaluationRubric(mode);
  const rubric = {
    version: rubricDefinition.version,
    totalScore: rubricDefinition.totalScore,
    categories: rubricDefinition.categories,
    bands: rubricDefinition.bands,
    categoryLabels: rubricDefinition.categoryLabels
  };

  return { repos, scores, scoreHistory, rubric, mode, modeDefinition: evaluationModeDefinition(mode), modes: listEvaluationModes() };
};
