import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { runtimeSupportRisks, type RuntimeSupportMatrix } from './reference/runtimeSupport';

const MAX_FILE_CHARS = 8000;
const MAX_COLLECT_DEPTH = 5;

const EXACT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'CONTRIBUTING.md',
  '.gitignore',
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'global.json',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Cargo.toml',
  'Dockerfile',
  'docker-compose.yml',
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
  return /\.(md|json|yaml|yml|toml|mdc|tf|bicep|csproj|sln|gradle|go|py|ts|tsx|js|jsx)$/.test(name) ||
    name === 'Makefile' ||
    name === 'justfile' ||
    name === 'Dockerfile' ||
    name === '.gitignore';
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
  testFiles?: string[];
  testScripts?: string[];
  validationScripts?: string[];
  hasAutomatedTests?: boolean;
  gitignoreFiles?: string[];
  hasGitignore?: boolean;
  secretRiskFiles?: string[];
  hasCommittedSecretRisk?: boolean;
  iacFiles?: string[];
  iacValidationCommands?: string[];
  cloudDeploymentFiles?: string[];
  hasCloudDeploymentWithoutIac?: boolean;
  runtimeFiles?: string[];
  runtimeVersionFiles?: string[];
  eolRuntimeRisks?: string[];
  hasSupportedCoreRuntime?: boolean;
}

export interface ScanResult {
  files: ScannedFile[];
  evidence: EvidenceInventory;
}

export async function scanRepo(repoPath: string, runtimeSupport?: RuntimeSupportMatrix): Promise<ScanResult> {
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
  await collectMaintainabilityEvidenceFiles(repoPath, files);

  return { files, evidence: buildEvidence(files, runtimeSupport) };
}

async function collectNestedAgents(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, repoRoot, files, 'AGENTS.md');
}

async function collectSkillFiles(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, repoRoot, files, 'SKILL.md');
}

async function collectMaintainabilityEvidenceFiles(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByPredicate(repoRoot, repoRoot, files, path =>
    isTestPath(path) ||
    isIacPath(path) ||
    isRuntimePath(path) ||
    isSecretRiskPath(path) ||
    path === '.gitignore' ||
    path.startsWith('.github/workflows/')
  );
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

async function collectByPredicate(
  dir: string,
  repoRoot: string,
  files: ScannedFile[],
  predicate: (relativePath: string) => boolean,
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
        await collectByPredicate(full, repoRoot, files, predicate, depth + 1);
      } else if (s.isFile()) {
        const relativePath = relative(repoRoot, full).replace(/\\/g, '/');
        if (!predicate(relativePath) || files.some(file => file.relativePath === relativePath)) continue;
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath, content: content.slice(0, MAX_FILE_CHARS) });
      }
    } catch {
      // skip unreadable entries
    }
  }
}

function buildEvidence(files: ScannedFile[], runtimeSupport?: RuntimeSupportMatrix): EvidenceInventory {
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
  const testFiles = paths.filter(isTestPath);
  const packageJson = files.find(file => file.relativePath === 'package.json');
  const testScripts = packageJson ? extractPackageScripts(packageJson.content, /test|vitest|jest|playwright|cypress|pytest|dotnet test|go test|cargo test/i) : [];
  const validationScripts = packageJson ? extractPackageScripts(packageJson.content, /build|check|lint|typecheck|test|validate/i) : [];
  const gitignoreFiles = paths.filter(path => path === '.gitignore' || path.endsWith('/.gitignore'));
  const secretRiskFiles = paths.filter(isSecretRiskPath)
    .concat(files.filter(file => hasObviousSecretMarker(file)).map(file => file.relativePath));
  const iacFiles = paths.filter(isIacPath);
  const iacValidationCommands = extractValidationCommands(files, /(terraform\s+(validate|plan|fmt)|bicep\s+(build|lint)|az\s+deployment\s+.*what-if|pulumi\s+preview|helm\s+(template|lint)|kubectl\s+(diff|apply\s+--dry-run)|cfn-lint)/i);
  const cloudDeploymentFiles = unique([
    ...iacFiles,
    ...paths.filter(path => /(^|\/)(azure|aws|gcp|k8s|kubernetes|helm|terraform|bicep|cloudformation|pulumi|deploy|deployment)/i.test(path))
  ]);
  const runtimeFiles = paths.filter(isRuntimePath);
  const runtimeVersionFiles = runtimeFiles.filter(path => /(package\.json|\.nvmrc|\.node-version|pyproject\.toml|runtime\.txt|global\.json|go\.mod|pom\.xml|build\.gradle|Dockerfile|\.csproj)$/i.test(path));
  const eolRuntimeRisks = runtimeSupport ? runtimeSupportRisks(files, runtimeSupport) : [];

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
    hasExternalUnversionedHookReference: files.some(file => /\/Users\/|~\/|\.\.\//.test(file.content) && /hook|script|standards|check/i.test(file.content)),
    testFiles,
    testScripts,
    validationScripts,
    hasAutomatedTests: testFiles.length > 0 || testScripts.length > 0,
    gitignoreFiles,
    hasGitignore: gitignoreFiles.length > 0,
    secretRiskFiles: unique(secretRiskFiles),
    hasCommittedSecretRisk: secretRiskFiles.length > 0,
    iacFiles,
    iacValidationCommands,
    cloudDeploymentFiles,
    hasCloudDeploymentWithoutIac: cloudDeploymentFiles.length > 0 && iacFiles.length === 0,
    runtimeFiles,
    runtimeVersionFiles,
    eolRuntimeRisks,
    hasSupportedCoreRuntime: eolRuntimeRisks.length === 0
  };
}

function isTestPath(path: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(path) || /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs|cs)$/i.test(path);
}

function isIacPath(path: string): boolean {
  return /\.(tf|tfvars|bicep)$/i.test(path) ||
    /(^|\/)(Chart\.yaml|values\.ya?ml|kustomization\.ya?ml|pulumi\..*\.ya?ml|serverless\.ya?ml|template\.ya?ml|cloudformation\.ya?ml)$/i.test(path) ||
    /(^|\/)(k8s|kubernetes|helm|terraform|infra|infrastructure|bicep|deploy|deployment)\//i.test(path);
}

function isRuntimePath(path: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|runtime\.txt|global\.json|go\.mod|pom\.xml|build\.gradle|Cargo\.toml|Dockerfile|\.nvmrc|\.node-version)$/i.test(path) ||
    /\.(csproj)$/i.test(path);
}

function isSecretRiskPath(path: string): boolean {
  return /(^|\/)(id_rsa|id_dsa|.*\.pem|.*\.pfx|.*\.key|.*secrets?\.json|.*credentials?\.json)$/i.test(path) &&
    !/(^|\/)(.*example.*|.*sample.*)$/i.test(path);
}

function hasObviousSecretMarker(file: ScannedFile): boolean {
  if (!/\.(json|ya?ml|toml|config)$/i.test(file.relativePath)) return false;
  return /(password|client_secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+=]{16,}/i.test(file.content);
}

function extractPackageScripts(content: string, pattern: RegExp): string[] {
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };
    return Object.entries(parsed.scripts ?? {})
      .filter(([, command]) => typeof command === 'string' && pattern.test(command))
      .map(([name, command]) => `package.json:${name}=${command}`);
  } catch {
    return [];
  }
}

function extractValidationCommands(files: ScannedFile[], pattern: RegExp): string[] {
  return unique(files.flatMap(file => {
    const matches = file.content.match(new RegExp(pattern.source, 'ig')) ?? [];
    return matches.map(match => `${file.relativePath}: ${match}`);
  }));
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
