# Repo Scorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SvelteKit web app that scores local Git repos against the Agentic Maturity Rubric using a local MLX model and displays per-category results on a dashboard.

**Architecture:** SvelteKit handles both frontend and server-side logic. File scanning and LLM calls happen in server routes. Core scoring logic lives in `src/lib/scorer.ts` (separate from the route for testability). Results persist to `scores.json` on disk.

**Tech Stack:** SvelteKit 2, TypeScript, Vitest, Node.js built-ins for file I/O, local MLX via OpenAI-compatible API.

---

## File Map

```
repo-scorer/
  .gitignore
  .env.example
  repos.config.json
  rubric.md
  src/
    app.html                            from scaffold
    app.css                             minimal global styles
    routes/
      +layout.svelte                    imports app.css globally
      +page.svelte                      dashboard: repo list with last scores
      +page.server.ts                   load repos.config.json + scores.json
      repo/
        [name]/
          +page.svelte                  detail: full report for one repo
          +page.server.ts               load single score entry + repo path
      api/
        score/
          +server.ts                    POST handler: validate → score → return
    lib/
      types.ts                          all shared interfaces, constants, helpers
      scanner.ts                        walk repo, collect relevant files
      scanner.test.ts
      promptBuilder.ts                  build LLM prompt from rubric + scan
      promptBuilder.test.ts
      mlxClient.ts                      POST to MLX OpenAI-compatible API
      mlxClient.test.ts
      scorer.ts                         core pipeline: scan→prompt→MLX→persist
      scorer.test.ts
```

---

## Task 1: Scaffold the SvelteKit project

**Files:**
- Create: all scaffold files (package.json, svelte.config.js, tsconfig.json, vite.config.ts, src/app.html)
- Create: `.gitignore`

- [ ] **Step 1: Run the SvelteKit scaffolder**

```bash
cd /Users/mike.myers/source/repos/repo-scorer
npm create svelte@latest .
```

When prompted:
- **Template:** Skeleton project
- **Type checking:** Yes, using TypeScript syntax
- **Additional options:** Select "Add Vitest for unit testing" (spacebar to select), nothing else

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Verify the test scaffold works**

```bash
npm run test -- --run
```

Expected: no test files found yet, exits 0 (or reports "No test files found").

- [ ] **Step 4: Add `scores.json` and `.env` to `.gitignore`**

Open `.gitignore` and append:

```
scores.json
.env
```

- [ ] **Step 5: Add `.env.example`**

Create `.env.example` at the project root:

```
MLX_BASE_URL=http://localhost:8080
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit project with TypeScript and Vitest"
```

---

## Task 2: Define shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
export interface RepoConfig {
  name: string;
  path: string;
}

export interface CategoryScores {
  persistent_guidance: number;
  scoped_rules: number;
  skills: number;
  specialized_agents: number;
  tool_manifests_mcp: number;
  validation_reproducibility: number;
  ci_pr_automation: number;
  security_sandboxing_hooks: number;
  domain_context: number;
  governance_observability: number;
  versioning_provenance: number;
  onboarding_discoverability: number;
}

export const CATEGORY_MAX: CategoryScores = {
  persistent_guidance: 15,
  scoped_rules: 10,
  skills: 10,
  specialized_agents: 10,
  tool_manifests_mcp: 10,
  validation_reproducibility: 10,
  ci_pr_automation: 10,
  security_sandboxing_hooks: 10,
  domain_context: 5,
  governance_observability: 5,
  versioning_provenance: 3,
  onboarding_discoverability: 2
};

export const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  persistent_guidance: 'Persistent Guidance',
  scoped_rules: 'Scoped Rules',
  skills: 'Skills',
  specialized_agents: 'Specialized Agents',
  tool_manifests_mcp: 'Tool Manifests / MCP',
  validation_reproducibility: 'Validation & Reproducibility',
  ci_pr_automation: 'CI & PR Automation',
  security_sandboxing_hooks: 'Security, Sandboxing & Hooks',
  domain_context: 'Domain Context',
  governance_observability: 'Governance & Observability',
  versioning_provenance: 'Versioning & Provenance',
  onboarding_discoverability: 'Onboarding & Discoverability'
};

export type HealthBand = 'Fragile' | 'Emerging' | 'Operational' | 'Managed' | 'Mature';

export interface ScoreResult {
  scoredAt: string;
  score: number;
  band: HealthBand;
  primaryLanguage: string;
  categories: CategoryScores;
  qualityFlags: string[];
  riskFlags: string[];
  recommendations: string[];
}

