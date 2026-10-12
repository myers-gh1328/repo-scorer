import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { detectDuplication } from './duplication';
import { detectFileSizes } from './fileSize';
import { packageScripts, walkRepo, type RepoEntry } from './repoFiles';
import { isRuntimeSupportMatrixStale, runtimeSupportAnalysis, type RuntimeSupportMatrix } from './reference/runtimeSupport';

const MAX_FILE_CHARS = 8000;
const MAX_COLLECT_DEPTH = 5;

const EXACT_FILES = [
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  '.claude/CLAUDE.md',
  'CLAUDE.local.md',
  '.cursorrules',
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
  '.vscode/mcp.json',
  '.codex/config.toml',
  '.codex/hooks.json',
  '.gemini/settings.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/plugin.json',
  'plugin.json',
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
  '.codex/agents',
  '.codex/skills',
  '.gemini/agents',
  '.gemini/skills',
  '.github/prompts',
  '.github/hooks',
  '.claude/commands',
  '.claude/output-styles',
  '.devcontainer',
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

async function collectDir(dir: string, repoRoot: string, files: ScannedFile[]): Promise<void> {
  const entries = await walkRepo(repoRoot, { startDir: dir, maxDepth: MAX_COLLECT_DEPTH, ignoredDirs: IGNORED_DIRS });
  for (const entry of entries) {
    if (!entry.isDirectory && isRelevantFile(entry.name)) await addScannedFile(entry, files);
  }
}

async function addScannedFile(entry: RepoEntry, files: ScannedFile[]): Promise<void> {
  try {
    const content = await readFile(entry.fullPath, 'utf-8');
    files.push({ relativePath: entry.relativePath, content: content.slice(0, MAX_FILE_CHARS), fullLength: content.length });
  } catch {
    // skip unreadable entries
  }
}

export interface ScannedFile {
  relativePath: string;
  content: string;
  /** Untruncated character length; `content` is capped at MAX_FILE_CHARS. */
  fullLength?: number;
}

export const GUIDANCE_TOOLS = ['generic', 'claude', 'cursor', 'copilot', 'windsurf'] as const;
export type GuidanceTool = typeof GUIDANCE_TOOLS[number];

export interface AlwaysOnGuidance {
  files: string[];
  chars: number;
  estimatedTokens: number;
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
  supportedRuntimeFiles?: string[];
  alwaysOnGuidanceByTool?: Record<GuidanceTool, AlwaysOnGuidance>;
  hasVolatileGuidancePrefix?: boolean;
  claudeMdShadowsAgentsMd?: boolean;
  claudeLocalMdNotIgnored?: boolean;
  legacyPromptFiles?: string[];
  pluginManifestFiles?: string[];
  cloudAgentSetupFiles?: string[];
  portableSkillFiles?: string[];
  unknownRuntimeVersionFiles?: string[];
  runtimeReferenceDataStale?: boolean;
  hasSupportedCoreRuntime?: boolean;
  duplicationStatus?: 'measured' | 'unavailable';
  duplicationPercentage?: number;
  duplicationCloneCount?: number;
  duplicationDuplicatedLines?: number;
  duplicationTopPairs?: string[];
  fileSizeStatus?: 'measured' | 'unavailable';
  codeFileCount?: number;
  codeLineCount?: number;
  filesOver500Lines?: number;
  filesOver1000Lines?: number;
  largestFiles?: string[];
}

export interface ScanOptions {
  duplication?: boolean;
  fileSize?: boolean;
}

export interface ScanResult {
  files: ScannedFile[];
  evidence: EvidenceInventory;
}

export async function scanRepo(repoPath: string, runtimeSupport?: RuntimeSupportMatrix, options: ScanOptions = {}): Promise<ScanResult> {
  const files: ScannedFile[] = [];

  for (const filePath of EXACT_FILES) {
    const full = join(repoPath, filePath);
    if (existsSync(full)) {
      try {
        const content = await readFile(full, 'utf-8');
        files.push({ relativePath: filePath, content: content.slice(0, MAX_FILE_CHARS), fullLength: content.length });
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

  const evidence = buildEvidence(files, runtimeSupport);
  if (options.duplication) {
    const duplication = await detectDuplication(repoPath);
    evidence.duplicationStatus = duplication.status;
    if (duplication.status === 'measured') {
      evidence.duplicationPercentage = duplication.percentage;
      evidence.duplicationCloneCount = duplication.cloneCount;
      evidence.duplicationDuplicatedLines = duplication.duplicatedLines;
      evidence.duplicationTopPairs = duplication.topPairs;
    }
  }
  if (options.fileSize) {
    const fileSize = await detectFileSizes(repoPath);
    evidence.fileSizeStatus = fileSize.status;
    if (fileSize.status === 'measured') {
      evidence.codeFileCount = fileSize.codeFileCount;
      evidence.codeLineCount = fileSize.codeLineCount;
      evidence.filesOver500Lines = fileSize.filesOver500Lines;
      evidence.filesOver1000Lines = fileSize.filesOver1000Lines;
      evidence.largestFiles = fileSize.largestFiles;
    }
  }

  return { files, evidence };
}

async function collectNestedAgents(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, files, 'AGENTS.md');
}

async function collectSkillFiles(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByName(repoRoot, files, 'SKILL.md');
}

async function collectMaintainabilityEvidenceFiles(repoRoot: string, files: ScannedFile[]): Promise<void> {
  await collectByPredicate(repoRoot, files, path =>
    isTestPath(path) ||
    isIacPath(path) ||
    isRuntimePath(path) ||
    isSecretRiskPath(path) ||
    path === '.gitignore' ||
    path.startsWith('.github/workflows/')
  );
}

async function collectByName(repoRoot: string, files: ScannedFile[], targetName: string): Promise<void> {
  await collectByPredicate(repoRoot, files, (_path, name) => name === targetName);
}

async function collectByPredicate(
  repoRoot: string,
  files: ScannedFile[],
  predicate: (relativePath: string, name: string) => boolean
): Promise<void> {
  const entries = await walkRepo(repoRoot, { maxDepth: MAX_COLLECT_DEPTH, ignoredDirs: IGNORED_DIRS });
  for (const entry of entries) {
    if (entry.isDirectory || !predicate(entry.relativePath, entry.name)) continue;
    if (files.some(file => file.relativePath === entry.relativePath)) continue;
    await addScannedFile(entry, files);
  }
}

function buildEvidence(files: ScannedFile[], runtimeSupport?: RuntimeSupportMatrix): EvidenceInventory {
  const paths = files.map(file => file.relativePath);
  const guidanceFiles = paths.filter(path => path === 'AGENTS.md' || path.endsWith('/AGENTS.md') || path === 'AGENTS.override.md' || path === 'CLAUDE.md' || path === '.claude/CLAUDE.md' || path === 'GEMINI.md' || path === '.cursorrules' || path === '.github/copilot-instructions.md');
  const nestedGuidanceFiles = paths.filter(path => path.endsWith('/AGENTS.md'));
  const skillFiles = paths.filter(path => path.endsWith('/SKILL.md'));
  const recipeLikeDocs = paths.filter(path => /(^|\/)(TASK_RECIPES|EVALS|LOCAL_MODEL_READINESS|TOOL_CONTRACTS|REPO_MAP)\.md$/.test(path));
  const specializedAgentFiles = paths.filter(path => /(^|\/)(agents)\/.+\.md$/.test(path) || path.endsWith('.agent.md') || /^\.codex\/agents\/.+\.toml$/.test(path));
  const workflowFiles = paths.filter(path => path.startsWith('.github/workflows/') && /\.(ya?ml)$/.test(path));
  const workflowTriggers = unique(workflowFiles.flatMap(path => extractWorkflowTriggers(files.find(file => file.relativePath === path)?.content ?? '')));
  const mcpManifestFiles = paths.filter(path => MCP_MANIFEST_PATHS.has(path) || basename(path) === 'mcp.json' ||
    (path === '.codex/config.toml' && /^\[mcp_servers[.\]]/m.test(files.find(file => file.relativePath === path)?.content ?? '')));
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
  const runtimeAnalysis = runtimeSupport
    ? runtimeSupportAnalysis(files, runtimeSupport)
    : { risks: [], supportedRuntimeFiles: [], unknownRuntimeVersionFiles: [] };
  const eolRuntimeRisks = runtimeAnalysis.risks;

  const alwaysOnGuidanceByTool = buildAlwaysOnGuidance(files);
  const alwaysOnFiles = unique(Object.values(alwaysOnGuidanceByTool).flatMap(entry => entry.files));
  const rootGitignore = files.find(file => file.relativePath === '.gitignore')?.content ?? '';

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
    supportedRuntimeFiles: runtimeAnalysis.supportedRuntimeFiles,
    unknownRuntimeVersionFiles: runtimeAnalysis.unknownRuntimeVersionFiles,
    runtimeReferenceDataStale: runtimeSupport ? isRuntimeSupportMatrixStale(runtimeSupport) : undefined,
    alwaysOnGuidanceByTool,
    hasVolatileGuidancePrefix: alwaysOnFiles.some(path => hasVolatileContent(files.find(file => file.relativePath === path)?.content ?? '')),
    claudeMdShadowsAgentsMd: paths.includes('AGENTS.md') &&
      CLAUDE_PROJECT_FILES.some(path => paths.includes(path)) &&
      !CLAUDE_PROJECT_FILES.some(path => importsAgentsMd(files.find(file => file.relativePath === path)?.content ?? '')),
    claudeLocalMdNotIgnored: paths.includes('CLAUDE.local.md') && !/^\/?CLAUDE\.local\.md\s*$/m.test(rootGitignore),
    legacyPromptFiles: paths.filter(path => /^\.github\/prompts\/.+\.prompt\.md$/.test(path) || path.endsWith('.chatmode.md')),
    pluginManifestFiles: paths.filter(path => /^\.(claude|cursor)-plugin\//.test(path) || path === 'plugin.json'),
    cloudAgentSetupFiles: paths.filter(path => path === '.github/workflows/copilot-setup-steps.yml' || path === '.github/workflows/copilot-setup-steps.yaml' || path.startsWith('.devcontainer/')),
    portableSkillFiles: paths.filter(path => /^\.agents\/skills\/.+\/SKILL\.md$/.test(path)),
    hasSupportedCoreRuntime: runtimeAnalysis.supportedRuntimeFiles.length > 0
      && eolRuntimeRisks.length === 0
      && runtimeAnalysis.unknownRuntimeVersionFiles.length === 0
      && !(runtimeSupport ? isRuntimeSupportMatrixStale(runtimeSupport) : false)
  };
}

const CLAUDE_PROJECT_FILES = ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md'];

/**
 * Always-on guidance is what a tool loads into every session regardless of task.
 * Token counts use a chars/4 approximation over untruncated file length.
 */
function buildAlwaysOnGuidance(files: ScannedFile[]): Record<GuidanceTool, AlwaysOnGuidance> {
  const byPath = new Map(files.map(file => [file.relativePath, file]));
  const has = (path: string) => byPath.has(path);
  const agentsFiles = ['AGENTS.md', 'AGENTS.override.md'].filter(has);

  const claudeFiles = CLAUDE_PROJECT_FILES.filter(has);
  const claudeImportsAgents = claudeFiles.some(path => importsAgentsMd(byPath.get(path)?.content ?? ''));
  const claudeRules = files
    .filter(file => /^\.claude\/rules\/.+\.md$/.test(file.relativePath) && !frontmatterHasKey(file.content, 'paths'))
    .map(file => file.relativePath);
  const claude = [
    ...(claudeFiles.length > 0 ? claudeFiles : agentsFiles),
    ...(claudeFiles.length > 0 && claudeImportsAgents ? agentsFiles : []),
    ...claudeRules
  ];

  const cursorRules = files
    .filter(file => /^\.cursor\/rules\/.+\.mdc?$/.test(file.relativePath) && /^alwaysApply:\s*true\s*$/m.test(frontmatter(file.content)))
    .map(file => file.relativePath);
  const cursor = [...agentsFiles, ...['.cursorrules'].filter(has), ...cursorRules];

  const copilotInstructions = files
    .filter(file => /^\.github\/instructions\/.+\.instructions\.md$/.test(file.relativePath) &&
      /^applyTo:\s*['"]?\*\*(\/\*)?['"]?\s*$/m.test(frontmatter(file.content)))
    .map(file => file.relativePath);
  const copilot = [...['.github/copilot-instructions.md'].filter(has), ...agentsFiles, ...copilotInstructions];

  const measure = (paths: string[]): AlwaysOnGuidance => {
    const unique = [...new Set(paths)];
    const chars = unique.reduce((sum, path) => {
      const file = byPath.get(path);
      return sum + (file?.fullLength ?? file?.content.length ?? 0);
    }, 0);
    return { files: unique, chars, estimatedTokens: Math.ceil(chars / 4) };
  };

  return {
    generic: measure(agentsFiles),
    claude: measure(claude),
    cursor: measure(cursor),
    copilot: measure(copilot),
    windsurf: measure(agentsFiles)
  };
}

function frontmatter(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? match[1] : '';
}

function frontmatterHasKey(content: string, key: string): boolean {
  return new RegExp(`^${key}\\s*:`, 'm').test(frontmatter(content));
}

function importsAgentsMd(content: string): boolean {
  return /(^|\s)@(\.\/)?AGENTS\.md\b/m.test(content);
}

function hasVolatileContent(content: string): boolean {
  return /\b20\d\d-\d\d-\d\d\b/.test(content) || /\b(last updated|generated (on|at))\b/i.test(content);
}

export function isTestPath(path: string): boolean {
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
  return packageScripts(content)
    .filter(([, command]) => pattern.test(command))
    .map(([name, command]) => `package.json:${name}=${command}`);
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
