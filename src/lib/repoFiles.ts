import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface RepoEntry {
  /** Repo-relative path with forward slashes. */
  relativePath: string;
  fullPath: string;
  name: string;
  isDirectory: boolean;
}

export interface WalkOptions {
  /** Directory to start from; defaults to the repo root. */
  startDir?: string;
  /** Deepest directory level to descend into, counted from `startDir`. */
  maxDepth: number;
  /** Directory names that are never entered. */
  ignoredDirs: ReadonlySet<string>;
  /** Stop after this many entries. */
  limit?: number;
}

/**
 * Depth-first walk in readdir order, following symlinks the way `stat` does.
 * Unreadable directories and entries are skipped, and so are nested checkouts
 * (a directory holding `.git`, such as an agent worktree): they are other
 * copies of the code, not part of this repo.
 */
export async function walkRepo(repoRoot: string, options: WalkOptions): Promise<RepoEntry[]> {
  const entries: RepoEntry[] = [];
  const limit = options.limit ?? Number.POSITIVE_INFINITY;

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > options.maxDepth || entries.length >= limit) return;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (entries.length >= limit) return;
      if (options.ignoredDirs.has(name)) continue;
      const fullPath = join(dir, name);
      try {
        const info = await stat(fullPath);
        const relativePath = relative(repoRoot, fullPath).replace(/\\/g, '/');
        if (info.isDirectory()) {
          if (existsSync(join(fullPath, '.git'))) continue;
          entries.push({ relativePath, fullPath, name, isDirectory: true });
          await visit(fullPath, depth + 1);
        } else if (info.isFile()) {
          entries.push({ relativePath, fullPath, name, isDirectory: false });
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  await visit(options.startDir ?? repoRoot, 0);
  return entries;
}

/** `[name, command]` pairs from a package.json `scripts` block; empty when it is missing or invalid. */
export function packageScripts(content: string): [string, string][] {
  try {
    const parsed = JSON.parse(content) as { scripts?: unknown };
    const scripts = parsed?.scripts;
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return [];
    return Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  } catch {
    return [];
  }
}
