import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const JSCPD_TIMEOUT_MS = 60_000;
const GIT_TIMEOUT_MS = 30_000;
const MAX_TOP_PAIRS = 10;
const MIN_TOKENS = '50';
const MIN_LINES = '5';

export const DUPLICATION_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/target/**',
  '**/dist/**',
  '**/.venv/**',
  '**/.svelte-kit/**',
  // Code only: prose, config and lockfiles are not copy-paste code.
  '**/*.md',
  '**/*.json',
  '**/*.yml',
  '**/*.yaml',
  '**/*.lock',
  '**/*.txt',
  '**/*.toml'
];

export interface DuplicationEvidence {
  status: 'measured' | 'unavailable';
  percentage?: number;
  cloneCount?: number;
  duplicatedLines?: number;
  topPairs?: string[];
}

interface JscpdLocation {
  name: string;
  start: number;
  end: number;
}

interface JscpdReport {
  statistics?: { total?: { percentage?: number; clones?: number; duplicatedLines?: number } };
  duplicates?: { lines?: number; firstFile?: JscpdLocation; secondFile?: JscpdLocation }[];
}

export async function detectDuplication(repoPath: string): Promise<DuplicationEvidence> {
  let outputDir: string | undefined;
  try {
    outputDir = await mkdtemp(join(tmpdir(), 'repo-scorer-jscpd-'));
    const script = createRequire(import.meta.url).resolve('jscpd/run-jscpd.js');
    await runJscpd(process.execPath, [
      script,
      repoPath,
      '--silent',
      '--no-colors',
      '--reporters', 'json',
      '--output', outputDir,
      '--min-tokens', MIN_TOKENS,
      '--min-lines', MIN_LINES,
      '--ignore', [...DUPLICATION_IGNORE_GLOBS, ...nestedCheckoutGlobs(await listNestedCheckouts(repoPath))].join(',')
    ]);
    const report = JSON.parse(await readFile(join(outputDir, 'jscpd-report.json'), 'utf-8')) as JscpdReport;
    return parseJscpdReport(report);
  } catch {
    return { status: 'unavailable' };
  } finally {
    if (outputDir) await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function parseJscpdReport(report: JscpdReport): DuplicationEvidence {
  const total = report.statistics?.total;
  if (!total || typeof total.percentage !== 'number') return { status: 'unavailable' };
  const topPairs = (report.duplicates ?? [])
    .filter(clone => clone.firstFile && clone.secondFile)
    .sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0))
    .slice(0, MAX_TOP_PAIRS)
    .map(clone => `${formatLocation(clone.firstFile!)} <-> ${formatLocation(clone.secondFile!)} (${clone.lines ?? 0} lines)`);
  return {
    status: 'measured',
    percentage: Math.round(total.percentage * 100) / 100,
    cloneCount: total.clones ?? 0,
    duplicatedLines: total.duplicatedLines ?? 0,
    topPairs
  };
}

/** One glob per nested checkout (an agent worktree, a cloned repo), so jscpd does not count its copies as clones. */
export function nestedCheckoutGlobs(directories: string[]): string[] {
  return directories.map(directory => `**/${directory.replace(/\/+$/, '')}/**`);
}

/**
 * Directories git reports as nested repositories: `ls-files --others` lists each
 * untracked checkout as one `path/` entry instead of its files. Empty outside git.
 */
function listNestedCheckouts(repoPath: string): Promise<string[]> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['ls-files', '-z', '--others', '--exclude-standard'],
      { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) resolve([]);
        else resolve(String(stdout).split('\0').filter(path => path.endsWith('/')));
      }
    );
  });
}

function formatLocation(location: JscpdLocation): string {
  return `${location.name.replace(/:[a-z0-9_+-]+$/i, '')}:${location.start}-${location.end}`;
}

function runJscpd(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: JSCPD_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}
