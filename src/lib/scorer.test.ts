import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./llmClient', () => ({ callLLM: vi.fn() }));
vi.mock('./duplication', () => ({ detectDuplication: vi.fn().mockResolvedValue({ status: 'unavailable' }) }));

import { scoreRepo, type ScoreRepoOptions } from './scorer';
import { callLLM } from './llmClient';
import { detectDuplication } from './duplication';
import { loadRubricDefinition, type RubricDefinition } from './rubricSchema';
import { resetStorageForTests, storage } from './server/storage';
import { plainRubricGuidance, resolveRubricGuidance } from './rubricGuidance';

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

const llmConfig = { baseUrl: 'http://localhost:8080' };
const categoryResponse = (score: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ score, evidence: [], gaps: [], ...extra });

let repoDir: string;
let dataDir: string;

function options(overrides: Partial<ScoreRepoOptions> = {}): ScoreRepoOptions {
  return {
    name: 'myrepo',
    repoPath: repoDir,
    guidance: plainRubricGuidance('TINY RUBRIC TEXT'),
    rubricDefinition: tinyRubric,
    llmConfig,
    ...overrides
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  repoDir = await mkdtemp(join(tmpdir(), 'scorer-repo-'));
  dataDir = await mkdtemp(join(tmpdir(), 'scorer-data-'));
  process.env.REPO_SCORER_DATA_DIR = dataDir;
  process.env.REPO_SCORER_DB_PATH = join(dataDir, 'repo-scorer.sqlite');
  resetStorageForTests();
  storage().addRepo({ name: 'myrepo', path: repoDir });
  vi.mocked(callLLM).mockResolvedValue(categoryResponse(3));
});

