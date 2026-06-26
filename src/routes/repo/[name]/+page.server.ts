import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { readRepoConfig } from '$lib/server/repoConfig';
import { storage } from '$lib/server/storage';
import { evaluationModeDefinition, listEvaluationModes, parseEvaluationMode, readEvaluationRubric } from '$lib/evaluationModes';
import type { RepoConfig } from '$lib/types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { name } = params;
  const mode = parseEvaluationMode(url.searchParams.get('mode'));

  const repos: RepoConfig[] = await readRepoConfig();
  const repo = repos.find(r => r.name === name);

  if (!repo) {
    throw error(404, `Repo "${name}" not found in repos.config.json`);
  }

  const result = storage().getScore(name, mode);
  const improvementPlan = storage().getImprovementPlan(name, mode);
  const scoreHistory = storage().getScoreHistory(name, mode);

  const { definition: rubricDefinition } = await readEvaluationRubric(mode);
  const rubric = {
    version: rubricDefinition.version,
    totalScore: rubricDefinition.totalScore,
    categories: rubricDefinition.categories,
    bands: rubricDefinition.bands,
    categoryLabels: rubricDefinition.categoryLabels
  };

  return { name, repoPath: repo.path, result, improvementPlan, scoreHistory, rubric, mode, modeDefinition: evaluationModeDefinition(mode), modes: listEvaluationModes() };
};
