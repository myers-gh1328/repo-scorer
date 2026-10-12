import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readAppSettings, readLlmApiKey } from '$lib/server/appSettings';
import { resolveContextWindow } from '$lib/server/modelContext';
import { readRepoConfig } from '$lib/server/repoConfig';
import { scoreRepo } from '$lib/scorer';
import { scoreResponseFormatForRubric } from '$lib/responseSchemas';
import { beginScoring, finishScoring } from '$lib/server/scoreConcurrency';
import { evaluationModeDefinition, parseEvaluationMode, readEvaluationRubric } from '$lib/evaluationModes';
import { readRuntimeSupportMatrix } from '$lib/reference/runtimeSupport';
import type { EvaluationMode, RepoConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
  let name: string;
  let path: string;
  let mode: EvaluationMode;
  try {
    const body = await request.json();
    name = body?.name;
    path = body?.path;
    mode = parseEvaluationMode(body?.mode);
  } catch {
    throw error(400, 'Request body must be valid JSON and include a supported evaluation mode when mode is provided');
  }

  if (!name || typeof name !== 'string' || !path || typeof path !== 'string') {
    throw error(400, 'Request body must include name and path strings');
  }

  // Validate path is in the configured repo list to prevent arbitrary filesystem access
  const configs: RepoConfig[] = await readRepoConfig();
  if (!configs.some(r => r.name === name && r.path === path)) {
    throw error(400, `Repo "${name}" is not a configured repo`);
  }

  if (!existsSync(path)) {
    throw error(400, `Repo path not found: ${path}`);
  }

  if (!beginScoring(name, mode)) {
    throw error(409, `Repo "${name}" is already being scored for ${mode}`);
  }

  try {
    const { definition: rubricDefinition, guidance } = await readEvaluationRubric(mode);
    const modeDefinition = evaluationModeDefinition(mode);
    const runtimeSupport = modeDefinition.referenceDataPath
      ? await readRuntimeSupportMatrix(modeDefinition.referenceDataPath)
      : null;

    const { llmBaseUrl, llmModel, useJsonSchema, aiTooling, llmContextTokens } = await readAppSettings();
    const apiKey = await readLlmApiKey();
    const contextWindow = await resolveContextWindow({ baseUrl: llmBaseUrl, model: llmModel, configuredTokens: llmContextTokens, apiKey });

    const result = await scoreRepo({
      name,
      repoPath: path,
      guidance,
      rubricDefinition,
      llmConfig: {
        baseUrl: llmBaseUrl,
        model: llmModel,
        maxTokens: 4096,
        apiKey,
        contextTokens: contextWindow.tokens,
        contextSource: contextWindow.source,
        responseFormat: useJsonSchema ? scoreResponseFormatForRubric(rubricDefinition) : undefined
      },
      evaluationMode: mode,
      guidanceTool: aiTooling,
      runtimeSupport: runtimeSupport ?? undefined,
      metadata: {
        scannerEvidenceVersion: '2026-10-11.1',
        ...(runtimeSupport ? {
          referenceDataVersion: runtimeSupport.version,
          referenceDataLastUpdated: runtimeSupport.lastUpdated
        } : {})
      }
    });
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENOENT')) {
      throw error(500, `Rubric file not found for ${mode}`);
    }
    if (msg.startsWith('LLM_UNREACHABLE')) {
      throw error(503, `LLM server unreachable: ${msg.replace(/^LLM_UNREACHABLE:?\s*/, '')}`);
    }
    if (msg === 'PARSE_FAILED') {
      throw error(500, 'Scoring failed — model response could not be parsed');
    }
    throw error(500, `Scoring failed: ${msg}`);
  } finally {
    finishScoring(name, mode);
  }
};
