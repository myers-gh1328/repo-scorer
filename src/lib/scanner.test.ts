import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./duplication', () => ({ detectDuplication: vi.fn() }));

import { scanRepo } from './scanner';
import { detectDuplication } from './duplication';
import type { RuntimeSupportMatrix } from './reference/runtimeSupport';

describe('scanRepo', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-scan-'));
  });

  it('returns empty files list for a repo with no relevant files', async () => {
    const result = await scanRepo(repoDir);
    expect(result.files).toHaveLength(0);
    expect(result.evidence.hasRootGuidance).toBe(false);
    expect(result.evidence.hasFormalSkills).toBe(false);
  });

  it('collects AGENTS.md when present', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide\n\nSetup: npm install');

    const result = await scanRepo(repoDir);

    const found = result.files.find(f => f.relativePath === 'AGENTS.md');
    expect(found).toBeDefined();
    expect(found!.content).toContain('Agent Guide');
    expect(result.evidence.hasRootGuidance).toBe(true);
  });

  it('caps file content at 8000 characters', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), 'x'.repeat(10_000));

    const result = await scanRepo(repoDir);

    const found = result.files.find(f => f.relativePath === 'AGENTS.md');
    expect(found!.content.length).toBe(8000);
  });

  it('collects files from .cursor/rules directory', async () => {
    await mkdir(join(repoDir, '.cursor', 'rules'), { recursive: true });
    await writeFile(join(repoDir, '.cursor', 'rules', 'backend.mdc'), '# Backend rules');

    const result = await scanRepo(repoDir);

    const found = result.files.find(f => f.relativePath.includes('.cursor/rules'));
    expect(found).toBeDefined();
    expect(found!.content).toContain('Backend rules');
  });

  it('collects files from .github/workflows directory', async () => {
    await mkdir(join(repoDir, '.github', 'workflows'), { recursive: true });
    await writeFile(join(repoDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: push');

    const result = await scanRepo(repoDir);

    const found = result.files.find(f => f.relativePath.includes('workflows'));
    expect(found).toBeDefined();
    expect(result.evidence.hasCiWorkflow).toBe(true);
    expect(result.evidence.hasPushOrPrCi).toBe(true);
  });

  it('skips non-relevant file extensions', async () => {
    await writeFile(join(repoDir, 'image.png'), 'binary');
    await writeFile(join(repoDir, 'binary.exe'), 'binary');

    const result = await scanRepo(repoDir);
    expect(result.files).toHaveLength(0);
  });

  it('collects multiple root-level guidance files', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), 'agents');
    await writeFile(join(repoDir, 'CLAUDE.md'), 'claude');
    await writeFile(join(repoDir, 'README.md'), 'readme');

    const result = await scanRepo(repoDir);
    expect(result.files.length).toBeGreaterThanOrEqual(3);
  });

  it('detects recipe-like docs without counting them as formal skills', async () => {
    await mkdir(join(repoDir, 'docs', 'agent'), { recursive: true });
    await writeFile(join(repoDir, 'AGENTS.md'), 'agents');
    await writeFile(join(repoDir, 'docs', 'agent', 'TASK_RECIPES.md'), 'repeatable workflows');

    const result = await scanRepo(repoDir);

    expect(result.evidence.recipeLikeDocs).toContain('docs/agent/TASK_RECIPES.md');
    expect(result.evidence.skillFiles).toEqual([]);
    expect(result.evidence.hasFormalSkills).toBe(false);
  });

  it('detects formal SKILL.md files outside ignored directories', async () => {
    await mkdir(join(repoDir, '.agent', 'skills', 'rubric-update'), { recursive: true });
    await mkdir(join(repoDir, '.agents', 'skills', 'repo-review'), { recursive: true });
    await mkdir(join(repoDir, 'node_modules', 'fake-skill'), { recursive: true });
    await writeFile(join(repoDir, '.agent', 'skills', 'rubric-update', 'SKILL.md'), '# Rubric Update');
    await writeFile(join(repoDir, '.agents', 'skills', 'repo-review', 'SKILL.md'), '# Repo Review');
    await writeFile(join(repoDir, 'node_modules', 'fake-skill', 'SKILL.md'), '# Ignore me');

    const result = await scanRepo(repoDir);

    expect(result.evidence.skillFiles).toEqual([
      '.agent/skills/rubric-update/SKILL.md',
      '.agents/skills/repo-review/SKILL.md'
    ]);
    expect(result.evidence.hasFormalSkills).toBe(true);
  });

  it('detects workflow_dispatch-only CI as manual-only', async () => {
    await mkdir(join(repoDir, '.github', 'workflows'), { recursive: true });
    await writeFile(join(repoDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non:\n  workflow_dispatch:\n');

    const result = await scanRepo(repoDir);

    expect(result.evidence.workflowTriggers).toContain('workflow_dispatch');
    expect(result.evidence.hasCiWorkflow).toBe(true);
    expect(result.evidence.hasPushOrPrCi).toBe(false);
    expect(result.evidence.hasManualOnlyCi).toBe(true);
  });

  it('detects push and pull_request CI trigger forms', async () => {
    await mkdir(join(repoDir, '.github', 'workflows'), { recursive: true });
    await writeFile(join(repoDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: [push, pull_request]\n');

    const result = await scanRepo(repoDir);

    expect(result.evidence.workflowTriggers).toEqual(['pull_request', 'push']);
    expect(result.evidence.hasPushOrPrCi).toBe(true);
    expect(result.evidence.hasManualOnlyCi).toBe(false);
  });

  it('detects MCP manifests', async () => {
    await writeFile(join(repoDir, '.mcp.json'), '{}');

    const result = await scanRepo(repoDir);

    expect(result.evidence.mcpManifestFiles).toEqual(['.mcp.json']);
    expect(result.evidence.hasMcpManifest).toBe(true);
  });

  it('detects hook files and lockfiles', async () => {
    await mkdir(join(repoDir, '.codex', 'hooks'), { recursive: true });
    await writeFile(join(repoDir, '.codex', 'hooks', 'hooks.json'), '{}');
    await writeFile(join(repoDir, 'Cargo.lock'), '# lock');

    const result = await scanRepo(repoDir);

    expect(result.evidence.hookFiles).toContain('.codex/hooks/hooks.json');
    expect(result.evidence.lockfiles).toContain('Cargo.lock');
  });

  it('detects maintainability evidence conservatively', async () => {
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await mkdir(join(repoDir, 'infra'), { recursive: true });
    await mkdir(join(repoDir, '.github', 'workflows'), { recursive: true });
    await writeFile(join(repoDir, '.gitignore'), 'node_modules\n');
    await writeFile(join(repoDir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'vitest --run',
        check: 'svelte-check'
      },
      engines: { node: '>=20' }
    }));
    await writeFile(join(repoDir, 'src', 'thing.test.ts'), 'expect(true).toBe(true)');
    await writeFile(join(repoDir, 'infra', 'main.tf'), 'resource "azurerm_resource_group" "main" {}');
    await writeFile(join(repoDir, '.github', 'workflows', 'deploy.yml'), 'steps:\n  - run: terraform validate\n');
    await writeFile(join(repoDir, 'service.credentials.json'), '{"client_secret":"abcdefghijklmnopqrstuvwxyz"}');

    const result = await scanRepo(repoDir);

    expect(result.evidence.hasAutomatedTests).toBe(true);
    expect(result.evidence.testFiles).toContain('src/thing.test.ts');
    expect(result.evidence.testScripts).toContain('package.json:test=vitest --run');
    expect(result.evidence.validationScripts).toContain('package.json:check=svelte-check');
    expect(result.evidence.hasGitignore).toBe(true);
    expect(result.evidence.iacFiles).toContain('infra/main.tf');
    expect(result.evidence.iacValidationCommands).toContain('.github/workflows/deploy.yml: terraform validate');
    expect(result.evidence.cloudDeploymentFiles).toContain('infra/main.tf');
    expect(result.evidence.runtimeFiles).toContain('package.json');
    expect(result.evidence.hasCommittedSecretRisk).toBe(true);
    expect(result.evidence.secretRiskFiles).toContain('service.credentials.json');
  });

  it('uses checked-in runtime support data to flag unsupported runtime versions', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2026-06-26',
      expiryDays: 60,
      sources: ['official'],
      entries: [{
        ecosystem: 'node',
        versions: [
          { major: '20', supported: false },
          { major: '24', supported: true }
        ]
      }]
    };
    await writeFile(join(repoDir, 'package.json'), JSON.stringify({
      engines: { node: '20.x' }
    }));

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.eolRuntimeRisks).toEqual(['package.json engines.node references unsupported Node.js 20']);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(false);
  });

  it('uses common version files and Docker images for runtime support evidence', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2026-06-26',
      expiryDays: 60,
      sources: ['official'],
      entries: [
        {
          ecosystem: 'node',
          versions: [
            { major: '20', supported: false },
            { major: '24', supported: true }
          ]
        },
        {
          ecosystem: 'python',
          versions: [
            { majorMinor: '3.9', supported: false },
            { majorMinor: '3.13', supported: true }
          ]
        },
        {
          ecosystem: 'dotnet',
          versions: [
            { major: '7', supported: false },
            { major: '10', supported: true }
          ]
        }
      ]
    };
    await writeFile(join(repoDir, '.nvmrc'), '24\n');
    await writeFile(join(repoDir, 'Dockerfile'), [
      'FROM python:3.9-slim',
      'FROM mcr.microsoft.com/dotnet/aspnet:10.0'
    ].join('\n'));

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.supportedRuntimeFiles).toEqual(['.nvmrc', 'Dockerfile']);
    expect(result.evidence.eolRuntimeRisks).toEqual(['Dockerfile base image python:3.9-slim references unsupported Python 3.9']);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(false);
  });

  it('does not treat unknown runtime posture as supported', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2026-06-26',
      expiryDays: 60,
      sources: ['official'],
      entries: [{
        ecosystem: 'node',
        versions: [
          { major: '24', supported: true }
        ]
      }]
    };
    await writeFile(join(repoDir, '.node-version'), '25\n');

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.unknownRuntimeVersionFiles).toEqual(['.node-version']);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(false);
  });

  it('does not treat mixed supported and unknown runtime posture as supported', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2026-06-26',
      expiryDays: 60,
      sources: ['official'],
      entries: [{
        ecosystem: 'node',
        versions: [
          { major: '24', supported: true }
        ]
      }]
    };
    await writeFile(join(repoDir, '.nvmrc'), '24\n');
    await writeFile(join(repoDir, 'Dockerfile'), 'FROM node:25\n');

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.supportedRuntimeFiles).toEqual(['.nvmrc']);
    expect(result.evidence.unknownRuntimeVersionFiles).toEqual(['Dockerfile']);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(false);
  });

  it('treats supported runtime posture as supported when no risks or unknowns exist', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2026-06-26',
      expiryDays: 60,
      sources: ['official'],
      entries: [{
        ecosystem: 'node',
        versions: [
          { major: '24', supported: true }
        ]
      }]
    };
    await writeFile(join(repoDir, '.nvmrc'), '24\n');

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.supportedRuntimeFiles).toEqual(['.nvmrc']);
    expect(result.evidence.unknownRuntimeVersionFiles).toEqual([]);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(true);
  });

  it('does not treat stale reference data as supported runtime posture', async () => {
    const matrix: RuntimeSupportMatrix = {
      version: 'test',
      lastUpdated: '2020-01-01',
      expiryDays: 30,
      sources: ['official'],
      entries: [{
        ecosystem: 'node',
        versions: [
          { major: '24', supported: true }
        ]
      }]
    };
    await writeFile(join(repoDir, '.nvmrc'), '24\n');

    const result = await scanRepo(repoDir, matrix);

    expect(result.evidence.supportedRuntimeFiles).toEqual(['.nvmrc']);
    expect(result.evidence.runtimeReferenceDataStale).toBe(true);
    expect(result.evidence.hasSupportedCoreRuntime).toBe(false);
  });
});

