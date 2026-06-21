import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanRepo } from './scanner';
import { callLLM } from './llmClient';
import { CATEGORY_LABELS, CATEGORY_MAX } from './types';
import type { AiTooling } from './server/appSettings';
import type {
	CategoryScores,
	ImprovementPlan,
	ImprovementPlansStore,
	ImprovementTask,
	LLMConfig,
	RepoConfig,
	ScoreResult
} from './types';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];
const IMPACT_VALUES = ['high', 'medium', 'low'] as const;
const EXPORTED_PLAN_PATH = '.agent/improvement-plan.md';
const QUALITY_ERROR_MARKERS = [
	'should not only create agent artifact files',
	'validationCommands are too weak'
];
const AGENTS_POINTER = `## Agent Improvement Plan

This repository has a generated agent-facing improvement plan at \`${EXPORTED_PLAN_PATH}\`. Review it before making repo maturity improvements.
`;

export function assertImprovementPlanExportAllowed(repo: RepoConfig): void {
	if (repo.openSource || repo.visibility === 'public') {
		throw new Error('PLAN_EXPORT_BLOCKED_PUBLIC_REPO');
	}
	if (repo.allowPlanExport === false) {
		throw new Error('PLAN_EXPORT_DISABLED');
	}
}

export async function generateImprovementPlan(
	repoName: string,
	repoPath: string,
	rubric: string,
	score: ScoreResult,
	llmConfig: LLMConfig,
	plansPath: string,
	aiTooling: AiTooling = 'generic'
): Promise<ImprovementPlan> {
	const scan = await scanRepo(repoPath);
	const inventory = await collectRepoInventory(repoPath);
	const validationCandidates = await collectValidationCommandCandidates(repoPath, inventory);
	const raw = await callPlanModel(llmConfig, buildImprovementPrompt(repoName, rubric, score, scan.files, inventory, validationCandidates, aiTooling));
	let repairCount = 0;
	let plan = prepareGeneratedPlan(tryParseImprovementPlan(raw, repoName, score), aiTooling);
	let validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Response was not valid JSON matching the required plan schema.'];
	const qualityWarnings = new Set(validationErrors.filter(isQualityValidationError));

	if (!plan || validationErrors.length > 0) {
		const repaired = await callPlanModel(llmConfig, buildRepairPrompt(raw, repoName, score, validationErrors, inventory, validationCandidates, aiTooling));
		repairCount += 1;
		plan = prepareGeneratedPlan(tryParseImprovementPlan(repaired, repoName, score), aiTooling);
		validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Repaired response was not valid JSON matching the required plan schema.'];
		validationErrors.filter(isQualityValidationError).forEach(error => qualityWarnings.add(error));

		if (plan && validationErrors.length > 0 && validationErrors.every(isQualityValidationError)) {
			const repairedQuality = await callPlanModel(llmConfig, buildRepairPrompt(repaired, repoName, score, validationErrors, inventory, validationCandidates, aiTooling));
			repairCount += 1;
			plan = prepareGeneratedPlan(tryParseImprovementPlan(repairedQuality, repoName, score), aiTooling);
			validationErrors = plan ? validateImprovementPlan(plan, aiTooling, inventory) : ['Quality repair response was not valid JSON matching the required plan schema.'];
			validationErrors.filter(isQualityValidationError).forEach(error => qualityWarnings.add(error));
		}
	}

	if (!plan || validationErrors.length > 0) {
		throw new Error(`PLAN_VALIDATION_FAILED: ${validationErrors.join('; ')}`);
	}

	plan.generatedAt = new Date().toISOString();
	plan.repairCount = repairCount;
	plan.qualityWarnings = [...qualityWarnings];
	plan.markdown = renderImprovementMarkdown(plan);

	let plans: ImprovementPlansStore = {};
	try {
		plans = JSON.parse(await readFile(plansPath, 'utf-8'));
	} catch {
		// file missing or corrupt - start fresh
	}
	plans[repoName] = plan;
	await writeFile(plansPath, JSON.stringify(plans, null, 2));
	return plan;
}