afterEach(async () => {
  resetStorageForTests();
  delete process.env.REPO_SCORER_DATA_DIR;
  delete process.env.REPO_SCORER_DB_PATH;
  await rm(repoDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

describe('scoreRepo', () => {
  it('runs the duplication check only for maintainability scoring', async () => {
    await scoreRepo(options());
    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();

    await scoreRepo(options({ evaluationMode: 'maintainability' }));
    expect(vi.mocked(detectDuplication)).toHaveBeenCalledWith(repoDir);
  });

  it('returns a ScoreResult with scoredAt and metadata populated', async () => {
    const result = await scoreRepo(options({ metadata: { scannerEvidenceVersion: 'test-scanner' } }));

    expect(result.score).toBe(6);
    expect(result.evaluationMode).toBe('ai-readiness');
    expect(result.scannerEvidenceVersion).toBe('test-scanner');
    expect(new Date(result.scoredAt).getTime()).toBeGreaterThan(0);
  });

  it('persists the score and history to storage per evaluation mode', async () => {
    await scoreRepo(options());
    vi.mocked(callLLM).mockResolvedValue(categoryResponse(1));
    await scoreRepo(options({ evaluationMode: 'maintainability' }));

    expect(storage().getScore('myrepo')).toMatchObject({ score: 6, finalScore: 6 });
    expect(storage().getScore('myrepo', 'maintainability')).toMatchObject({ score: 2 });
    expect(storage().getScoreHistory('myrepo')?.compact).toHaveLength(1);
    expect(storage().getScoreHistory('myrepo')?.compact[0]).toMatchObject({ finalScore: 6, finalBand: 'High' });
  });

  it('throws LLM_UNREACHABLE when the LLM call fails', async () => {
    vi.mocked(callLLM).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(scoreRepo(options())).rejects.toThrow('LLM_UNREACHABLE: ECONNREFUSED');
    expect(storage().getScore('myrepo')).toBeNull();
  });

  it('asks the model to repair malformed category output and uses the repaired result', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(categoryResponse(5))
      .mockResolvedValueOnce(categoryResponse(3));

    const result = await scoreRepo(options());

    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Convert the text below into one valid JSON object for category "alpha"');
    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('not valid json');
    expect(result.categories).toEqual({ alpha: 5, beta: 3 });
  });

  it('throws PARSE_FAILED when the repair attempt is also malformed', async () => {
    vi.mocked(callLLM).mockResolvedValue('not valid json');

    await expect(scoreRepo(options())).rejects.toThrow('PARSE_FAILED');
  });

  it('applies evidence caps from the real rubric and records them', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent guide');
    const definition = loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
    vi.mocked(callLLM).mockImplementation(async (_config, prompt) => {
      const key = /^Key: (\S+)$/m.exec(prompt)?.[1] ?? '';
      return categoryResponse(definition.categoryMax[key] ?? 0);
    });

    const result = await scoreRepo(options({ rubricDefinition: definition, guidance: resolveRubricGuidance(await readFile('rubric.md', 'utf-8'), definition) }));

    expect(result.rawCategories?.skills).toBe(definition.categoryMax.skills);
    expect(result.categories.skills).toBe(4);
    expect(result.categories.ci_pr_automation).toBe(3);
    expect(result.appliedCaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'skills', cappedScore: 4 }),
      expect.objectContaining({ category: 'ci_pr_automation', cappedScore: 3 })
    ]));
    expect(storage().getScore('myrepo')?.appliedCaps).toEqual(result.appliedCaps);
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

    const result = await scoreRepo(options());

    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callLLM).mock.calls[0][1]).toContain('Alpha quality');
    expect(vi.mocked(callLLM).mock.calls[1][1]).toContain('Beta quality');
    expect(result.categories).toEqual({ alpha: 5, beta: 3 });
    expect(result.score).toBe(8);
    expect(result.band).toBe('High');
    expect(result.categoryRationales?.alpha?.gaps).toEqual(['Needs sharper validation guidance']);
  });

  it('uses schema response formatting for per-category scoring when enabled', async () => {
    await scoreRepo(options({
      llmConfig: {
        ...llmConfig,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'full_score', schema: {} }
        }
      }
    }));

    expect(vi.mocked(callLLM).mock.calls[0][0].responseFormat?.json_schema.name).toBe('category_score_alpha');
    expect(vi.mocked(callLLM).mock.calls[1][0].responseFormat?.json_schema.name).toBe('category_score_beta');
  });

  it('prioritizes category-relevant evidence before unrelated files', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide');
    await writeFile(join(repoDir, 'README.md'), '# Readme');

    await scoreRepo(options());

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

    const result = await scoreRepo(options({ rubricDefinition: matureRubric }));
    const stored = storage().getScore('myrepo');

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
    expect(stored?.rubricVersion).toBe('test-mature');
    expect(stored?.finalScore).toBe(89);
  });

  it('attaches cloud and local profile scores computed from the final categories', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), 'y'.repeat(8_000));
    const definition = loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({ score: 999, evidence: ['AGENTS.md'], gaps: [] }));

    const result = await scoreRepo(options({
      rubricDefinition: definition,
      guidance: resolveRubricGuidance(await readFile('rubric.md', 'utf-8'), definition),
      guidanceTool: 'generic'
    }));

    expect(result.resultVersion).toBe(3);
    expect(result.rubricVersion).toBe('2.1');
    expect(Object.keys(result.profileScores ?? {})).toEqual(['cloud', 'local-medium', 'local-small', 'local-tiny']);
    expect(result.profileScores?.cloud.score).toBe(result.score);
    expect(result.profileScores?.['local-medium'].guidanceBudget).toMatchObject({ estimatedTokens: 2000, withinBudget: true });
    expect(result.profileScores?.['local-tiny'].guidanceBudget).toMatchObject({ estimatedTokens: 2000, factor: 0.5 });
  });

  describe('rubric guidance and context budget', () => {
    async function realOptions(llm: Partial<ScoreRepoOptions['llmConfig']> = {}) {
      const definition = loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
      const guidance = resolveRubricGuidance(await readFile('rubric.md', 'utf-8'), definition);
      return options({ rubricDefinition: definition, guidance, llmConfig: { ...llmConfig, ...llm } });
    }

    it('sends the full rubric to every category when the context window is unknown', async () => {
      const result = await scoreRepo(await realOptions());

      for (const [, prompt] of vi.mocked(callLLM).mock.calls) {
        expect(prompt).toContain('The complete rubric follows');
      }
      expect(result.promptContext).toMatchObject({ contextSource: 'unknown', evidenceTrimmed: [] });
      expect(new Set(Object.values(result.promptContext?.levels ?? {}))).toEqual(new Set(['full']));
    });

    it('sends the full rubric when a large window fits it', async () => {
      const result = await scoreRepo(await realOptions({ contextTokens: 128_000, contextSource: 'catalog', maxTokens: 4096 }));

      expect(new Set(Object.values(result.promptContext?.levels ?? {}))).toEqual(new Set(['full']));
      expect(result.promptContext).toMatchObject({ contextTokens: 128_000, contextSource: 'catalog' });
    });

    it('steps down to category excerpts only when the full rubric does not fit', async () => {
      const result = await scoreRepo(await realOptions({ contextTokens: 16_000, contextSource: 'setting', maxTokens: 4096 }));

      expect(new Set(Object.values(result.promptContext?.levels ?? {}))).toEqual(new Set(['category']));
      const prompt = vi.mocked(callLLM).mock.calls[0][1];
      expect(prompt).not.toContain('The complete rubric follows');
      expect(prompt).toContain('#### Persistent guidance');
    });

    it('steps down to compact excerpts for very small windows', async () => {
      const result = await scoreRepo(await realOptions({ contextTokens: 6_000, contextSource: 'setting', maxTokens: 2048 }));

      // Each category gets the richest level that fits: small excerpts still fit whole, large ones step down.
      expect(result.promptContext?.levels.persistent_guidance).toBe('compact');
      expect(result.promptContext?.levels.onboarding_discoverability).toBe('category');
      expect(Object.values(result.promptContext?.levels ?? {})).not.toContain('full');
    });

    it('trims evidence only after the smallest rubric level still does not fit', async () => {
      await writeFile(join(repoDir, 'AGENTS.md'), `# Agent guide\n${'Use npm test. '.repeat(4_000)}`);

      const result = await scoreRepo(await realOptions({ contextTokens: 6_000, contextSource: 'setting', maxTokens: 2048 }));

      expect(result.promptContext?.evidenceTrimmed).toContain('persistent_guidance');
      expect(result.promptContext?.levels.persistent_guidance).toBe('minimal');
    });

    it('steps down a level when the server rejects a prompt as too long', async () => {
      vi.mocked(callLLM)
        .mockRejectedValueOnce(new Error("LLM returned 400: This model's maximum context length is 8192 tokens"))
        .mockResolvedValue(categoryResponse(3));

      const result = await scoreRepo(await realOptions());

      expect(result.promptContext?.levels.persistent_guidance).toBe('category');
      expect(result.promptContext?.levels.scoped_rules).toBe('full');
      expect(vi.mocked(callLLM).mock.calls[0][1]).toContain('The complete rubric follows');
      expect(vi.mocked(callLLM).mock.calls[1][1]).not.toContain('The complete rubric follows');
    });

    it('still reports other LLM errors as unreachable without stepping down', async () => {
      vi.mocked(callLLM).mockRejectedValue(new Error('LLM returned 400: invalid model'));

      await expect(scoreRepo(await realOptions())).rejects.toThrow('LLM_UNREACHABLE: LLM returned 400: invalid model');
      expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(1);
    });
  });
});