describe('scanRepo duplication evidence', () => {
  let repoDir: string;

  beforeEach(async () => {
    vi.mocked(detectDuplication).mockReset();
    repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-dup-'));
  });

  it('does not run the duplication check unless asked', async () => {
    const result = await scanRepo(repoDir);

    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
    expect(result.evidence.duplicationStatus).toBeUndefined();
  });

  it('adds measured duplication evidence when enabled', async () => {
    vi.mocked(detectDuplication).mockResolvedValue({
      status: 'measured',
      percentage: 5.15,
      cloneCount: 44,
      duplicatedLines: 300,
      topPairs: ['src/a.ts:1-20 <-> src/b.ts:5-24 (20 lines)']
    });

    const result = await scanRepo(repoDir, undefined, { duplication: true });

    expect(vi.mocked(detectDuplication)).toHaveBeenCalledWith(repoDir);
    expect(result.evidence).toMatchObject({
      duplicationStatus: 'measured',
      duplicationPercentage: 5.15,
      duplicationCloneCount: 44,
      duplicationDuplicatedLines: 300,
      duplicationTopPairs: ['src/a.ts:1-20 <-> src/b.ts:5-24 (20 lines)']
    });
  });

  it('records unavailable duplication as neutral evidence', async () => {
    vi.mocked(detectDuplication).mockResolvedValue({ status: 'unavailable' });

    const result = await scanRepo(repoDir, undefined, { duplication: true });

    expect(result.evidence.duplicationStatus).toBe('unavailable');
    expect(result.evidence.duplicationPercentage).toBeUndefined();
  });
});
