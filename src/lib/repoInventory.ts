import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageScripts, walkRepo } from './repoFiles';

const INVENTORY_MAX_DEPTH = 6;
const INVENTORY_MAX_PATHS = 500;
const INVENTORY_IGNORED_DIRS = new Set(['.git', 'node_modules', '.svelte-kit', 'bin', 'obj', '.terraform']);

export interface RepoInventory {
	files: Set<string>;
	dirs: Set<string>;
	list: string[];
}

export async function collectRepoInventory(repoPath: string): Promise<RepoInventory> {
	const entries = await walkRepo(repoPath, { maxDepth: INVENTORY_MAX_DEPTH, ignoredDirs: INVENTORY_IGNORED_DIRS });
	const files = new Set(entries.filter(entry => !entry.isDirectory).map(entry => entry.relativePath));
	const dirs = new Set(entries.filter(entry => entry.isDirectory).map(entry => entry.relativePath));
	const list = [...files, ...[...dirs].map(dir => `${dir}/`)].sort().slice(0, INVENTORY_MAX_PATHS);
	return { files, dirs, list };
}

export async function collectValidationCommandCandidates(repoPath: string, inventory: RepoInventory): Promise<string[]> {
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
		extractRunnableCommands(path, content).forEach(command => commands.add(command));
	}
	return [...commands].slice(0, 8);
}

function extractRunnableCommands(path: string, content: string): string[] {
	if (path === 'package.json') {
		return packageScripts(content)
			.map(([name]) => name)
			.filter(name => /^(check|test|lint|build|typecheck|validate)/.test(name))
			.map(name => `npm run ${name}`)
			.slice(0, 6);
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