function prepareGeneratedPlan(plan: ImprovementPlan | null, aiTooling: AiTooling): ImprovementPlan | null {
	if (!plan) return null;
	plan.prioritizedTasks = plan.prioritizedTasks.map(task => rewriteTaskForTooling(task, aiTooling));
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

export function parseImprovementPlan(raw: string, repoName: string, score: ScoreResult): ImprovementPlan {
	const trimmed = raw.trim();
	const candidates = [
		trimmed,
		trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
		extractJsonObject(trimmed)
	].filter((candidate): candidate is string => Boolean(candidate));

	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			return normalizeImprovementPlan(JSON.parse(candidate), repoName, score);
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Invalid improvement plan JSON');
}

export async function exportImprovementPlanToRepo(repoPath: string, plan: ImprovementPlan): Promise<{ planPath: string; agentsPath: string }> {
	const agentDir = join(repoPath, '.agent');
	const planPath = join(repoPath, EXPORTED_PLAN_PATH);
	const agentsPath = join(repoPath, 'AGENTS.md');

	await mkdir(agentDir, { recursive: true });
	await writeFile(planPath, `${plan.markdown.trim()}\n`);
	await ensureAgentsPointer(agentsPath);

	return { planPath: EXPORTED_PLAN_PATH, agentsPath: 'AGENTS.md' };
}

export async function markImprovementPlanExported(
	plansPath: string,
	repoName: string,
	exported: { planPath: string; agentsPath: string }
): Promise<ImprovementPlan> {
	const plans: ImprovementPlansStore = JSON.parse(await readFile(plansPath, 'utf-8'));
	const plan = plans[repoName];
	if (!plan) {
		throw new Error('PLAN_NOT_FOUND');
	}
	const updated = {
		...plan,
		exportedAt: new Date().toISOString(),
		exportedPlanPath: exported.planPath,
		exportedAgentsPath: exported.agentsPath
	};
	plans[repoName] = updated;
	await writeFile(plansPath, JSON.stringify(plans, null, 2));
	return updated;
}

function tryParseImprovementPlan(raw: string, repoName: string, score: ScoreResult): ImprovementPlan | null {
	try {
		return parseImprovementPlan(raw, repoName, score);
	} catch {
		return null;
	}
}

async function callPlanModel(llmConfig: LLMConfig, prompt: string): Promise<string> {
	try {
		return await callLLM(llmConfig, prompt);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`LLM_UNREACHABLE: ${msg}`);
	}
}

function normalizeImprovementPlan(value: unknown, repoName: string, score: ScoreResult): ImprovementPlan {
	if (!isRecord(value)) {
		throw new Error('Improvement plan must be an object');
	}
	const prioritizedTasks = normalizeTasks(value.prioritizedTasks)
		.concat(normalizeTasks(value.tasks))
		.concat(normalizeTasks(value.recommendations));
	if (prioritizedTasks.length === 0) {
		throw new Error('Improvement plan must include at least one task');
	}

	const summary = typeof value.summary === 'string' && value.summary.trim()
		? value.summary.trim()
		: `Improve ${repoName} from ${score.band} maturity by addressing the lowest-scoring categories.`;

	const plan: ImprovementPlan = {
		generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
		exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : undefined,
		exportedPlanPath: typeof value.exportedPlanPath === 'string' ? value.exportedPlanPath : undefined,
		exportedAgentsPath: typeof value.exportedAgentsPath === 'string' ? value.exportedAgentsPath : undefined,
		repoName,
		summary,
		currentScore: score.score,
		currentBand: score.band,
		strongestCategories: normalizeCategoryList(value.strongestCategories),
		weakestCategories: normalizeCategoryList(value.weakestCategories),
		prioritizedTasks,
		markdown: ''
	};
	plan.markdown = renderImprovementMarkdown(plan);
	return plan;
}

