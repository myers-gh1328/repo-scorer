import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./mlxClient', () => ({ callMLX: vi.fn() }));

import { scoreRepo } from './scorer';
import { callMLX } from './mlxClient';

const mockResult = {
  score: 72,
  band: 'Operational',
  primaryLanguage: 'TypeScript',
  categories: {
    persistent_guidance: 11, scoped_rules: 0, skills: 0, specialized_agents: 0,
    tool_manifests_mcp: 1, validation_reproducibility: 6, ci_pr_automation: 0,
    security_sandboxing_hooks: 1, domain_context: 4, governance_observability: 1,
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
});
