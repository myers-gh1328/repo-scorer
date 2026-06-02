import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./mlxClient', () => ({ callMLX: vi.fn() }));

import { parseScoreResult, scoreRepo } from './scorer';
import { callMLX } from './mlxClient';

const mockResult = {
  score: 72,
  band: 'Operational',
  primaryLanguage: 'TypeScript',
  categories: {
    persistent_guidance: 12, scoped_rules: 7, skills: 7, specialized_agents: 7,
    tool_manifests_mcp: 7, validation_reproducibility: 7, ci_pr_automation: 7,
    security_sandboxing_hooks: 7, domain_context: 4, governance_observability: 3,
    versioning_provenance: 2, onboarding_discoverability: 2
  },
  qualityFlags: ['Good AGENTS.md'],
  riskFlags: ['No CI'],
  recommendations: ['Add CI workflow']
};

describe('scoreRepo', () => {
  let repoDir: string;
  let tmpDir: string;
  let scoresPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    repoDir = await mkdtemp(join(tmpdir(), 'scorer-repo-'));
    tmpDir = await mkdtemp(join(tmpdir(), 'scorer-out-'));
    scoresPath = join(tmpDir, 'scores.json');
    vi.mocked(callMLX).mockResolvedValue(JSON.stringify(mockResult));
  });

  it('returns a ScoreResult with scoredAt populated', async () => {
    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(72);
    expect(result.band).toBe('Operational');
    expect(new Date(result.scoredAt).getTime()).toBeGreaterThan(0);
  });

  it('writes the result to scores.json under the repo name', async () => {
    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.myrepo.score).toBe(72);
  });

  it('preserves existing scores for other repos', async () => {
    await writeFile(scoresPath, JSON.stringify({ otherapp: { score: 50 } }));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.otherapp.score).toBe(50);
    expect(stored.myrepo.score).toBe(72);
  });

  it('throws MLX_UNREACHABLE when the MLX call fails', async () => {
    vi.mocked(callMLX).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('MLX_UNREACHABLE');
  });

  it('retries once on malformed JSON and succeeds on second call', async () => {
    vi.mocked(callMLX)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify(mockResult));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(72);
    expect(vi.mocked(callMLX)).toHaveBeenCalledTimes(2);
  });

  it('throws PARSE_FAILED when both attempts return malformed JSON', async () => {
    vi.mocked(callMLX).mockResolvedValue('not valid json');

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('PARSE_FAILED');
  });

  it('asks the model to repair malformed output on retry', async () => {
    vi.mocked(callMLX)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify(mockResult));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    expect(vi.mocked(callMLX).mock.calls[1][1]).toContain('Convert the text below into one valid JSON object');
    expect(vi.mocked(callMLX).mock.calls[1][1]).toContain('not valid json');
  });
});

describe('parseScoreResult', () => {
  it('parses raw JSON', () => {
    expect(parseScoreResult(JSON.stringify(mockResult)).score).toBe(72);
  });

  it('parses fenced JSON', () => {
    const raw = `\`\`\`json\n${JSON.stringify(mockResult)}\n\`\`\``;
    expect(parseScoreResult(raw).band).toBe('Operational');
  });

  it('extracts the first complete JSON object from surrounding text', () => {
    const raw = `Here is the score:\n${JSON.stringify(mockResult)}\nDone.`;
    expect(parseScoreResult(raw).primaryLanguage).toBe('TypeScript');
  });

  it('normalizes numeric strings and recomputes score and band from categories', () => {
    const raw = JSON.stringify({
      ...mockResult,
      score: 999,
      band: 'Mature',
      categories: {
        ...mockResult.categories,
        persistent_guidance: '12'
      }
    });

    const result = parseScoreResult(raw);

    expect(result.categories.persistent_guidance).toBe(12);
    expect(result.score).toBe(72);
    expect(result.band).toBe('Operational');
  });

  it('defaults optional string arrays when the model omits them', () => {
    const { qualityFlags, riskFlags, recommendations, ...withoutArrays } = mockResult;

    const result = parseScoreResult(JSON.stringify(withoutArrays));

    expect(result.qualityFlags).toEqual([]);
    expect(result.riskFlags).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it('clamps category values to their allowed ranges', () => {
    const raw = JSON.stringify({
      ...mockResult,
      categories: {
        ...mockResult.categories,
        persistent_guidance: 999,
        versioning_provenance: -5
      }
    });

    const result = parseScoreResult(raw);

    expect(result.categories.persistent_guidance).toBe(15);
    expect(result.categories.versioning_provenance).toBe(0);
  });

  it('rejects responses missing the categories object', () => {
    expect(() => parseScoreResult(JSON.stringify({ score: 10 }))).toThrow('categories');
  });
});
