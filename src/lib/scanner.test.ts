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
  });

  it('collects AGENTS.md when present', async () => {
    await writeFile(join(repoDir, 'AGENTS.md'), '# Agent Guide\n\nSetup: npm install');

    const result = await scanRepo(repoDir);

    const found = result.files.find(f => f.relativePath === 'AGENTS.md');
    expect(found).toBeDefined();
    expect(found!.content).toContain('Agent Guide');
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
});