function validateImprovementPlan(plan: ImprovementPlan, aiTooling: AiTooling, inventory: RepoInventory): string[] {
	const errors: string[] = [];
	if (plan.prioritizedTasks.length < 3 || plan.prioritizedTasks.length > 5) {
		errors.push('prioritizedTasks must contain 3 to 5 tasks.');
	}
	if (!plan.summary || plan.summary.length < 40) {
		errors.push('summary must be a concrete 1-2 sentence repo-specific summary.');
	}
	if (plan.prioritizedTasks.length > 0 && plan.prioritizedTasks.every(task => task.targetFiles.every(isAgentArtifactPath))) {
		errors.push('prioritizedTasks should not only create agent artifact files; include at least one task that updates an existing repo guidance, workflow, validation, or documentation file from the repository inventory.');
	}
	if (plan.prioritizedTasks.length > 0 && plan.prioritizedTasks.every(task => task.validationCommands.every(isWeakValidationCommand))) {
		errors.push('validationCommands are too weak across the plan; include at least one repo validation command or content check such as grep, npm run check, dotnet test, make test, or pytest.');
	}

	plan.prioritizedTasks.forEach((task, index) => {
		const label = `Task ${index + 1}`;
		if (task.title.length < 8 || task.title.length > 90) {
			errors.push(`${label} title must be specific and between 8 and 90 characters.`);
		}
		if (task.instructions.length < 80) {
			errors.push(`${label} instructions must be specific enough for a coding agent to execute, at least 80 characters.`);
		}
		if (task.targetFiles.length === 0 || task.targetFiles.some(file => !isConcreteTargetFile(file))) {
			errors.push(`${label} targetFiles must contain concrete repo-relative file paths, not placeholders or vague directories.`);
		}
		if (task.acceptanceCriteria.length < 2) {
			errors.push(`${label} must include at least two acceptance criteria.`);
		}
		if (task.validationCommands.length === 0) {
			errors.push(`${label} should include at least one validation command or manual verification command.`);
		}
		if (aiTooling === 'generic' && task.targetFiles.some(isVendorSpecificPath)) {
			errors.push(`${label} uses vendor-specific target files while AI tooling is generic.`);
		}
		const missingReferences = referencedRepoPaths(task)
			.filter(path => !isPlannedTarget(path, task.targetFiles))
			.filter(path => !inventoryHasPath(inventory, path));
		if (missingReferences.length > 0) {
			errors.push(`${label} references paths that were not found in the repository inventory: ${missingReferences.join(', ')}.`);
		}
	});

	return errors;
}

function isQualityValidationError(error: string): boolean {
	return QUALITY_ERROR_MARKERS.some(marker => error.includes(marker));
}

interface RepoInventory {
	files: Set<string>;
	dirs: Set<string>;
	list: string[];
}

async function collectValidationCommandCandidates(repoPath: string, inventory: RepoInventory): Promise<string[]> {
	const candidatePaths = [
		'AGENTS.md',
		'README.md',
		'package.json',
		'Makefile',
		...inventory.list.filter(path => path.startsWith('.github/workflows/') && (path.endsWith('.yml') || path.endsWith('.yaml'))),
		...inventory.list.filter(path => path.endsWith('.slnx') || path.endsWith('.sln'))
	].filter((path, index, all) => all.indexOf(path) === index);

	const commands = new Set<string>();
	for (const path of candidatePaths.slice(0, 16)) {
		let content = '';
		try {
			content = await readFile(join(repoPath, path), 'utf-8');
		} catch {
			continue;
		}
		extractValidationCommands(path, content).forEach(command => commands.add(command));
	}
	return [...commands].slice(0, 8);
}

function extractValidationCommands(path: string, content: string): string[] {
	if (path === 'package.json') {
		return extractPackageScriptCommands(content);
	}
	const commands = new Set<string>();
	const patterns = [
		/\b(?:npm|pnpm|yarn) run [A-Za-z0-9:_-]+/g,
		/\bdotnet test(?: [A-Za-z0-9_./-]+)?/g,
		/\bmake [A-Za-z0-9:_-]+/g,
		/\bpytest(?: [A-Za-z0-9_./-]+)?/g,
		/\bcargo test\b/g,
		/\bgo test \.\/\.\.\./g
	];
	for (const pattern of patterns) {
		for (const match of content.match(pattern) ?? []) {
			commands.add(match.trim());
		}
	}
	return [...commands];
}

