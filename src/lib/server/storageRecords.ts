import type Database from 'better-sqlite3';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EvaluationMode, RepoConfig } from '$lib/types';

const DEFAULT_DB_PATH = 'repo-scorer.sqlite';

export function rowToRepo(row: Record<string, unknown>): RepoConfig {
	return {
		name: String(row.name),
		path: String(row.path),
		...(typeof row.visibility === 'string' ? { visibility: row.visibility as RepoConfig['visibility'] } : {}),
		openSource: Boolean(row.openSource),
		allowPlanExport: Boolean(row.allowPlanExport)
	};
}

export function normalizeMode<T>(value: T, mode: EvaluationMode): T {
	if (!isRecord(value)) return value;
	const embeddedMode = value.evaluationMode;
	if (typeof embeddedMode === 'string' && embeddedMode !== mode) {
		throw new Error(`EVALUATION_MODE_MISMATCH: row is "${mode}" but JSON is "${embeddedMode}"`);
	}
	return { ...value, evaluationMode: mode } as T;
}

export function parseStoredJson<T>(raw: string, mode: EvaluationMode): T | null {
	try {
		return normalizeMode(JSON.parse(raw), mode);
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

export function maybeStoredJson<T>(raw: string, mode: EvaluationMode): T[] {
	const parsed = parseStoredJson<T>(raw, mode);
	return parsed ? [parsed] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}

export function dbPath(): string {
	return process.env.REPO_SCORER_DB_PATH ?? join(dataDirPath(), DEFAULT_DB_PATH);
}

export function dataDirPath(): string {
	return process.env.REPO_SCORER_DATA_DIR ?? process.cwd();
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function repoIdByName(db: Database.Database, repoName: string): number {
	const row = db.prepare('SELECT id FROM repos WHERE name = ?').get(repoName) as { id: number } | undefined;
	if (!row) throw new Error(`Repo "${repoName}" not found`);
	return row.id;
}
