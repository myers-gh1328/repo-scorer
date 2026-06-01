import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_FILE_CHARS = 8000;

const EXACT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'CONTRIBUTING.md',
  '.mcp.json',
  '.cursor/mcp.json',
  '.claude/settings.json',
  '.cursor/hooks.json',
  'Makefile',
  'justfile',
  '.github/copilot-instructions.md',
];

const SCANNED_DIRS = [
  '.cursor/rules',
  '.cursor/agents',
  '.cursor/skills',
  '.claude/rules',
  '.claude/agents',
  '.claude/skills',
  '.github/agents',
  '.github/instructions',
  '.github/skills',
  '.github/workflows',
  '.agents/skills',
  'docs/decisions',
  'docs/adr',
  'docs/architecture',
];

function isRelevantFile(name: string): boolean {
  return /\.(md|json|yaml|yml|toml|mdc)$/.test(name) ||
    name === 'Makefile' ||
    name === 'justfile';
}

async function collectDir(
  dir: string,
  repoRoot: string,
  files: ScannedFile[],
  depth = 0
): Promise<void> {
  if (depth > 5) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        await collectDir(full, repoRoot, files, depth + 1);
      } else if (s.isFile() && isRelevantFile(entry)) {
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath: relative(repoRoot, full), content: content.slice(0, MAX_FILE_CHARS) });
      }
    } catch {
      // skip unreadable entries
    }
  }
}

export interface ScannedFile {
  relativePath: string;
  content: string;
}

export interface ScanResult {
  files: ScannedFile[];
}

export async function scanRepo(repoPath: string): Promise<ScanResult> {
  const files: ScannedFile[] = [];

  for (const filePath of EXACT_FILES) {
    const full = join(repoPath, filePath);
    if (existsSync(full)) {
      try {
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath: filePath, content: content.slice(0, MAX_FILE_CHARS) });
      } catch {
        // skip
      }
    }
  }

  for (const dir of SCANNED_DIRS) {
    await collectDir(join(repoPath, dir), repoPath, files);
  }

  return { files };
}
