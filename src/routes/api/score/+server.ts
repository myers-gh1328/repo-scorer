import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readAppSettings } from '$lib/server/appSettings';
import { readRepoConfig } from '$lib/server/repoConfig';
import { scoreRepo } from '$lib/scorer';
import { scoreResponseFormat } from '$lib/responseSchemas';
import { readRubricDefinition } from '$lib/rubricSchema';
import { beginScoring, finishScoring } from '$lib/server/scoreConcurrency';
import type { RepoConfig } from '$lib/types';

const RUBRIC_PATH = 'rubric.md';
const RUBRIC_SCHEMA_PATH = 'rubric.schema.json';

export const POST: RequestHandler = async ({ request }) => {
  let name: string;
  let path: string;
  try {
    const body = await request.json();
    name = body?.name;
    path = body?.path;
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }

  if (!name || typeof name !== 'string' || !path || typeof path !== 'string') {
    throw error(400, 'Request body must include name and path strings');
  }

  // Validate path is in the configured repo list to prevent arbitrary filesystem access
  const configs: RepoConfig[] = await readRepoConfig();
  if (!configs.some(r => r.name === name && r.path === path)) {
    throw error(400, `Repo "${name}" not found in repos.config.json`);
  }

  if (!existsSync(path)) {
    throw error(400, `Repo path not found: ${path}`);
  }

  if (!beginScoring(name)) {
    throw error(409, `Repo "${name}" is already being scored`);
  }

  try {
    let rubric: string;
    rubric = await readFile(RUBRIC_PATH, 'utf-8');

    const { llmBaseUrl, llmModel, useJsonSchema } = await readAppSettings();

    const rubricDefinition = await readRubricDefinition(RUBRIC_SCHEMA_PATH);
    const result = await scoreRepo(name, path, rubric, {
      baseUrl: llmBaseUrl,
      model: llmModel,
      maxTokens: 4096,
      responseFormat: useJsonSchema ? scoreResponseFormat : undefined
    }, undefined, rubricDefinition);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENOENT') && msg.includes(RUBRIC_PATH)) {
      throw error(500, 'rubric.md not found in project root');
    }
    if (msg.startsWith('LLM_UNREACHABLE')) {
      throw error(503, `LLM server unreachable: ${msg.replace(/^LLM_UNREACHABLE:?\s*/, '')}`);
    }
    if (msg === 'PARSE_FAILED') {
      throw error(500, 'Scoring failed — model response could not be parsed');
    }
    throw error(500, `Scoring failed: ${msg}`);
  } finally {
    finishScoring(name);
  }
};
