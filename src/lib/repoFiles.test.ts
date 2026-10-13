import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packageScripts, walkRepo } from './repoFiles';

describe('walkRepo', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'repo-scorer-walk-'));
    await mkdir(join(repoDir, 'a/b/c'), { recursive: true });
    await mkdir(join(repoDir, 'node_modules/pkg'), { recursive: true });
    await writeFile(join(repoDir, 'root.ts'), '');
    await writeFile(join(repoDir, 'a/one.ts'), '');
    await writeFile(join(repoDir, 'a/b/two.ts'), '');
    await writeFile(join(repoDir, 'a/b/c/three.ts'), '');
    await writeFile(join(repoDir, 'node_modules/pkg/index.js'), '');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  const paths = async (options: Parameters<typeof walkRepo>[1]) =>
    (await walkRepo(repoDir, options)).map(entry => `${entry.relativePath}${entry.isDirectory ? '/' : ''}`).sort();

  it('lists files and directories with repo-relative paths, skipping ignored directories', async () => {
    expect(await paths({ maxDepth: 10, ignoredDirs: new Set(['node_modules']) })).toEqual([
      'a/', 'a/b/', 'a/b/c/', 'a/b/c/three.ts', 'a/b/two.ts', 'a/one.ts', 'root.ts'
    ]);
  });

  it('stops descending past maxDepth', async () => {
    expect(await paths({ maxDepth: 1, ignoredDirs: new Set(['node_modules']) })).toEqual([
      'a/', 'a/b/', 'a/one.ts', 'root.ts'
    ]);
  });

  it('starts from startDir but keeps paths relative to the repo root', async () => {
    expect(await paths({ startDir: join(repoDir, 'a/b'), maxDepth: 5, ignoredDirs: new Set() })).toEqual([
      'a/b/c/', 'a/b/c/three.ts', 'a/b/two.ts'
    ]);
  });

  it('skips nested checkouts such as agent worktrees', async () => {
    await mkdir(join(repoDir, '.claude/worktrees/agent-a1/src'), { recursive: true });
    await writeFile(join(repoDir, '.claude/worktrees/agent-a1/.git'), 'gitdir: /elsewhere');
    await writeFile(join(repoDir, '.claude/worktrees/agent-a1/src/copy.ts'), '');
    expect(await paths({ maxDepth: 10, ignoredDirs: new Set(['node_modules', 'a']) })).toEqual([
      '.claude/', '.claude/worktrees/', 'root.ts'
    ]);
  });

  it('returns nothing for a missing start directory and honors the entry limit', async () => {
    expect(await walkRepo(repoDir, { startDir: join(repoDir, 'missing'), maxDepth: 5, ignoredDirs: new Set() })).toEqual([]);
    expect(await walkRepo(repoDir, { maxDepth: 10, ignoredDirs: new Set(), limit: 3 })).toHaveLength(3);
  });
});

describe('packageScripts', () => {
  it('returns string scripts and tolerates missing or invalid content', () => {
    expect(packageScripts('{"scripts":{"test":"vitest","check":"svelte-check","bad":1}}')).toEqual([
      ['test', 'vitest'],
      ['check', 'svelte-check']
    ]);
    expect(packageScripts('{"name":"x"}')).toEqual([]);
    expect(packageScripts('not json')).toEqual([]);
  });
});
