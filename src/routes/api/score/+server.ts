import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readAppSettings } from '$lib/server/appSettings';
import { readRepoConfig } from '$lib/server/repoConfig';
import { scoreRepo } from '$lib/scorer';
import type { RepoConfig } from '$lib/types';

const SCORES_PATH = 'scores.json';
const RUBRIC_PATH = 'rubric.md';

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

  let rubric: string;
  try {
    rubric = await readFile(RUBRIC_PATH, 'utf-8');
  } catch {
    throw error(500, 'rubric.md not found in project root');
  }

  const { mlxBaseUrl } = await readAppSettings();

  try {
    const result = await scoreRepo(name, path, rubric, { baseUrl: mlxBaseUrl }, SCORES_PATH);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('MLX_UNREACHABLE')) {
      throw error(503, `MLX server unreachable: ${msg.replace(/^MLX_UNREACHABLE:?\s*/, '')}`);
    }
    if (msg === 'PARSE_FAILED') {
      throw error(500, 'Scoring failed — model response could not be parsed');
    }
    throw error(500, `Scoring failed: ${msg}`);
  }
};
