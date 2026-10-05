import type Database from 'better-sqlite3';

export function migrateSchema(db: Database.Database): void {
	db.exec(`
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
			evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness',
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
			evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness',
			scored_at TEXT NOT NULL,
			compact_json TEXT,
			full_json TEXT
		);
		CREATE TABLE IF NOT EXISTS improvement_plans (
			repo_id INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
			evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness',
			source_repo_path TEXT NOT NULL,
			generated_at TEXT NOT NULL,
			exported_at TEXT,
			exported_plan_path TEXT,
			exported_agents_path TEXT,
			plan_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`);
	migrateEvaluationModeKeys(db);
}

function migrateEvaluationModeKeys(db: Database.Database): void {
	const scoreColumns = tableColumns(db, 'scores');
	const scorePkColumns = scoreColumns.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name);
	const scoresHaveMode = scoreColumns.some(column => column.name === 'evaluation_mode');
	if (!scoresHaveMode || scorePkColumns.join(',') !== 'repo_id,evaluation_mode') {
		const modeExpression = scoresHaveMode ? "COALESCE(evaluation_mode, 'ai-readiness')" : "'ai-readiness'";
		db.exec(`
			CREATE TABLE IF NOT EXISTS scores_next (
				repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
				evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness',
				scored_at TEXT NOT NULL,
				result_version INTEGER,
				rubric_version TEXT,
				final_score INTEGER NOT NULL,
				final_band TEXT NOT NULL,
				result_json TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (repo_id, evaluation_mode)
			);
			INSERT OR REPLACE INTO scores_next (
				repo_id, evaluation_mode, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at
			)
			SELECT repo_id, ${modeExpression}, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at
			FROM scores;
			DROP TABLE scores;
			ALTER TABLE scores_next RENAME TO scores;
		`);
	}

	const historyColumns = tableColumns(db, 'score_history');
	if (!historyColumns.some(column => column.name === 'evaluation_mode')) {
		db.exec("ALTER TABLE score_history ADD COLUMN evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness';");
	}

	const planColumns = tableColumns(db, 'improvement_plans');
	const planPkColumns = planColumns.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name);
	const plansHaveMode = planColumns.some(column => column.name === 'evaluation_mode');
	if (!plansHaveMode || planPkColumns.join(',') !== 'repo_id,evaluation_mode') {
		const modeExpression = plansHaveMode ? "COALESCE(evaluation_mode, 'ai-readiness')" : "'ai-readiness'";
		db.exec(`
			CREATE TABLE IF NOT EXISTS improvement_plans_next (
				repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
				evaluation_mode TEXT NOT NULL DEFAULT 'ai-readiness',
				source_repo_path TEXT NOT NULL,
				generated_at TEXT NOT NULL,
				exported_at TEXT,
				exported_plan_path TEXT,
				exported_agents_path TEXT,
				plan_json TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (repo_id, evaluation_mode)
			);
			INSERT OR REPLACE INTO improvement_plans_next (
				repo_id, evaluation_mode, source_repo_path, generated_at, exported_at, exported_plan_path, exported_agents_path, plan_json, updated_at
			)
			SELECT repo_id, ${modeExpression}, source_repo_path, generated_at, exported_at, exported_plan_path, exported_agents_path, plan_json, updated_at
			FROM improvement_plans;
			DROP TABLE improvement_plans;
			ALTER TABLE improvement_plans_next RENAME TO improvement_plans;
		`);
	}
}

function tableColumns(db: Database.Database, table: string): { name: string; pk: number }[] {
	return db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[];
}
