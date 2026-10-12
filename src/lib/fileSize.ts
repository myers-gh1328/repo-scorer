import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { walkRepo } from './repoFiles';
import { isTestPath } from './scanner';

const GIT_TIMEOUT_MS = 30_000;
const MAX_FILES = 20_000;
const MAX_WALK_DEPTH = 20;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LARGEST_FILES = 10;
const LARGE_FILE_LINES = 500;
const VERY_LARGE_FILE_LINES = 1000;
const GENERATED_MARKER_CHARS = 500;

const WALK_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  '.venv',
  '.svelte-kit',
  'coverage'
]);

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'svelte', 'vue',
  'py', 'rs', 'go', 'java', 'kt', 'kts', 'swift', 'rb', 'php', 'cs',
  'c', 'h', 'cc', 'cpp', 'hpp', 'scala', 'ex', 'exs', 'dart', 'lua',
  'sh', 'bash', 'sql', 'css', 'scss', 'sass', 'less', 'html'
]);

export interface FileSizeEvidence {
  status: 'measured' | 'unavailable';
  codeFileCount?: number;
  codeLineCount?: number;
  filesOver500Lines?: number;
  filesOver1000Lines?: number;
  largestFiles?: string[];
}

export async function detectFileSizes(repoPath: string): Promise<FileSizeEvidence> {
  try {
    const paths = (await listGitFiles(repoPath).catch(() => walkFiles(repoPath)))
      .filter(isCodePath)
      .slice(0, MAX_FILES);

    const measured: { path: string; lines: number }[] = [];
    for (const path of paths) {
      const lines = await countLines(join(repoPath, path));
      if (lines !== undefined) measured.push({ path, lines });
    }
    return summarizeFileSizes(measured);
  } catch {
    return { status: 'unavailable' };
  }
}

export function summarizeFileSizes(files: { path: string; lines: number }[]): FileSizeEvidence {
  const largestFiles = [...files]
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .slice(0, MAX_LARGEST_FILES)
    .map(file => `${file.path} (${file.lines} lines${isTestPath(file.path) ? ', test' : ''})`);
  return {
    status: 'measured',
    codeFileCount: files.length,
    codeLineCount: files.reduce((sum, file) => sum + file.lines, 0),
    filesOver500Lines: files.filter(file => file.lines > LARGE_FILE_LINES).length,
    filesOver1000Lines: files.filter(file => file.lines > VERY_LARGE_FILE_LINES).length,
    largestFiles
  };
}

export function isCodePath(path: string): boolean {
  const name = path.split('/').pop() ?? '';
  if (/\.min\.|\.generated\.|\.d\.ts$/i.test(name)) return false;
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return CODE_EXTENSIONS.has(extension);
}

/** Physical lines, matching the ESLint `max-lines` and Pylint `max-module-lines` defaults. */
export function countPhysicalLines(content: string): number {
  if (content === '') return 0;
  const lines = content.split('\n').length;
  return content.endsWith('\n') ? lines - 1 : lines;
}

async function countLines(fullPath: string): Promise<number | undefined> {
  try {
    const info = await stat(fullPath);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
    const content = await readFile(fullPath, 'utf-8');
    if (/@generated|DO NOT EDIT/.test(content.slice(0, GENERATED_MARKER_CHARS))) return undefined;
    return countPhysicalLines(content);
  } catch {
    return undefined;
  }
}

/** Tracked plus untracked-but-not-ignored files, so `.gitignore` is honored. */
function listGitFiles(repoPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(unique(String(stdout).split('\0').filter(Boolean)));
      }
    );
  });
}

async function walkFiles(repoPath: string): Promise<string[]> {
  const entries = await walkRepo(repoPath, { maxDepth: MAX_WALK_DEPTH, ignoredDirs: WALK_IGNORED_DIRS, limit: MAX_FILES });
  return entries.filter(entry => !entry.isDirectory).map(entry => entry.relativePath);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