function extractPackageScriptCommands(content: string): string[] {
	try {
		const parsed = JSON.parse(content);
		if (!isRecord(parsed) || !isRecord(parsed.scripts)) return [];
		return Object.keys(parsed.scripts)
			.filter(name => /^(check|test|lint|build|typecheck|validate)/.test(name))
			.map(name => `npm run ${name}`)
			.slice(0, 6);
	} catch {
		return [];
	}
}

async function collectRepoInventory(repoPath: string): Promise<RepoInventory> {
	const files = new Set<string>();
	const dirs = new Set<string>();
	await collectInventoryDir(repoPath, repoPath, files, dirs);
	const list = [...files, ...[...dirs].map(dir => `${dir}/`)].sort().slice(0, 500);
	return { files, dirs, list };
}

async function collectInventoryDir(root: string, current: string, files: Set<string>, dirs: Set<string>, depth = 0): Promise<void> {
	if (depth > 6) return;
	let entries: string[];
	try {
		entries = await readdir(current);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (['.git', 'node_modules', '.svelte-kit', 'bin', 'obj', '.terraform'].includes(entry)) continue;
		const full = join(current, entry);
		try {
			const s = await stat(full);
			const relative = full.slice(root.length + 1).replace(/\\/g, '/');
			if (s.isDirectory()) {
				dirs.add(relative);
				await collectInventoryDir(root, full, files, dirs, depth + 1);
			} else if (s.isFile()) {
				files.add(relative);
			}
		} catch {
			// skip unreadable paths
		}
	}
}

