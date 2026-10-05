import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
import { DEFAULT_EVALUATION_MODE, type EvaluationMode } from '$lib/types';
import { migrateSchema } from './storageSchema';
import { importJsonBackupsOnce } from './storageLegacyImport';
import { canonicalPath, dbPath, maybeStoredJson, nowIso, parseStoredJson, repoIdByName, rowToRepo } from './storageRecords';

let singleton: Storage | null = null;

export class Storage {
	private db: Database.Database;

	constructor(path = dbPath()) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		migrateSchema(this.db);
		importJsonBackupsOnce(this.db, this);
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

	getScoresStore(mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ScoresStore {
		const rows = this.db.prepare(`
			SELECT repos.name AS name, scores.result_json AS resultJson
			FROM scores
			JOIN repos ON repos.id = scores.repo_id
			WHERE scores.evaluation_mode = ?
			ORDER BY repos.name
		`).all(mode) as { name: string; resultJson: string }[];
		return Object.fromEntries(rows.flatMap(row => {
			const result = parseStoredJson<ScoreResult>(row.resultJson, mode);
			return result ? [[row.name, result]] : [];
		}));
	}

	getScore(repoName: string, mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ScoreResult | null {
		const row = this.db.prepare(`
			SELECT scores.result_json AS resultJson
			FROM scores
			JOIN repos ON repos.id = scores.repo_id
			WHERE repos.name = ? AND scores.evaluation_mode = ?
		`).get(repoName, mode) as { resultJson: string } | undefined;
		return row ? parseStoredJson<ScoreResult>(row.resultJson, mode) : null;
	}

	saveScoreWithHistory(repoName: string, result: ScoreResult, mode: EvaluationMode = result.evaluationMode ?? DEFAULT_EVALUATION_MODE): void {
		const nextResult = { ...result, evaluationMode: mode };
		const compact = this.compactHistoryEntryForTest(nextResult);
		const write = this.db.transaction(() => {
			const repoId = this.repoId(repoName);
			this.db.prepare(`
				INSERT INTO scores (repo_id, evaluation_mode, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(repo_id, evaluation_mode) DO UPDATE SET
					scored_at = excluded.scored_at,
					result_version = excluded.result_version,
					rubric_version = excluded.rubric_version,
					final_score = excluded.final_score,
					final_band = excluded.final_band,
					result_json = excluded.result_json,
					updated_at = excluded.updated_at
			`).run(
				repoId,
				mode,
				nextResult.scoredAt,
				nextResult.resultVersion ?? null,
				nextResult.rubricVersion ?? null,
				nextResult.finalScore ?? nextResult.score,
				nextResult.finalBand ?? nextResult.band,
				JSON.stringify(nextResult),
				nowIso()
			);
			this.db.prepare(`
				INSERT INTO score_history (repo_id, evaluation_mode, scored_at, compact_json, full_json)
				VALUES (?, ?, ?, ?, ?)
			`).run(repoId, mode, nextResult.scoredAt, JSON.stringify(compact), JSON.stringify(nextResult));
		});
		write();
	}

	compactHistoryEntryForTest(result: ScoreResult): ScoreHistoryEntry {
		return compactHistoryEntry(result);
	}

	getScoreHistoryStore(mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ScoreHistoryStore {
		const repos = this.listRepos();
		return Object.fromEntries(
			repos
				.map(repo => [repo.name, this.getScoreHistory(repo.name, mode)] as const)
				.filter((entry): entry is [string, RepoScoreHistory] => Boolean(entry[1]))
		);
	}

	getScoreHistory(repoName: string, mode: EvaluationMode = DEFAULT_EVALUATION_MODE): RepoScoreHistory | null {
		const row = this.db.prepare('SELECT id FROM repos WHERE name = ?').get(repoName) as { id: number } | undefined;
		if (!row) return null;
		const rows = this.db.prepare(`
			SELECT compact_json AS compactJson, full_json AS fullJson
			FROM score_history
			WHERE repo_id = ? AND evaluation_mode = ?
			ORDER BY datetime(scored_at), id
		`).all(row.id, mode) as { compactJson: string | null; fullJson: string | null }[];
		if (rows.length === 0) return null;
		return {
			compact: pruneCompactHistory(rows.flatMap(item => item.compactJson ? maybeStoredJson<ScoreHistoryEntry>(item.compactJson, mode) : [])),
			full: rows.flatMap(item => item.fullJson ? maybeStoredJson<ScoreResult>(item.fullJson, mode) : []).slice(-5)
		};
	}

	getImprovementPlan(repoName: string, mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ImprovementPlan | null {
		const row = this.db.prepare(`
			SELECT plan_json AS planJson, source_repo_path AS sourceRepoPath, exported_at AS exportedAt,
				exported_plan_path AS exportedPlanPath, exported_agents_path AS exportedAgentsPath
			FROM improvement_plans
			JOIN repos ON repos.id = improvement_plans.repo_id
			WHERE repos.name = ? AND improvement_plans.evaluation_mode = ?
		`).get(repoName, mode) as {
			planJson: string;
			sourceRepoPath: string;
			exportedAt: string | null;
			exportedPlanPath: string | null;
			exportedAgentsPath: string | null;
		} | undefined;
		if (!row) return null;
		const plan = parseStoredJson<ImprovementPlan>(row.planJson, mode);
		if (!plan) return null;
		return {
			...plan,
			sourceRepoPath: row.sourceRepoPath,
			...(row.exportedAt ? { exportedAt: row.exportedAt } : {}),
			...(row.exportedPlanPath ? { exportedPlanPath: row.exportedPlanPath } : {}),
			...(row.exportedAgentsPath ? { exportedAgentsPath: row.exportedAgentsPath } : {})
		};
	}

	getImprovementPlansStore(mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ImprovementPlansStore {
		const plans = this.listRepos()
			.map(repo => [repo.name, this.getImprovementPlan(repo.name, mode)] as const)
			.filter((entry): entry is [string, ImprovementPlan] => Boolean(entry[1]));
		return Object.fromEntries(plans);
	}

	saveImprovementPlan(repoName: string, plan: ImprovementPlan, mode: EvaluationMode = plan.evaluationMode ?? DEFAULT_EVALUATION_MODE): void {
		const repo = this.getRepo(repoName);
		const sourceRepoPath = plan.sourceRepoPath ?? repo?.path ?? '';
		const nextPlan = { ...plan, evaluationMode: mode, sourceRepoPath };
		this.db.prepare(`
			INSERT INTO improvement_plans (
				repo_id, evaluation_mode, source_repo_path, generated_at, exported_at, exported_plan_path, exported_agents_path, plan_json, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(repo_id, evaluation_mode) DO UPDATE SET
				source_repo_path = excluded.source_repo_path,
				generated_at = excluded.generated_at,
				exported_at = excluded.exported_at,
				exported_plan_path = excluded.exported_plan_path,
				exported_agents_path = excluded.exported_agents_path,
				plan_json = excluded.plan_json,
				updated_at = excluded.updated_at
		`).run(
			this.repoId(repoName),
			mode,
			sourceRepoPath,
			nextPlan.generatedAt,
			nextPlan.exportedAt ?? null,
			nextPlan.exportedPlanPath ?? null,
			nextPlan.exportedAgentsPath ?? null,
			JSON.stringify(nextPlan),
			nowIso()
		);
	}

	markImprovementPlanExported(repoName: string, exported: { planPath: string; agentsPath: string }, mode: EvaluationMode = DEFAULT_EVALUATION_MODE): ImprovementPlan {
		const current = this.getImprovementPlan(repoName, mode);
		if (!current) throw new Error('PLAN_NOT_FOUND');
		const updated = {
			...current,
			exportedAt: nowIso(),
			exportedPlanPath: exported.planPath,
			exportedAgentsPath: exported.agentsPath
		};
		this.saveImprovementPlan(repoName, updated, mode);
		return updated;
	}

	private repoId(repoName: string): number {
		return repoIdByName(this.db, repoName);
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