export interface ScoresStore {
  [repoName: string]: ScoreResult;
}

export interface MLXConfig {
  baseUrl: string;
  model?: string;
}

export function bandForScore(score: number): HealthBand {
  if (score >= 90) return 'Mature';
  if (score >= 75) return 'Managed';
  if (score >= 60) return 'Operational';
  if (score >= 40) return 'Emerging';
  return 'Fragile';
}

export function bandColor(band: HealthBand): string {
  switch (band) {
    case 'Mature':      return '#27ae60';
    case 'Managed':     return '#2ecc71';
    case 'Operational': return '#f39c12';
    case 'Emerging':    return '#e67e22';
    case 'Fragile':     return '#e74c3c';
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared types and constants"
```

---

## Task 3: File scanner (TDD)

**Files:**
- Create: `src/lib/scanner.ts`
- Create: `src/lib/scanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scanner.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm run test -- --run src/lib/scanner.test.ts
```

Expected: FAIL — `Cannot find module './scanner'`

- [ ] **Step 3: Implement `src/lib/scanner.ts`**

```typescript
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm run test -- --run src/lib/scanner.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scanner.ts src/lib/scanner.test.ts
git commit -m "feat: add repo file scanner with tests"
```

---

## Task 4: Prompt builder (TDD)

**Files:**
- Create: `src/lib/promptBuilder.ts`
- Create: `src/lib/promptBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/promptBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrompt } from './promptBuilder';
import type { ScanResult } from './scanner';

describe('buildPrompt', () => {
  const rubric = 'Scoring rubric content goes here.';

  it('includes the rubric in the prompt', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('Scoring rubric content goes here.');
  });

  it('includes file paths and content for scanned files', () => {
    const scan: ScanResult = {
      files: [{ relativePath: 'AGENTS.md', content: '# Agent Guide' }]
    };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('Agent Guide');
  });

  it('notes when no files were found', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('No agent-related files found');
  });

  it('instructs the model to return only JSON', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('return ONLY a JSON object');
  });

  it('includes all 12 category keys in the expected JSON schema', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('persistent_guidance');
    expect(prompt).toContain('scoped_rules');
    expect(prompt).toContain('ci_pr_automation');
    expect(prompt).toContain('onboarding_discoverability');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm run test -- --run src/lib/promptBuilder.test.ts
```

Expected: FAIL — `Cannot find module './promptBuilder'`

- [ ] **Step 3: Implement `src/lib/promptBuilder.ts`**

```typescript
import type { ScanResult } from './scanner';

export function buildPrompt(rubric: string, scan: ScanResult): string {
  const fileSection =
    scan.files.length === 0
      ? 'No agent-related files found in this repository.'
      : scan.files
          .map(f => `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');

  return `You are evaluating a software repository against the Agentic Repository Maturity Guide below.

## RUBRIC

${rubric}

## REPOSITORY FILES FOUND

${fileSection}

## TASK

Evaluate the repository based only on the files shown above. Return ONLY a JSON object (no explanation, no markdown, no code block wrapper) with this exact structure:

{
  "score": <integer 0-100>,
  "band": <"Fragile" | "Emerging" | "Operational" | "Managed" | "Mature">,
  "primaryLanguage": <primary programming language as a string>,
  "categories": {
    "persistent_guidance": <integer 0-15>,
    "scoped_rules": <integer 0-10>,
    "skills": <integer 0-10>,
    "specialized_agents": <integer 0-10>,
    "tool_manifests_mcp": <integer 0-10>,
    "validation_reproducibility": <integer 0-10>,
    "ci_pr_automation": <integer 0-10>,
    "security_sandboxing_hooks": <integer 0-10>,
    "domain_context": <integer 0-5>,
    "governance_observability": <integer 0-5>,
    "versioning_provenance": <integer 0-3>,
    "onboarding_discoverability": <integer 0-2>
  },
  "qualityFlags": [<strings describing strengths>],
  "riskFlags": [<strings describing gaps or problems>],
  "recommendations": [<strings listing prioritized improvement actions>]
}

Rules:
- The category scores must sum exactly to the total score.
- The band must match: 0-39=Fragile, 40-59=Emerging, 60-74=Operational, 75-89=Managed, 90-100=Mature.
- Return raw JSON only — no markdown, no code fences, no explanation.`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm run test -- --run src/lib/promptBuilder.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/promptBuilder.ts src/lib/promptBuilder.test.ts
git commit -m "feat: add prompt builder with tests"
```

---

## Task 5: MLX client (TDD)

**Files:**
- Create: `src/lib/mlxClient.ts`
- Create: `src/lib/mlxClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mlxClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callMLX } from './mlxClient';
import type { MLXConfig } from './types';

const config: MLXConfig = { baseUrl: 'http://localhost:8080' };

describe('callMLX', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX(config, 'test prompt');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the prompt as a user message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX(config, 'my prompt text');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toContainEqual({ role: 'user', content: 'my prompt text' });
  });

  it('returns the message content string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    }));

    const result = await callMLX(config, 'prompt');
    expect(result).toBe('{"score":72}');
  });

  it('throws when the response status is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    }));

    await expect(callMLX(config, 'prompt')).rejects.toThrow('503');
  });

  it('uses a custom model name when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX({ baseUrl: 'http://localhost:8080', model: 'gemma-4-27b' }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gemma-4-27b');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm run test -- --run src/lib/mlxClient.test.ts
```

Expected: FAIL — `Cannot find module './mlxClient'`

- [ ] **Step 3: Implement `src/lib/mlxClient.ts`**

```typescript
import type { MLXConfig } from './types';

export async function callMLX(config: MLXConfig, prompt: string): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'local',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`MLX returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm run test -- --run src/lib/mlxClient.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mlxClient.ts src/lib/mlxClient.test.ts
git commit -m "feat: add MLX client with tests"
```

---

## Task 6: Scorer — core pipeline (TDD)

**Files:**
- Create: `src/lib/scorer.ts`
- Create: `src/lib/scorer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scorer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./mlxClient', () => ({ callMLX: vi.fn() }));

import { scoreRepo } from './scorer';
import { callMLX } from './mlxClient';

const mockResult = {
  score: 72,
  band: 'Operational',
  primaryLanguage: 'TypeScript',
  categories: {
    persistent_guidance: 11, scoped_rules: 0, skills: 0, specialized_agents: 0,
    tool_manifests_mcp: 1, validation_reproducibility: 6, ci_pr_automation: 0,
    security_sandboxing_hooks: 1, domain_context: 4, governance_observability: 1,
    versioning_provenance: 2, onboarding_discoverability: 2
  },
  qualityFlags: ['Good AGENTS.md'],
  riskFlags: ['No CI'],
  recommendations: ['Add CI workflow']
};

describe('scoreRepo', () => {
  let repoDir: string;
  let tmpDir: string;
  let scoresPath: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'scorer-repo-'));
    tmpDir = await mkdtemp(join(tmpdir(), 'scorer-out-'));
    scoresPath = join(tmpDir, 'scores.json');
    vi.mocked(callMLX).mockResolvedValue(JSON.stringify(mockResult));
  });

  it('returns a ScoreResult with scoredAt populated', async () => {
    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(72);
    expect(result.band).toBe('Operational');
    expect(new Date(result.scoredAt).getTime()).toBeGreaterThan(0);
  });

  it('writes the result to scores.json under the repo name', async () => {
    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.myrepo.score).toBe(72);
  });

  it('preserves existing scores for other repos', async () => {
    await writeFile(scoresPath, JSON.stringify({ otherapp: { score: 50 } }));

    await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);

    const stored = JSON.parse(await readFile(scoresPath, 'utf-8'));
    expect(stored.otherapp.score).toBe(50);
    expect(stored.myrepo.score).toBe(72);
  });

  it('throws MLX_UNREACHABLE when the MLX call fails', async () => {
    vi.mocked(callMLX).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('MLX_UNREACHABLE');
  });

  it('retries once on malformed JSON and succeeds on second call', async () => {
    vi.mocked(callMLX)
      .mockResolvedValueOnce('not valid json {{{{')
      .mockResolvedValueOnce(JSON.stringify(mockResult));

    const result = await scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath);
    expect(result.score).toBe(72);
    expect(vi.mocked(callMLX)).toHaveBeenCalledTimes(2);
  });

  it('throws PARSE_FAILED when both attempts return malformed JSON', async () => {
    vi.mocked(callMLX).mockResolvedValue('not valid json');

    await expect(
      scoreRepo('myrepo', repoDir, 'rubric', { baseUrl: 'http://localhost:8080' }, scoresPath)
    ).rejects.toThrow('PARSE_FAILED');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm run test -- --run src/lib/scorer.test.ts
```

Expected: FAIL — `Cannot find module './scorer'`

- [ ] **Step 3: Implement `src/lib/scorer.ts`**

```typescript
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { scanRepo } from './scanner';
import { buildPrompt } from './promptBuilder';
import { callMLX } from './mlxClient';
import type { MLXConfig, ScoreResult, ScoresStore } from './types';

export async function scoreRepo(
  name: string,
  repoPath: string,
  rubric: string,
  mlxConfig: MLXConfig,
  scoresPath: string
): Promise<ScoreResult> {
  const scan = await scanRepo(repoPath);
  const prompt = buildPrompt(rubric, scan);

  let raw: string;
  try {
    raw = await callMLX(mlxConfig, prompt);
  } catch {
    throw new Error('MLX_UNREACHABLE');
  }

  let result: ScoreResult;
  try {
    result = JSON.parse(raw);
  } catch {
    let raw2: string;
    try {
      raw2 = await callMLX(mlxConfig, prompt);
      result = JSON.parse(raw2);
    } catch {
      throw new Error('PARSE_FAILED');
    }
  }

  result.scoredAt = new Date().toISOString();

  let scores: ScoresStore = {};
  if (existsSync(scoresPath)) {
    scores = JSON.parse(await readFile(scoresPath, 'utf-8'));
  }
  scores[name] = result;
  await writeFile(scoresPath, JSON.stringify(scores, null, 2));

  return result;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm run test -- --run src/lib/scorer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorer.ts src/lib/scorer.test.ts
git commit -m "feat: add scorer pipeline with tests"
```

---

## Task 7: Score API route

**Files:**
- Create: `src/routes/api/score/+server.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/routes/api/score
```

- [ ] **Step 2: Create `src/routes/api/score/+server.ts`**

```typescript
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { scoreRepo } from '$lib/scorer';

const SCORES_PATH = 'scores.json';
const RUBRIC_PATH = 'rubric.md';

export const POST: RequestHandler = async ({ request }) => {
  const { name, path } = await request.json() as { name: string; path: string };

  if (!existsSync(path)) {
    throw error(400, `Repo path not found: ${path}`);
  }

  let rubric: string;
  try {
    rubric = await readFile(RUBRIC_PATH, 'utf-8');
  } catch {
    throw error(500, 'rubric.md not found in project root');
  }

  const mlxBaseUrl = env.MLX_BASE_URL ?? 'http://localhost:8080';

  try {
    const result = await scoreRepo(name, path, rubric, { baseUrl: mlxBaseUrl }, SCORES_PATH);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'MLX_UNREACHABLE') {
      throw error(503, 'MLX server unreachable — is it running?');
    }
    if (msg === 'PARSE_FAILED') {
      throw error(500, 'Scoring failed — model response could not be parsed');
    }
    throw error(500, `Scoring failed: ${msg}`);
  }
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/score/+server.ts
git commit -m "feat: add score API route"
```

---

## Task 8: Dashboard page

**Files:**
- Create: `src/routes/+page.server.ts`
- Create: `src/routes/+page.svelte`
- Create: `src/app.css`
- Create: `repos.config.json`

- [ ] **Step 1: Create `src/routes/+page.server.ts`**

```typescript
import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async () => {
  const configRaw = await readFile('repos.config.json', 'utf-8');
  const repos: RepoConfig[] = JSON.parse(configRaw);

  let scores: ScoresStore = {};
  if (existsSync('scores.json')) {
    scores = JSON.parse(await readFile('scores.json', 'utf-8'));
  }

  return { repos, scores };
};
```

- [ ] **Step 2: Create `src/routes/+page.svelte`**

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import { bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let scoring = $state<string | null>(null);
  let scoreError = $state<Record<string, string>>({});

  async function scoreRepo(name: string, path: string) {
    scoring = name;
    scoreError = { ...scoreError, [name]: '' };

    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path })
    });

    if (!res.ok) {
      const text = await res.text();
      scoreError = { ...scoreError, [name]: text };
      scoring = null;
      return;
    }

    window.location.href = `/repo/${name}`;
  }
</script>

<main>
  <h1>Repo Scorer</h1>
  <p class="subtitle">Agentic Repository Maturity Dashboard</p>

  <table>
    <thead>
      <tr>
        <th>Repository</th>
        <th>Score</th>
        <th>Band</th>
        <th>Last Scored</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.repos as repo}
        {@const score = data.scores[repo.name]}
        <tr>
          <td>
            {#if score}
              <a href="/repo/{repo.name}">{repo.name}</a>
            {:else}
              {repo.name}
            {/if}
            {#if scoreError[repo.name]}
              <div class="row-error">{scoreError[repo.name]}</div>
            {/if}
          </td>
          <td class="score-cell">{score?.score ?? '—'}</td>
          <td>
            {#if score}
              <span class="band" style="color: {bandColor(score.band)}">{score.band}</span>
            {:else}
              <span class="unscored">Not yet scored</span>
            {/if}
          </td>
          <td class="date-cell">
            {score ? new Date(score.scoredAt).toLocaleString() : '—'}
          </td>
          <td>
            <button
              onclick={() => scoreRepo(repo.name, repo.path)}
              disabled={scoring === repo.name}
            >
              {scoring === repo.name ? 'Scoring…' : 'Score'}
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
```

- [ ] **Step 3: Create `src/app.css`**

```css
*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f0f0f;
  color: #e0e0e0;
  margin: 0;
  padding: 0;
}

main {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem;
}

h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
.subtitle { color: #888; margin-top: 0; margin-bottom: 2rem; }

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #333;
  color: #888;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td {
  padding: 0.75rem;
  border-bottom: 1px solid #1e1e1e;
}

td a { color: #7eb8f7; text-decoration: none; }
td a:hover { text-decoration: underline; }

.score-cell { font-size: 1.1rem; font-weight: bold; }
.date-cell { color: #666; font-size: 0.85rem; }
.band { font-weight: 600; }
.unscored { color: #555; }
.row-error { color: #e74c3c; font-size: 0.8rem; margin-top: 0.25rem; }

button {
  background: #1e3a5f;
  color: #7eb8f7;
  border: 1px solid #2a5298;
  padding: 0.4rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

button:hover:not(:disabled) { background: #2a5298; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.bar-track {
  background: #1e1e1e;
  border-radius: 3px;
  height: 8px;
  width: 100%;
}

.bar-fill {
  height: 8px;
  border-radius: 3px;
  background: #2a5298;
  transition: width 0.3s;
}

.flags { list-style: none; padding: 0; margin: 0; }
.flags li { padding: 0.3rem 0; font-size: 0.9rem; }

.back-link { color: #7eb8f7; text-decoration: none; font-size: 0.9rem; }
.back-link:hover { text-decoration: underline; }

.score-hero {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 2rem;
}

.score-number { font-size: 4rem; font-weight: bold; line-height: 1; }
.band-label { font-size: 1.4rem; font-weight: 600; }

.categories { margin-bottom: 2rem; }
.category-row { margin-bottom: 0.75rem; }
.category-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
  color: #aaa;
}

.section { margin-bottom: 2rem; }
.section h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 0.5rem; }
```

- [ ] **Step 4: Create `src/routes/+layout.svelte` to import the CSS globally**

```svelte
<script>
  import '../app.css';
</script>

<slot />
```

- [ ] **Step 5: Create `repos.config.json`**

```json
[
  { "name": "aiapptriage", "path": "/Users/mike.myers/source/repos/aiapptriage" }
]
```

- [ ] **Step 6: Start the dev server and verify the dashboard loads**

```bash
npm run dev
```

Open `http://localhost:5173`. Expected: dashboard table showing `aiapptriage` with "Not yet scored" state. No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+page.svelte src/routes/+layout.svelte src/app.css repos.config.json
git commit -m "feat: add dashboard page"
```

---

## Task 9: Detail page

**Files:**
- Create: `src/routes/repo/[name]/+page.server.ts`
- Create: `src/routes/repo/[name]/+page.svelte`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/routes/repo/\[name\]
```

- [ ] **Step 2: Create `src/routes/repo/[name]/+page.server.ts`**

```typescript
import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { RepoConfig, ScoresStore } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
  const { name } = params;

  const configRaw = await readFile('repos.config.json', 'utf-8');
  const repos: RepoConfig[] = JSON.parse(configRaw);
  const repo = repos.find(r => r.name === name);

  if (!repo) {
    throw error(404, `Repo "${name}" not found in repos.config.json`);
  }

  let result = null;
  if (existsSync('scores.json')) {
    const scores: ScoresStore = JSON.parse(await readFile('scores.json', 'utf-8'));
    result = scores[name] ?? null;
  }

  return { name, repoPath: repo.path, result };
};
```

- [ ] **Step 3: Create `src/routes/repo/[name]/+page.svelte`**

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import { CATEGORY_MAX, CATEGORY_LABELS, bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let rescoring = $state(false);
  let rescoreError = $state('');

  async function rescore() {
    rescoring = true;
    rescoreError = '';

    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, path: data.repoPath })
    });

    if (!res.ok) {
      rescoreError = await res.text();
      rescoring = false;
      return;
    }

    window.location.reload();
  }

  const categoryEntries = Object.keys(CATEGORY_MAX) as (keyof typeof CATEGORY_MAX)[];
