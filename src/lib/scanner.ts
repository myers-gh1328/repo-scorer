import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const MAX_FILE_CHARS = 8000;
const MAX_COLLECT_DEPTH = 5;

const EXACT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'CONTRIBUTING.md',
  'llms.txt',
  'Cargo.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '.mcp.json',
  '.cursor/mcp.json',
  '.claude/settings.json',
  '.claude/settings.local.json',
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
  '.agent/skills',
  '.agents/skills',
  '.codex/hooks',
  'docs/agent',
  'docs/decisions',
  'docs/adr',
  'docs/architecture',
];

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  '.svelte-kit',
  'coverage'
]);

const MCP_MANIFEST_PATHS = new Set([
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json'
]);

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
  if (depth > MAX_COLLECT_DEPTH) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        await collectDir(full, repoRoot, files, depth + 1);
      } else if (s.isFile() && isRelevantFile(entry)) {
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath: relative(repoRoot, full).replace(/\\/g, '/'), content: content.slice(0, MAX_FILE_CHARS) });
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

export interface EvidenceInventory {
  guidanceFiles: string[];
  nestedGuidanceFiles: string[];
  skillFiles: string[];
  recipeLikeDocs: string[];
  specializedAgentFiles: string[];
  workflowFiles: string[];
  workflowTriggers: string[];
  mcpManifestFiles: string[];
  hookFiles: string[];
  lockfiles: string[];
  agentDocs: string[];
  hasRootGuidance: boolean;
  hasFormalSkills: boolean;
  hasSpecializedAgents: boolean;
  hasCiWorkflow: boolean;
  hasPushOrPrCi: boolean;
  hasManualOnlyCi: boolean;
  hasMcpManifest: boolean;
  hasHooks: boolean;
  hasExternalUnversionedHookReference: boolean;
}

export interface ScanResult {
  files: ScannedFile[];
  evidence: EvidenceInventory;
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

  await collectNestedAgents(repoPath, files);
  await collectSkillFiles(repoPath, files);

  return { files, evidence: buildEvidence(files) };
}

async function collectNestedAgents(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, repoRoot, files, 'AGENTS.md');
}

async function collectSkillFiles(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, repoRoot, files, 'SKILL.md');
}

async function collectByName(dir: string, repoRoot: string, files: ScannedFile[], targetName: string, depth = 0): Promise<void> {
  if (depth > MAX_COLLECT_DEPTH) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        await collectByName(full, repoRoot, files, targetName, depth + 1);
      } else if (s.isFile() && entry === targetName) {
        const relativePath = relative(repoRoot, full).replace(/\\/g, '/');
        if (files.some(file => file.relativePath === relativePath)) continue;
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath, content: content.slice(0, MAX_FILE_CHARS) });
      }
    } catch {
      // skip unreadable entries
    }
  }
}

function buildEvidence(files: ScannedFile[]): EvidenceInventory {
  const paths = files.map(file => file.relativePath);
  const guidanceFiles = paths.filter(path => path === 'AGENTS.md' || path.endsWith('/AGENTS.md') || path === 'CLAUDE.md' || path === 'GEMINI.md' || path === '.github/copilot-instructions.md');
  const nestedGuidanceFiles = paths.filter(path => path.endsWith('/AGENTS.md'));
  const skillFiles = paths.filter(path => path.endsWith('/SKILL.md'));
  const recipeLikeDocs = paths.filter(path => /(^|\/)(TASK_RECIPES|EVALS|LOCAL_MODEL_READINESS|TOOL_CONTRACTS|REPO_MAP)\.md$/.test(path));
  const specializedAgentFiles = paths.filter(path => /(^|\/)(agents)\/.+\.md$/.test(path) || path.endsWith('.agent.md'));
  const workflowFiles = paths.filter(path => path.startsWith('.github/workflows/') && /\.(ya?ml)$/.test(path));
  const workflowTriggers = unique(workflowFiles.flatMap(path => extractWorkflowTriggers(files.find(file => file.relativePath === path)?.content ?? '')));
  const mcpManifestFiles = paths.filter(path => MCP_MANIFEST_PATHS.has(path) || basename(path) === 'mcp.json');
  const hookFiles = paths.filter(path => path.includes('/hooks/') || path.endsWith('hooks.json') || path.startsWith('.codex/hooks/'));
  const lockfiles = paths.filter(path => /(^|\/)(Cargo\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(path));
  const agentDocs = paths.filter(path => path.startsWith('docs/agent/') || path === 'llms.txt');
  const hasPushOrPrCi = workflowTriggers.some(trigger => ['push', 'pull_request', 'pull_request_target', 'merge_group'].includes(trigger));
  const hasCiWorkflow = workflowFiles.length > 0;

  return {
    guidanceFiles,
    nestedGuidanceFiles,
    skillFiles,
    recipeLikeDocs,
    specializedAgentFiles,
    workflowFiles,
    workflowTriggers,
    mcpManifestFiles,
    hookFiles,
    lockfiles,
    agentDocs,
    hasRootGuidance: paths.includes('AGENTS.md'),
    hasFormalSkills: skillFiles.length > 0,
    hasSpecializedAgents: specializedAgentFiles.length > 0,
    hasCiWorkflow,
    hasPushOrPrCi,
    hasManualOnlyCi: hasCiWorkflow && !hasPushOrPrCi,
    hasMcpManifest: mcpManifestFiles.length > 0,
    hasHooks: hookFiles.length > 0,
    hasExternalUnversionedHookReference: files.some(file => /\/Users\/|~\/|\.\.\//.test(file.content) && /hook|script|standards|check/i.test(file.content))
  };
}

function extractWorkflowTriggers(content: string): string[] {
  const triggers = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = /^(push|pull_request|pull_request_target|merge_group|workflow_dispatch|schedule|repository_dispatch)\s*:/.exec(trimmed);
    if (match) {
      triggers.add(match[1]);
    }
  }
  const inlineOn = /^on:\s*\[([^\]]+)\]/m.exec(content);
  if (inlineOn) {
    for (const item of inlineOn[1].split(',')) {
      const trigger = item.trim().replace(/^['"]|['"]$/g, '');
      if (trigger) triggers.add(trigger);
    }
  }
  const scalarOn = /^on:\s*(push|pull_request|pull_request_target|merge_group|workflow_dispatch|schedule|repository_dispatch)\s*$/m.exec(content);
  if (scalarOn) {
    triggers.add(scalarOn[1]);
  }
  return [...triggers];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
