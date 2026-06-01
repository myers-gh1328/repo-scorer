import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { scoreRepo } from '$lib/scorer';

const SCORES_PATH = 'scores.json';
const RUBRIC_PATH = 'rubric.md';

export const POST: RequestHandler = async ({ request }) => {
  const { name, path } = await request.json() as { name: string; path: string };

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