function referencedRepoPaths(task: ImprovementTask): string[] {
	const text = [
		task.instructions,
		...task.acceptanceCriteria,
		...task.validationCommands
	].join('\n');
	const matches = text.match(/(?:`([^`]+)`|((?:\.?[A-Za-z0-9_-]+\/)[A-Za-z0-9_./*{}-]+)|([A-Za-z0-9_.-]+\.(?:md|json|yml|yaml|cs|csproj|slnx|tf|sh)))/g) ?? [];
	return [...new Set(matches
		.map(match => match.replace(/^`|`$/g, '').trim())
		.map(normalizeReferencedPath)
		.filter(path => path.length > 0)
		.filter(path => !path.includes(' '))
		.filter(path => path.includes('/') || path !== 'SKILL.md')
		.filter(path => !path.startsWith('http')))];
}

function isPlannedTarget(path: string, targetFiles: string[]): boolean {
	return targetFiles.some(target => {
		const normalizedTarget = normalizeReferencedPath(target);
		const targetName = normalizedTarget.split('/').at(-1);
		return path === normalizedTarget
			|| (path === targetName && targetName !== 'SKILL.md')
			|| path.startsWith(`${normalizedTarget}/`)
			|| normalizedTarget.startsWith(`${path}/`);
	});
}

function normalizeReferencedPath(path: string): string {
	return path
		.replace(/[.,;:!?]+$/g, '')
		.replace(/^\.\//, '')
		.replace(/\*\*?\/?$/g, '')
		.replace(/\/\.$/, '')
		.replace(/\/$/, '');
}

function inventoryHasPath(inventory: RepoInventory, path: string): boolean {
	if (inventory.files.has(path) || inventory.dirs.has(path)) return true;
	if (path.includes('*')) {
		const prefix = path.split('*')[0].replace(/\/$/, '');
		return [...inventory.files, ...inventory.dirs].some(item => item.startsWith(prefix));
	}
	return false;
}

function isAgentArtifactPath(file: string): boolean {
	return file.startsWith('.agent/')
		|| file.startsWith('.cursor/')
		|| file.startsWith('.claude/')
		|| file.startsWith('.windsurf/')
		|| file.startsWith('.github/copilot-instructions.md')
		|| file.startsWith('.github/instructions/')
		|| file.startsWith('.github/prompts/');
}

function isWeakValidationCommand(command: string): boolean {
	const normalized = command.trim().toLowerCase();
	if (!normalized) return true;
	if (/^(test \-f|ls |dir |stat )/.test(normalized)) return true;
	if (/^(grep|rg|npm |pnpm |yarn |dotnet |make |pytest|cargo |go test|python |python3 )/.test(normalized)) return false;
	return normalized.includes('verify') || normalized.includes('manual');
}

function isConcreteTargetFile(file: string): boolean {
	if (!file || file.includes('<') || file.includes('>')) return false;
	if (file === 'To be determined') return false;
	if (file.endsWith('/')) return false;
	return file.includes('.') || file.includes('/');
}

function isVendorSpecificPath(file: string): boolean {
	return file.startsWith('.cursor/')
		|| file.startsWith('.claude/')
		|| file.startsWith('.windsurf/')
		|| file === '.github/copilot-instructions.md'
		|| file.startsWith('.github/instructions/')
		|| file.startsWith('.github/prompts/');
}

function normalizeTasks(value: unknown): ImprovementTask[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): ImprovementTask | null => {
			if (!isRecord(item)) return null;
			const title = stringValue(item.title);
			const category = categoryValue(item.category);
			const instructions = stringValue(item.instructions);
			if (!title || !category || !instructions) return null;
			return {
				title,
				category,
				impact: priorityValue(item.impact),
				effort: priorityValue(item.effort),
				targetFiles: stringArray(item.targetFiles),
				instructions,
				acceptanceCriteria: stringArray(item.acceptanceCriteria),
				validationCommands: stringArray(item.validationCommands)
			};
		})
		.filter((task): task is ImprovementTask => Boolean(task))
		.slice(0, 8);
}

function rewriteTaskForTooling(task: ImprovementTask, aiTooling: AiTooling): ImprovementTask {
	const targetFiles = task.targetFiles.map(path => rewriteVendorSpecificPath(path, aiTooling));
	return {
		...task,
		title: replaceVendorText(task.title, aiTooling),
		targetFiles,
		instructions: replaceVendorText(task.instructions, aiTooling),
		acceptanceCriteria: task.acceptanceCriteria.map(item => replaceVendorText(item, aiTooling)),
		validationCommands: task.validationCommands.map(item => replaceVendorText(item, aiTooling))
	};
}

function rewriteVendorSpecificPath(path: string, aiTooling: AiTooling): string {
	if (aiTooling === 'cursor') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.cursor/rules/').replace(/\.md$/, '.mdc');
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.cursor/');
		return path;
	}
	if (aiTooling === 'claude') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.claude/rules/');
		if (path.startsWith('.agent/skills/')) return path.replace('.agent/skills/', '.claude/skills/');
		if (path.startsWith('.agent/agents/')) return path.replace('.agent/agents/', '.claude/agents/');
		return path;
	}
	if (aiTooling === 'copilot') {
		if (path === '.agent/instructions.md') return '.github/copilot-instructions.md';
		if (path.startsWith('.agent/instructions/')) return path.replace('.agent/instructions/', '.github/instructions/');
		if (path.startsWith('.agent/prompts/')) return path.replace('.agent/prompts/', '.github/prompts/');
		return path;
	}
	if (aiTooling === 'windsurf') {
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.windsurf/');
		return path;
	}
	if (path.startsWith('.cursor/rules/')) return path.replace('.cursor/rules/', '.agent/rules/').replace(/\.mdc$/, '.md');
	if (path.startsWith('.cursor/')) return path.replace('.cursor/', '.agent/');
	if (path.startsWith('.claude/')) return path.replace('.claude/', '.agent/');
	if (path.startsWith('.windsurf/')) return path.replace('.windsurf/', '.agent/');
	if (path === '.github/copilot-instructions.md') return '.agent/instructions.md';
	if (path.startsWith('.github/instructions/')) return path.replace('.github/instructions/', '.agent/instructions/');
	if (path.startsWith('.github/prompts/')) return path.replace('.github/prompts/', '.agent/prompts/');
	return path;
}

function replaceVendorText(value: string, aiTooling: AiTooling): string {
	if (aiTooling === 'cursor') {
		return value
			.replace(/\.agent\/rules\/([A-Za-z0-9_./-]+)\.md\b/g, '.cursor/rules/$1.mdc')
			.replace(/\.agent\//g, '.cursor/');
	}
	if (aiTooling !== 'generic') return value;
	return value
		.replace(/\bCursor\b/g, 'agent')
		.replace(/\.cursor\/rules\//g, '.agent/rules/')
		.replace(/\.cursor\//g, '.agent/')
		.replace(/\.claude\//g, '.agent/')
		.replace(/\.windsurf\//g, '.agent/')
		.replace(/\.github\/copilot-instructions\.md/g, '.agent/instructions.md')
		.replace(/\.github\/instructions\//g, '.agent/instructions/')
		.replace(/\.github\/prompts\//g, '.agent/prompts/')
		.replace(/\.mdc\b/g, '.md');
}

function renderImprovementMarkdown(plan: ImprovementPlan): string {
	const lines = [
		`# Repo Improvement Plan: ${plan.repoName}`,
		'',
		'You are an AI coding agent working in this repository. Complete the tasks below in order. For each task, make the smallest safe code or documentation changes, run the validation commands, and report what changed.',
		'',
		'## Current Score',
		`Score: ${plan.currentScore}`,
		`Band: ${plan.currentBand}`,
		'',
		'## Summary',
		plan.summary,
		'',
		'## Prioritized Tasks'
	];

	plan.prioritizedTasks.forEach((task, index) => {
		lines.push(
			'',
			`### ${index + 1}. ${task.title}`,
			`Category: ${CATEGORY_LABELS[task.category]}`,
			`Impact: ${task.impact}`,
			`Effort: ${task.effort}`,
			'',
			'Target files:',
			...(task.targetFiles.length > 0 ? task.targetFiles.map(file => `- ${file}`) : ['- To be determined']),
			'',
			'Task:',
			task.instructions,
			'',
			'Acceptance criteria:',
			...(task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map(item => `- ${item}`) : ['- The requested repo improvement exists and is specific to this repository']),
			'',
			'Validation:',
			...(task.validationCommands.length > 0 ? task.validationCommands.map(command => `- ${command}`) : ['- Run the repository validation command documented by the repo'])
		);
	});

	return lines.join('\n');
}

