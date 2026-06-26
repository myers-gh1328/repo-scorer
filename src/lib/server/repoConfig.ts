import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import type { RepoConfig } from '$lib/types';
import { storage } from './storage';

const DEFAULT_SEARCH_ROOTS = [
	join(homedir(), 'source', 'repos'),
	join(homedir(), 'src'),
	join(homedir(), 'repos')
];

export async function readRepoConfig(): Promise<RepoConfig[]> {
	return storage().listRepos();
}

export async function writeRepoConfig(repos: RepoConfig[]): Promise<void> {
	const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
	storage().replaceRepos(sorted);
}

export function normalizeRepoName(path: string): string {
	return basename(path).trim();
}

export async function isGitRepo(path: string): Promise<boolean> {
	if (!path || !existsSync(path)) return false;
	try {
		const s = await stat(path);
		return s.isDirectory() && existsSync(join(path, '.git'));
	} catch {
		return false;
	}
}

async function discoverUnder(root: string): Promise<RepoConfig[]> {
	let entries: string[];
	try {
		entries = await readdir(root);
	} catch {
		return [];
	}

	const repos: RepoConfig[] = [];
	for (const entry of entries) {
		const full = join(root, entry);
		if (await isGitRepo(full)) {
			repos.push({ name: normalizeRepoName(full), path: full });
		}
	}
	return repos;
}

export async function discoverRepos(): Promise<RepoConfig[]> {
	const roots = (process.env.REPO_SEARCH_ROOTS?.split(',') ?? DEFAULT_SEARCH_ROOTS)
		.map(root => root.trim())
		.filter(Boolean);
	const discovered = (await Promise.all(roots.map(discoverUnder))).flat();
	const byPath = new Map<string, RepoConfig>();
	for (const repo of discovered) {
		byPath.set(repo.path, repo);
	}
	return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name));
}

