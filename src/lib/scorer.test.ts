import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./llmClient', () => ({ callLLM: vi.fn() }));
vi.mock('./duplication', () => ({ detectDuplication: vi.fn().mockResolvedValue({ status: 'unavailable' }) }));

import { parseScoreResult, scoreRepo } from './scorer';
import { callLLM } from './llmClient';
import { detectDuplication } from './duplication';
import { bandForScore } from './types';
import type { RubricDefinition } from './rubricSchema';

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

const tinyRubric: RubricDefinition = {
  version: 'test',
  totalScore: 10,
  categories: [
    { key: 'alpha', label: 'Alpha', weight: 6, scannerSection: 'Agent guidance', evaluate: 'Alpha quality' },
    { key: 'beta', label: 'Beta', weight: 4, evaluate: 'Beta quality' }
  ],
  bands: [
    { label: 'Low', min: 0, max: 4 },
    { label: 'High', min: 5, max: 10 }
  ],
  totalWeight: 10,
  categoryMax: { alpha: 6, beta: 4 },
  categoryLabels: { alpha: 'Alpha', beta: 'Beta' },
  bandForScore(score: number) {
    return score >= 5 ? 'High' : 'Low';
  }
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
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify(mockResult));
  });

  it('runs the duplication check only for maintainability scoring', async () => {
    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath, undefined, undefined, 'maintainability');
    expect(vi.mocked(detectDuplication)).toHaveBeenCalledWith(repoDir);
  });

  it('returns a ScoreResult with scoredAt populated', async () => {
    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(63);
    expect(result.rawScore).toBe(72);
    expect(result.band).toBe('Operational');
    expect(new Date(result.scoredAt).getTime()).toBeGreaterThan(0);
  });

  it('writes the result to scores.json under the repo name', async () => {
    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.myrepo.score).toBe(63);
    expect(stored.myrepo.rawScore).toBe(72);
  });

  it('appends compact score history when a history path is provided', async () => {
    const historyPath = join(tmpDir, 'score-history.json');

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath, undefined, historyPath);

    const stored = JSON.parse(await readFile(historyPath, 'utf-8'));
    expect(stored.myrepo.compact).toHaveLength(1);
    expect(stored.myrepo.compact[0]).toMatchObject({
      finalScore: 63,
      finalBand: 'Operational',
      appliedCapCount: 3
    });
    expect(stored.myrepo.full).toHaveLength(1);
    expect(stored.myrepo.full[0].score).toBe(63);
  });

  it('preserves existing scores for other repos', async () => {
    await writeFile(scoresPath, JSON.stringify({ otherapp: { score: 50 } }));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.otherapp.score).toBe(50);
    expect(stored.myrepo.score).toBe(63);
  });

  it('preserves both results when different repos persist concurrently', async () => {
    await Promise.all([
      scoreRepo('repo-a', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath),
      scoreRepo('repo-b', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ]);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored['repo-a'].score).toBe(63);
    expect(stored['repo-b'].score).toBe(63);
  });

  it('throws LLM_UNREACHABLE when the LLM call fails', async () => {
    vi.mocked(callLLM).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('LLM_UNREACHABLE');
  });

  it('retries once on malformed JSON and succeeds on second call', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify(mockResult));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(63);
    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(2);
  });

  it('preserves rawCategories and records applied caps for inflated model scores', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent guide');
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({
      ...mockResult,
      categories: {
        ...mockResult.categories,
        skills: 10,
        ci_pr_automation: 10,
        tool_manifests_mcp: 10
      }
    }));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    expect(result.rawCategories?.skills).toBe(10);
    expect(result.categories.skills).toBe(4);
    expect(result.categories.ci_pr_automation).toBe(3);
    expect(result.categories.tool_manifests_mcp).toBe(5);
    expect(result.appliedCaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'skills', originalScore: 10, cappedScore: 4 }),
      expect.objectContaining({ category: 'ci_pr_automation', originalScore: 10, cappedScore: 3 }),
      expect.objectContaining({ category: 'tool_manifests_mcp', originalScore: 10, cappedScore: 5 })
    ]));

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.myrepo.rawCategories.skills).toBe(10);
    expect(stored.myrepo.appliedCaps).toHaveLength(3);
  });

  it('applies caps after repair retry succeeds', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify({
        ...mockResult,
        categories: {
          ...mockResult.categories,
          skills: 10
        }
      }));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    expect(result.rawCategories?.skills).toBe(10);
    expect(result.categories.skills).toBe(4);
  });

  it('throws PARSE_FAILED when both attempts return malformed JSON', async () => {
    vi.mocked(callLLM).mockResolvedValue('not valid json');

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('PARSE_FAILED');
  });

  it('asks the model to repair malformed output on retry', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify(mockResult));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Convert the text below into one valid JSON object');
    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('not valid json');
  });

  it('scores each rubric category separately and aggregates deterministically', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide');
    vi.mocked(callLLM)
      .mockResolvedValueOnce(JSON.stringify({
        score: 5,
        evidence: ['AGENTS.md'],
        gaps: ['Needs sharper validation guidance']
      }))
      .mockResolvedValueOnce(JSON.stringify({
        score: 3,
        evidence: ['.github/workflows/ci.yml'],
        gaps: []
      }));

    const result = await scoreRepo(
      'myrepo',
      repoDir,
      'rubric',
      { baseUrl: 'http://localhost:8080' },
      scoresPath,
      tinyRubric
    );

    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callLLM).mock.calls[0][1]).toContain('Alpha quality');
    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Beta quality');
    expect(result.categories).toEqual({ alpha: 5, beta: 3 });
    expect(result.score).toBe(8);
    expect(result.band).toBe('High');
    expect(result.categoryRationales?.alpha?.gaps).toEqual(['Needs sharper validation guidance']);
  });

  it('uses schema response formatting for per-category scoring when enabled', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce(JSON.stringify({ score: 5, evidence: [], gaps: [] }))
      .mockResolvedValueOnce(JSON.stringify({ score: 3, evidence: [], gaps: [] }));

    await scoreRepo(
      'myrepo',
      repoDir,
      'rubric',
      {
        baseUrl: 'http://localhost:8080',
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'full_score', schema: {} }
        }
      },
      scoresPath,
      tinyRubric
    );

    expect(vi.mocked(callLLM).mock.calls[0][0].responseFormat?.json_schema.name).toBe('category_score_alpha');
    expect(vi.mocked(callLLM).mock.calls[1][0].responseFormat?.json_schema.name).toBe('category_score_beta');
  });

  it('prioritizes category-relevant evidence before unrelated files', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide');
    await writeFile(join(repoDir, 'README.md'), '# Readme');
    vi.mocked(callLLM)
      .mockResolvedValueOnce(JSON.stringify({ score: 5, evidence: [], gaps: [] }))
      .mockResolvedValueOnce(JSON.stringify({ score: 3, evidence: [], gaps: [] }));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath, tinyRubric);

    const firstPrompt = vi.mocked(callLLM).mock.calls[0][1];
    expect(firstPrompt.indexOf('AGENTS.md')).toBeLessThan(firstPrompt.indexOf('README.md'));
  });

  it('applies consistency checks after evidence caps and persists staged scores', async () => {
    const matureRubric: RubricDefinition = {
      version: 'test-mature',
      totalScore: 100,
      categories: [
        { key: 'tool_manifests_mcp', label: 'Tools', weight: 100, evaluate: 'Tools' }
      ],
      bands: [
        { label: 'Managed', min: 0, max: 89 },
        { label: 'Mature', min: 90, max: 100 }
      ],
      caps: [],
      bandConstraints: [
        {
          band: 'Mature',
          check: 'has_tool_access_governance',
          category: 'tool_manifests_mcp',
          severity: 'high',
          requirement: 'Tool access is governed',
          maxBandOnFailure: 'Managed'
        }
      ],
      totalWeight: 100,
      categoryMax: { tool_manifests_mcp: 100 },
      categoryLabels: { tool_manifests_mcp: 'Tools' },
      bandForScore: score => score >= 90 ? 'Mature' : 'Managed'
    };
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({
      score: 94,
      evidence: ['Strong tool docs'],
      gaps: ['No MCP manifest found']
    }));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath, matureRubric);
    const stored = JSON.parse(await readFile(scoresPath, 'utf-8')).myrepo;

    expect(result.modelScore).toBe(94);
    expect(result.cappedScore).toBe(94);
    expect(result.finalScore).toBe(89);
    expect(result.score).toBe(89);
    expect(result.finalBand).toBe('Managed');
    expect(result.band).toBe('Managed');
    expect(result.consistencyChecks).toContainEqual(expect.objectContaining({
      id: 'has_tool_access_governance',
      passed: false
    }));
    expect(stored.rubricVersion).toBe('test-mature');
    expect(stored.finalScore).toBe(89);
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

  it('normalizes structured gap objects without using severity for score or band', () => {
    const raw = JSON.stringify({
      ...mockResult,
      categories: {
        ...mockResult.categories,
        tool_manifests_mcp: 9
      },
      categoryRationales: {
        tool_manifests_mcp: {
          score: 9,
          evidence: ['tool docs found'],
          gaps: [
            {
              description: 'No MCP manifest found',
              severity: 'blocking',
              evidenceNeeded: ['mcp.json']
            }
          ]
        }
      }
    });

    const result = parseScoreResult(raw);

    expect(result.categoryRationales?.tool_manifests_mcp?.gaps).toEqual(['No MCP manifest found']);
    expect(result.categoryRationales?.tool_manifests_mcp?.structuredGaps).toEqual([
      {
        description: 'No MCP manifest found',
        severity: 'blocking',
        evidenceNeeded: ['mcp.json']
      }
    ]);
    expect(result.band).toBe(bandForScore(result.score));
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
    expect(result.rawCategories?.persistent_guidance).toBe(12);
    expect(result.score).toBe(72);
    expect(result.band).toBe('Operational');
  });

  it('parses optional category rationales', () => {
    const result = parseScoreResult(JSON.stringify({
      ...mockResult,
      categoryRationales: {
        skills: {
          score: 7,
          evidence: ['docs/agent/TASK_RECIPES.md'],
          gaps: ['No SKILL.md files found']
        }
      }
    }));

    expect(result.categoryRationales?.skills?.evidence).toEqual(['docs/agent/TASK_RECIPES.md']);
    expect(result.categoryRationales?.skills?.gaps).toEqual(['No SKILL.md files found']);
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
