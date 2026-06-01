import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
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
  let configs: RepoConfig[] = [];
  try {
    configs = JSON.parse(await readFile('repos.config.json', 'utf-8'));
  } catch {
    throw error(500, 'repos.config.json not found or invalid');
  }
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

  const mlxBaseUrl = env.MLX_BASE_URL ?? 'http://localhost:8080';

  try {
    const result = await scoreRepo(name, path, rubric, { baseUrl: mlxBaseUrl }, SCORES_PATH);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'MLX_UNREACHABLE') {
      throw error(503, 'MLX server unreachable — is it running?');
    }
    if (msg === 'PARSE_FAILED') {
      throw error(500, 'Scoring failed — model response could not be parsed');
    }
    throw error(500, `Scoring failed: ${msg}`);
  }
};
