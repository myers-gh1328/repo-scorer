import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { scanRepo } from './scanner';
import { buildPrompt } from './promptBuilder';
import { callMLX } from './mlxClient';
import type { MLXConfig, ScoreResult, ScoresStore } from './types';

export async function scoreRepo(
  name: string,
  repoPath: string,
  rubric: string,
  mlxConfig: MLXConfig,
  scoresPath: string
): Promise<ScoreResult> {
  const scan = await scanRepo(repoPath);
  const prompt = buildPrompt(rubric, scan);

  let raw: string;
  try {
    raw = await callMLX(mlxConfig, prompt);
  } catch {
    throw new Error('MLX_UNREACHABLE');
  }

  let result: ScoreResult;
  try {
    result = JSON.parse(raw);
  } catch {
    let raw2: string;
    try {
      raw2 = await callMLX(mlxConfig, prompt);
      result = JSON.parse(raw2);
    } catch {
      throw new Error('PARSE_FAILED');
    }
  }

  result.scoredAt = new Date().toISOString();

  let scores: ScoresStore = {};
  if (existsSync(scoresPath)) {
    scores = JSON.parse(await readFile(scoresPath, 'utf-8'));
  }
  scores[name] = result;
  await writeFile(scoresPath, JSON.stringify(scores, null, 2));

  return result;
}
