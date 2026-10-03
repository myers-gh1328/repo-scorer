import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImprovementPlansStore, RepoConfig, ScoreHistoryStore, ScoresStore } from '$lib/types';
import { DEFAULT_EVALUATION_MODE } from '$lib/types';
import { dataDirPath, normalizeMode, nowIso, repoIdByName } from './storageRecords';
import type { Storage } from './storage';

// Imports the pre-SQLite JSON stores from the data directory once; the files are left in place as backups.
const JSON_IMPORT_MIGRATION = 2;

export function importJsonBackupsOnce(db: Database.Database, store: Storage): void {
	const imported = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(JSON_IMPORT_MIGRATION);
	if (imported) return;
	const dataDir = dataDirPath();
	const importData = db.transaction(() => {
		for (const repo of readJson<RepoConfig[]>(join(dataDir, 'repos.config.json'), [])) {
			if (!repo?.name || !repo?.path) continue;
			if (store.getRepo(repo.name)) continue;
			store.addRepo(repo);
		}
		const scores = readJson<ScoresStore>(join(dataDir, 'scores.json'), {});
		for (const [repoName, result] of Object.entries(scores)) {
			ensureRepoForImportedName(store, repoName);
			db.prepare(`
				INSERT OR REPLACE INTO scores (repo_id, evaluation_mode, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				repoIdByName(db, repoName),
				DEFAULT_EVALUATION_MODE,
				result.scoredAt,
				result.resultVersion ?? null,
				result.rubricVersion ?? null,
				result.finalScore ?? result.score,
				result.finalBand ?? result.band,
				JSON.stringify(normalizeMode(result, DEFAULT_EVALUATION_MODE)),
				nowIso()
			);
		}
		const histories = readJson<ScoreHistoryStore>(join(dataDir, 'score-history.json'), {});
		for (const [repoName, history] of Object.entries(histories)) {
			ensureRepoForImportedName(store, repoName);
			const repoId = repoIdByName(db, repoName);
			for (const entry of history.compact ?? []) {
				db.prepare('INSERT INTO score_history (repo_id, evaluation_mode, scored_at, compact_json, full_json) VALUES (?, ?, ?, ?, ?)')
					.run(repoId, DEFAULT_EVALUATION_MODE, entry.scoredAt, JSON.stringify(normalizeMode(entry, DEFAULT_EVALUATION_MODE)), null);
			}
			for (const entry of history.full ?? []) {
				db.prepare('INSERT INTO score_history (repo_id, evaluation_mode, scored_at, compact_json, full_json) VALUES (?, ?, ?, ?, ?)')
					.run(repoId, DEFAULT_EVALUATION_MODE, entry.scoredAt, null, JSON.stringify(normalizeMode(entry, DEFAULT_EVALUATION_MODE)));
			}
		}
		const plans = readJson<ImprovementPlansStore>(join(dataDir, 'improvement-plans.json'), {});
		for (const [repoName, plan] of Object.entries(plans)) {
			ensureRepoForImportedName(store, repoName);
			store.saveImprovementPlan(repoName, {
				...plan,
				sourceRepoPath: plan.sourceRepoPath ?? store.getRepo(repoName)?.path ?? ''
			}, DEFAULT_EVALUATION_MODE);
		}
		db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(JSON_IMPORT_MIGRATION, nowIso());
	});
	importData();
}

function ensureRepoForImportedName(store: Storage, repoName: string): void {
	if (store.getRepo(repoName)) return;
	store.addRepo({ name: repoName, path: repoName, allowPlanExport: false });
}

function readJson<T>(path: string, fallback: T): T {
	try {
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, 'utf-8')) as T;
	} catch {
		return fallback;
	}
}
