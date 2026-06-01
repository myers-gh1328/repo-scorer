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
    } catch {
      throw new Error('MLX_UNREACHABLE');
    }
    try {
      result = JSON.parse(raw2);
    } catch {
      throw new Error('PARSE_FAILED');
    }
  }

  // Default array fields in case the LLM omits them
  result.qualityFlags = result.qualityFlags ?? [];
  result.riskFlags = result.riskFlags ?? [];
  result.recommendations = result.recommendations ?? [];
  result.scoredAt = new Date().toISOString();

  let scores: ScoresStore = {};
  try {
    scores = JSON.parse(await readFile(scoresPath, 'utf-8'));
  } catch {
    // file missing or corrupt — start fresh
  }
  scores[name] = result;
  await writeFile(scoresPath, JSON.stringify(scores, null, 2));

  return result;
}
