import Database from 'better-sqlite3';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compactHistoryEntry, pruneCompactHistory } from '$lib/scoreHistory';
import type {
	ImprovementPlan,
	ImprovementPlansStore,
	RepoConfig,
	RepoScoreHistory,
	ScoreHistoryEntry,
	ScoreHistoryStore,
	ScoreResult,
	ScoresStore
} from '$lib/types';

const DEFAULT_DB_PATH = 'repo-scorer.sqlite';
const JSON_IMPORT_MIGRATION = 2;

let singleton: Storage | null = null;

export class Storage {
	private db: Database.Database;

	constructor(path = dbPath()) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.migrate();
		this.importJsonBackupsOnce();
	}

	close(): void {
		this.db.close();
	}

	listRepos(): RepoConfig[] {
		return this.db.prepare(`
			SELECT name, path, visibility, open_source AS openSource, allow_plan_export AS allowPlanExport
			FROM repos
			ORDER BY name
		`).all().map(row => rowToRepo(row as Record<string, unknown>));
	}

	getRepo(name: string): RepoConfig | null {
		const row = this.db.prepare(`
			SELECT name, path, visibility, open_source AS openSource, allow_plan_export AS allowPlanExport
			FROM repos
			WHERE name = ?
		`).get(name) as Record<string, unknown> | undefined;
		return row ? rowToRepo(row) : null;
	}

	addRepo(repo: RepoConfig): void {
		this.db.prepare(`
			INSERT INTO repos (name, path, canonical_path, visibility, open_source, allow_plan_export, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			repo.name,
			repo.path,
			canonicalPath(repo.path),
			repo.visibility ?? null,
			repo.openSource ? 1 : 0,
			repo.allowPlanExport === true ? 1 : 0,
			nowIso(),
			nowIso()
		);
	}

	replaceRepos(repos: RepoConfig[]): void {
		const replace = this.db.transaction(() => {
			const nextPaths = new Set(repos.map(repo => repo.path));
			const existing = this.listRepos();
			for (const repo of existing) {
				if (!nextPaths.has(repo.path)) {
					this.removeRepoByPath(repo.path);
				}
			}
			for (const repo of repos) {
				this.upsertRepo(repo);
			}
		});
		replace();
	}

	private upsertRepo(repo: RepoConfig): void {
		this.db.prepare(`
			INSERT INTO repos (name, path, canonical_path, visibility, open_source, allow_plan_export, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(path) DO UPDATE SET
				name = excluded.name,
				canonical_path = excluded.canonical_path,
				visibility = excluded.visibility,
				open_source = excluded.open_source,
				allow_plan_export = excluded.allow_plan_export,
				updated_at = excluded.updated_at
		`).run(
			repo.name,
			repo.path,
			canonicalPath(repo.path),
			repo.visibility ?? null,
			repo.openSource ? 1 : 0,
			repo.allowPlanExport === true ? 1 : 0,
			nowIso(),
			nowIso()
		);
	}

	removeRepoByPath(path: string): void {
		this.db.prepare('DELETE FROM repos WHERE path = ?').run(path);
	}

	getScoresStore(): ScoresStore {
		const rows = this.db.prepare(`
			SELECT repos.name AS name, scores.result_json AS resultJson
			FROM scores
			JOIN repos ON repos.id = scores.repo_id
			ORDER BY repos.name
		`).all() as { name: string; resultJson: string }[];
		return Object.fromEntries(rows.map(row => [row.name, JSON.parse(row.resultJson)]));
	}

	getScore(repoName: string): ScoreResult | null {
		const row = this.db.prepare(`
			SELECT scores.result_json AS resultJson
			FROM scores
			JOIN repos ON repos.id = scores.repo_id
			WHERE repos.name = ?
		`).get(repoName) as { resultJson: string } | undefined;
		return row ? JSON.parse(row.resultJson) : null;
	}

	saveScoreWithHistory(repoName: string, result: ScoreResult): void {
		const compact = this.compactHistoryEntryForTest(result);
		const write = this.db.transaction(() => {
			const repoId = this.repoId(repoName);
			this.db.prepare(`
				INSERT INTO scores (repo_id, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(repo_id) DO UPDATE SET
					scored_at = excluded.scored_at,
					result_version = excluded.result_version,
					rubric_version = excluded.rubric_version,
					final_score = excluded.final_score,
					final_band = excluded.final_band,
					result_json = excluded.result_json,
					updated_at = excluded.updated_at
			`).run(
				repoId,
				result.scoredAt,
				result.resultVersion ?? null,
				result.rubricVersion ?? null,
				result.finalScore ?? result.score,
				result.finalBand ?? result.band,
				JSON.stringify(result),
				nowIso()
			);
			this.db.prepare(`
				INSERT INTO score_history (repo_id, scored_at, compact_json, full_json)
				VALUES (?, ?, ?, ?)
			`).run(repoId, result.scoredAt, JSON.stringify(compact), JSON.stringify(result));
		});
		write();
	}

	compactHistoryEntryForTest(result: ScoreResult): ScoreHistoryEntry {
		return compactHistoryEntry(result);
	}

	getScoreHistoryStore(): ScoreHistoryStore {
		const repos = this.listRepos();
		return Object.fromEntries(
			repos
				.map(repo => [repo.name, this.getScoreHistory(repo.name)] as const)
				.filter((entry): entry is [string, RepoScoreHistory] => Boolean(entry[1]))
		);
	}

	getScoreHistory(repoName: string): RepoScoreHistory | null {
		const row = this.db.prepare('SELECT id FROM repos WHERE name = ?').get(repoName) as { id: number } | undefined;
		if (!row) return null;
		const rows = this.db.prepare(`
			SELECT compact_json AS compactJson, full_json AS fullJson
			FROM score_history
			WHERE repo_id = ?
			ORDER BY datetime(scored_at), id
		`).all(row.id) as { compactJson: string | null; fullJson: string | null }[];
		if (rows.length === 0) return null;
		return {
			compact: pruneCompactHistory(rows.flatMap(item => item.compactJson ? [JSON.parse(item.compactJson)] : [])),
			full: rows.flatMap(item => item.fullJson ? [JSON.parse(item.fullJson)] : []).slice(-5)
		};
	}

	getImprovementPlan(repoName: string): ImprovementPlan | null {
		const row = this.db.prepare(`
			SELECT plan_json AS planJson, source_repo_path AS sourceRepoPath, exported_at AS exportedAt,
				exported_plan_path AS exportedPlanPath, exported_agents_path AS exportedAgentsPath
			FROM improvement_plans
			JOIN repos ON repos.id = improvement_plans.repo_id
			WHERE repos.name = ?
		`).get(repoName) as {
			planJson: string;
			sourceRepoPath: string;
			exportedAt: string | null;
			exportedPlanPath: string | null;
			exportedAgentsPath: string | null;
		} | undefined;
		if (!row) return null;
		return {
			...JSON.parse(row.planJson),
			sourceRepoPath: row.sourceRepoPath,
			...(row.exportedAt ? { exportedAt: row.exportedAt } : {}),
			...(row.exportedPlanPath ? { exportedPlanPath: row.exportedPlanPath } : {}),
			...(row.exportedAgentsPath ? { exportedAgentsPath: row.exportedAgentsPath } : {})
		};
	}

	getImprovementPlansStore(): ImprovementPlansStore {
		const plans = this.listRepos()
			.map(repo => [repo.name, this.getImprovementPlan(repo.name)] as const)
			.filter((entry): entry is [string, ImprovementPlan] => Boolean(entry[1]));
		return Object.fromEntries(plans);
	}

	saveImprovementPlan(repoName: string, plan: ImprovementPlan): void {
		const repo = this.getRepo(repoName);
		const sourceRepoPath = plan.sourceRepoPath ?? repo?.path ?? '';
		const nextPlan = { ...plan, sourceRepoPath };
		this.db.prepare(`
			INSERT INTO improvement_plans (
				repo_id, source_repo_path, generated_at, exported_at, exported_plan_path, exported_agents_path, plan_json, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(repo_id) DO UPDATE SET
				source_repo_path = excluded.source_repo_path,
				generated_at = excluded.generated_at,
				exported_at = excluded.exported_at,
				exported_plan_path = excluded.exported_plan_path,
				exported_agents_path = excluded.exported_agents_path,
				plan_json = excluded.plan_json,
				updated_at = excluded.updated_at
		`).run(
			this.repoId(repoName),
			sourceRepoPath,
			nextPlan.generatedAt,
			nextPlan.exportedAt ?? null,
			nextPlan.exportedPlanPath ?? null,
			nextPlan.exportedAgentsPath ?? null,
			JSON.stringify(nextPlan),
			nowIso()
		);
	}

	markImprovementPlanExported(repoName: string, exported: { planPath: string; agentsPath: string }): ImprovementPlan {
		const current = this.getImprovementPlan(repoName);
		if (!current) throw new Error('PLAN_NOT_FOUND');
		const updated = {
			...current,
			exportedAt: nowIso(),
			exportedPlanPath: exported.planPath,
			exportedAgentsPath: exported.agentsPath
		};
		this.saveImprovementPlan(repoName, updated);
		return updated;
	}

	private repoId(repoName: string): number {
		const row = this.db.prepare('SELECT id FROM repos WHERE name = ?').get(repoName) as { id: number } | undefined;
		if (!row) throw new Error(`Repo "${repoName}" not found`);
		return row.id;
	}

	private migrate(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version INTEGER PRIMARY KEY,
				applied_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS repos (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				path TEXT NOT NULL UNIQUE,
				canonical_path TEXT NOT NULL,
				visibility TEXT,
				open_source INTEGER NOT NULL DEFAULT 0,
				allow_plan_export INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS scores (
				repo_id INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
				scored_at TEXT NOT NULL,
				result_version INTEGER,
				rubric_version TEXT,
				final_score INTEGER NOT NULL,
				final_band TEXT NOT NULL,
				result_json TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS score_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
				scored_at TEXT NOT NULL,
				compact_json TEXT,
				full_json TEXT
			);
			CREATE TABLE IF NOT EXISTS improvement_plans (
				repo_id INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
				source_repo_path TEXT NOT NULL,
				generated_at TEXT NOT NULL,
				exported_at TEXT,
				exported_plan_path TEXT,
				exported_agents_path TEXT,
				plan_json TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
	}

	private importJsonBackupsOnce(): void {
		const imported = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(JSON_IMPORT_MIGRATION);
		if (imported) return;
		const dataDir = dataDirPath();
		const importData = this.db.transaction(() => {
			for (const repo of readJson<RepoConfig[]>(join(dataDir, 'repos.config.json'), [])) {
				if (!repo?.name || !repo?.path) continue;
				if (this.getRepo(repo.name)) continue;
				this.addRepo(repo);
			}
			const scores = readJson<ScoresStore>(join(dataDir, 'scores.json'), {});
			for (const [repoName, result] of Object.entries(scores)) {
				this.ensureRepoForImportedName(repoName);
				this.db.prepare(`
					INSERT OR REPLACE INTO scores (repo_id, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`).run(
					this.repoId(repoName),
					result.scoredAt,
					result.resultVersion ?? null,
					result.rubricVersion ?? null,
					result.finalScore ?? result.score,
					result.finalBand ?? result.band,
					JSON.stringify(result),
					nowIso()
				);
			}
			const histories = readJson<ScoreHistoryStore>(join(dataDir, 'score-history.json'), {});
			for (const [repoName, history] of Object.entries(histories)) {
				this.ensureRepoForImportedName(repoName);
				const repoId = this.repoId(repoName);
				for (const entry of history.compact ?? []) {
					this.db.prepare('INSERT INTO score_history (repo_id, scored_at, compact_json, full_json) VALUES (?, ?, ?, ?)')
						.run(repoId, entry.scoredAt, JSON.stringify(entry), null);
				}
				for (const entry of history.full ?? []) {
					this.db.prepare('INSERT INTO score_history (repo_id, scored_at, compact_json, full_json) VALUES (?, ?, ?, ?)')
						.run(repoId, entry.scoredAt, null, JSON.stringify(entry));
				}
			}
			const plans = readJson<ImprovementPlansStore>(join(dataDir, 'improvement-plans.json'), {});
			for (const [repoName, plan] of Object.entries(plans)) {
				this.ensureRepoForImportedName(repoName);
				this.saveImprovementPlan(repoName, {
					...plan,
					sourceRepoPath: plan.sourceRepoPath ?? this.getRepo(repoName)?.path ?? ''
				});
			}
			this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(JSON_IMPORT_MIGRATION, nowIso());
		});
		importData();
	}

	private ensureRepoForImportedName(repoName: string): void {
		if (this.getRepo(repoName)) return;
		this.addRepo({ name: repoName, path: repoName, allowPlanExport: false });
	}
}

export function storage(): Storage {
	if (!singleton) singleton = new Storage();
	return singleton;
}

export function resetStorageForTests(): void {
	singleton?.close();
	singleton = null;
}

function rowToRepo(row: Record<string, unknown>): RepoConfig {
	return {
		name: String(row.name),
		path: String(row.path),
		...(typeof row.visibility === 'string' ? { visibility: row.visibility as RepoConfig['visibility'] } : {}),
		openSource: Boolean(row.openSource),
		allowPlanExport: Boolean(row.allowPlanExport)
	};
}

function readJson<T>(path: string, fallback: T): T {
	try {
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, 'utf-8')) as T;
	} catch {
		return fallback;
	}
}

function canonicalPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}

function dbPath(): string {
	return process.env.REPO_SCORER_DB_PATH ?? join(dataDirPath(), DEFAULT_DB_PATH);
}

function dataDirPath(): string {
	return process.env.REPO_SCORER_DATA_DIR ?? process.cwd();
}

function nowIso(): string {
	return new Date().toISOString();
}