async function ensureAgentsPointer(agentsPath: string): Promise<void> {
	let content = '';
	if (existsSync(agentsPath)) {
		content = await readFile(agentsPath, 'utf-8');
	}
	if (content.includes(EXPORTED_PLAN_PATH)) {
		return;
	}
	const next = content.trim()
		? `${content.trim()}\n\n${AGENTS_POINTER}`
		: `# Agent Guidance\n\n${AGENTS_POINTER}`;
	await writeFile(agentsPath, next);
}

function buildImprovementPrompt(
	repoName: string,
	rubric: string,
	score: ScoreResult,
	files: { relativePath: string; content: string }[],
	inventory: RepoInventory,
	validationCandidates: string[],
	aiTooling: AiTooling
): string {
	const evidence = files.length === 0
		? 'No agent-related files found in this repository.'
		: files.map(file => `### ${file.relativePath}\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n');

	return `You are creating a practical improvement plan for a repository.

## REPOSITORY
${repoName}

## CURRENT SCORE RESULT
${JSON.stringify(score, null, 2)}

## RUBRIC
${rubric}

## REPOSITORY EVIDENCE
${evidence}

## REPOSITORY PATH INVENTORY
Use these paths when referencing existing files or directories. Do not cite existing repo paths that are absent from this inventory.
${inventory.list.map(path => `- ${path}`).join('\n')}

## VALIDATION COMMAND CANDIDATES
Prefer these commands when they fit the task. If none fit, use a concrete content check such as grep -q.
${validationCandidates.length > 0 ? validationCandidates.map(command => `- ${command}`).join('\n') : '- No validation commands were found in repo files.'}

## TASK
Return ONLY a JSON object that a human or coding LLM can use to improve the repository.

## AI TOOLING TARGET
${toolingInstruction(aiTooling)}

Required schema:
{
  "summary": <short summary string>,
  "strongestCategories": [<category keys>],
  "weakestCategories": [<category keys>],
  "prioritizedTasks": [
    {
      "title": <short task title>,
      "category": <one category key>,
      "impact": <"high" | "medium" | "low">,
      "effort": <"high" | "medium" | "low">,
      "targetFiles": [<repo-relative files or directories to create/update>],
      "instructions": <specific implementation instructions an LLM can execute>,
      "acceptanceCriteria": [<observable completion checks>],
      "validationCommands": [<commands to run, if known>]
    }
  ]
}

Plan quality hints:
- A good small-model plan often has one task that updates existing guidance such as AGENTS.md or README.md.
- A good small-model plan often has one task that creates scoped rules for a real source, docs, or infra path from the inventory.
- A good small-model plan often has one task that creates a reusable workflow skill or verifier agent tied to real repo files.
- Prefer validation commands from VALIDATION COMMAND CANDIDATES. If using a new-file existence check, also include at least one grep/content check or repo test/check command somewhere in the plan.

Rules:
- Include exactly 3 to 5 prioritized tasks. This is a next-action batch, not a full roadmap.
- Optimize for the highest score impact first.
- Each task must be independently actionable in one coding-agent session.
- At least one task must improve or update an existing repo file from REPOSITORY PATH INVENTORY, such as AGENTS.md, README.md, package scripts, CI workflow files, docs, or validation workflow guidance. Do not make every task only create new .agent files.
- Prefer portable, agent-agnostic files such as AGENTS.md, .agent/improvement-plan.md, .agent/rules/*.md, .agent/skills/*/SKILL.md, .agent/agents/*.md, docs/adr/*.md, Makefile, package scripts, and CI workflow files when CI already exists.
- If AI TOOLING TARGET is generic, do not recommend tool/vendor-specific files such as .cursor/**, .claude/**, .windsurf/**, or .github/copilot-instructions.md.
- If AI TOOLING TARGET names a specific tool, recommend that tool's conventional files where appropriate.
- Every task must have concrete repo-relative targetFiles.
- References to existing source, test, docs, schemas, or config files must use paths present in REPOSITORY PATH INVENTORY.
- New files are allowed only when they are listed in targetFiles.
- Every task must have at least two acceptanceCriteria.
- Every task must have at least one validationCommands entry. Existence checks such as "test -f ..." are allowed for new files, but at least one task in the plan must include a stronger repo validation command or content check such as "npm run check", "dotnet test ...", "make test", "pytest", or "grep -q ...".
- Tie each task to one weak or improvable category.
- Do not invent product facts not supported by the evidence.
- Return exactly one raw JSON object. Do not return markdown, commentary, code fences, or explanations.

Example shape:
{
  "summary": "This repo has useful baseline guidance but needs portable scoped rules, reusable workflow instructions, and validation hooks so agents can make repeatable changes safely.",
  "strongestCategories": ["persistent_guidance"],
  "weakestCategories": ["scoped_rules", "skills", "validation_reproducibility"],
  "prioritizedTasks": [
    {
      "title": "Add portable scoped repo rules",
      "category": "scoped_rules",
      "impact": "high",
      "effort": "medium",
      "targetFiles": [".agent/rules/repo-guidance.md"],
      "instructions": "Create repo-specific scoped guidance for the highest-risk code areas. Include conventions, ownership boundaries, and the exact validation commands agents should run before reporting completion.",
      "acceptanceCriteria": ["The file contains repo-specific path or module guidance", "The file includes concrete validation commands"],
      "validationCommands": ["test -f .agent/rules/repo-guidance.md"]
    }
  ]
}`;
}

function toolingInstruction(aiTooling: AiTooling): string {
	switch (aiTooling) {
		case 'cursor':
			return 'Cursor. Use Cursor-specific files such as .cursor/rules/*.mdc only where they are the right target.';
		case 'claude':
			return 'Claude. Use Claude-specific files such as .claude/rules/*.md, .claude/skills/*/SKILL.md, and .claude/agents/*.md only where they are the right target.';
		case 'copilot':
			return 'GitHub Copilot. Use files such as .github/copilot-instructions.md, .github/instructions/*.instructions.md, and .github/prompts/*.prompt.md only where they are the right target.';
		case 'windsurf':
			return 'Windsurf. Use Windsurf-specific files only where they are the right target.';
		default:
			return 'Generic / portable. Use agent-agnostic files such as AGENTS.md and .agent/**. Do not create vendor-specific AI tool files.';
	}
}

function buildRepairPrompt(
	raw: string,
	repoName: string,
	score: ScoreResult,
	validationErrors: string[],
	inventory: RepoInventory,
	validationCandidates: string[],
	aiTooling: AiTooling
): string {
	const repairInventory = inventory.list.slice(0, 200);
	return `Return one valid JSON object for an improvement plan for ${repoName}. Do not include markdown, comments, code fences, or explanation.

Current score:
${JSON.stringify(score, null, 2)}

AI tooling target:
${toolingInstruction(aiTooling)}

Validation errors to fix:
${validationErrors.map(error => `- ${error}`).join('\n')}

You must fix every listed validation error. Preserve valid repo-specific references where possible. Do not remove tasks unless a task cannot be repaired.

Repository path inventory:
Use these paths when referencing existing files or directories. Do not cite existing repo paths that are absent from this inventory unless they are new files listed in targetFiles.
${repairInventory.map(path => `- ${path}`).join('\n')}

Validation command candidates:
Prefer these commands when they fit the task. If none fit, use a concrete content check such as grep -q.
${validationCandidates.length > 0 ? validationCandidates.map(command => `- ${command}`).join('\n') : '- No validation commands were found in repo files.'}

Required keys:
- summary
- strongestCategories
- weakestCategories
- prioritizedTasks with title, category, impact, effort, targetFiles, instructions, acceptanceCriteria, validationCommands

Repair rules:
- Return exactly one raw JSON object.
- Include exactly 3 to 5 prioritizedTasks.
- Every task needs concrete targetFiles, specific instructions, at least two acceptanceCriteria, and at least one validationCommands entry.
- Do not make every task only create new .agent files. Include at least one task that updates an existing repo guidance, workflow, validation, or docs file from the inventory.
- Do not use only existence/listing checks. Include at least one stronger repo validation command or content check such as grep, npm run check, dotnet test, make test, or pytest.
- Generic tooling must use AGENTS.md and .agent/**, not vendor-specific files.

Original model output to repair:
${raw}`;
}

function normalizeCategoryList(value: unknown): (keyof CategoryScores)[] {
	if (!Array.isArray(value)) return [];
	return value.map(categoryValue).filter((item): item is keyof CategoryScores => Boolean(item));
}

function categoryValue(value: unknown): keyof CategoryScores | null {
	return typeof value === 'string' && CATEGORY_KEYS.includes(value as keyof CategoryScores)
		? value as keyof CategoryScores
		: null;
}

function priorityValue(value: unknown): 'high' | 'medium' | 'low' {
	return typeof value === 'string' && IMPACT_VALUES.includes(value as 'high' | 'medium' | 'low')
		? value as 'high' | 'medium' | 'low'
		: 'medium';
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(stringValue).filter(Boolean);
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonObject(raw: string): string | null {
	const start = raw.indexOf('{');
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < raw.length; i += 1) {
		const char = raw[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) return raw.slice(start, i + 1);
		}
	}
	return null;
}
