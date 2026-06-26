import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRepo } from './scanner';

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
});