</script>

<main>
  <a class="back-link" href="/">← Dashboard</a>

  <div style="display:flex; justify-content:space-between; align-items:center; margin: 1.5rem 0 1rem;">
    <h1 style="margin:0">{data.name}</h1>
    <button onclick={rescore} disabled={rescoring}>
      {rescoring ? 'Scoring…' : 'Re-score'}
    </button>
  </div>

  {#if rescoreError}
    <div class="row-error" style="margin-bottom:1rem">{rescoreError}</div>
  {/if}

  {#if !data.result}
    <p style="color:#888">This repo has not been scored yet. Click Re-score to evaluate it.</p>
  {:else}
    {@const r = data.result}

    <div class="score-hero">
      <span class="score-number" style="color:{bandColor(r.band)}">{r.score}</span>
      <span class="band-label" style="color:{bandColor(r.band)}">{r.band}</span>
      <span style="color:#666; font-size:0.85rem">
        {r.primaryLanguage} · scored {new Date(r.scoredAt).toLocaleString()}
      </span>
    </div>

    <div class="categories section">
      <h2>Category Breakdown</h2>
      {#each categoryEntries as key}
        {@const val = r.categories[key]}
        {@const max = CATEGORY_MAX[key]}
        {@const pct = max > 0 ? (val / max) * 100 : 0}
        <div class="category-row">
          <div class="category-label">
            <span>{CATEGORY_LABELS[key]}</span>
            <span>{val} / {max}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:{pct}%"></div>
          </div>
        </div>
      {/each}
    </div>

    {#if r.qualityFlags.length > 0}
      <div class="section">
        <h2>Strengths</h2>
        <ul class="flags">
          {#each r.qualityFlags as flag}
            <li style="color:#2ecc71">✓ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if r.riskFlags.length > 0}
      <div class="section">
        <h2>Risks</h2>
        <ul class="flags">
          {#each r.riskFlags as flag}
            <li style="color:#e74c3c">✗ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if r.recommendations.length > 0}
      <div class="section">
        <h2>Recommendations</h2>
        <ul class="flags">
          {#each r.recommendations as rec}
            <li style="color:#f39c12">→ {rec}</li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</main>
```

- [ ] **Step 4: Verify the detail page renders**

With the dev server still running, navigate to `http://localhost:5173/repo/aiapptriage`. Expected: page renders the repo name, "Re-score" button, and "not yet scored" message. No console errors.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/repo/[name]/+page.server.ts" "src/routes/repo/[name]/+page.svelte"
git commit -m "feat: add repo detail page"
```

---

## Task 10: Rubric, config files, and full run verification

**Files:**
- Create: `rubric.md`
- Verify: `.env` / `.env.example`

- [ ] **Step 1: Copy the rubric**

```bash
cp /Users/mike.myers/source/repos/agentic_repo_maturity_guide_2026.md rubric.md
```

- [ ] **Step 2: Create `.env` with your MLX endpoint**

```bash
echo "MLX_BASE_URL=http://localhost:8080" > .env
```

Confirm `.env` is already in `.gitignore` (added in Task 1).

- [ ] **Step 3: Run the full test suite**

```bash
npm run test -- --run
```

Expected: all tests PASS, no failures.

- [ ] **Step 4: Start MLX and verify end-to-end scoring works**

Start your MLX server in a separate terminal:

```bash
python -m mlx_lm.server --model <your-model-path> --port 8080
```

Then in the dev server tab (`npm run dev`), open `http://localhost:5173`, click Score next to `aiapptriage`. Expected: navigates to the detail page showing a score, category bars, quality flags, risk flags, and recommendations.

- [ ] **Step 5: Commit**

```bash
git add rubric.md .env.example
git commit -m "chore: add rubric and verify end-to-end flow"
```

---

## Running the full test suite

```bash
npm run test -- --run
```

Expected output: all tests in `scanner.test.ts`, `promptBuilder.test.ts`, `mlxClient.test.ts`, and `scorer.test.ts` pass.
