import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { resetStorageForTests, Storage, storage } from './storage';
import type { ImprovementPlan, RepoConfig, ScoreResult } from '$lib/types';

let dir: string;

function score(scoredAt = '2026-06-25T12:00:00.000Z', value = 72): ScoreResult {
	return {
		scoredAt,
		score: value,
		finalScore: value,
		band: 'Operational',
		finalBand: 'Operational',
		primaryLanguage: 'TypeScript',
		categories: {
			persistent_guidance: 12,
			scoped_rules: 7,
			skills: 4,
			specialized_agents: 7,
			tool_manifests_mcp: 5,
			validation_reproducibility: 7,
			ci_pr_automation: 3,
			security_sandboxing_hooks: 7,
			domain_context: 4,
			governance_observability: 3,
			versioning_provenance: 2,
			onboarding_discoverability: 2
		},
		qualityFlags: [],
		riskFlags: [],
		recommendations: []
	};
}

function plan(repoName = 'repo-a', repoPath = join(dir, 'repo-a')): ImprovementPlan {
	return {
		generatedAt: '2026-06-25T12:30:00.000Z',
		repoName,
		sourceRepoPath: repoPath,
		summary: 'Improve the repository by adding stronger agent guidance and validation.',
		currentScore: 72,
		currentBand: 'Operational',
		strongestCategories: ['persistent_guidance'],
		weakestCategories: ['skills'],
		prioritizedTasks: [],
		markdown: '# Plan'
	};
}

async function makeGitRepo(name: string): Promise<string> {
	const repoPath = join(dir, name);
	await mkdir(join(repoPath, '.git'), { recursive: true });
	return repoPath;
}

describe('storage', () => {
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'repo-scorer-storage-'));
		process.env.REPO_SCORER_DB_PATH = join(dir, 'repo-scorer.sqlite');
		resetStorageForTests();
	});

	afterEach(async () => {
		resetStorageForTests();
		delete process.env.REPO_SCORER_DB_PATH;
		await rm(dir, { recursive: true, force: true });
	});

	it('migrates existing JSON stores once and keeps source files as backups', async () => {
		const repoPath = await makeGitRepo('repo-a');
		await writeFile(join(dir, 'repos.config.json'), JSON.stringify([{ name: 'repo-a', path: repoPath, allowPlanExport: true }]));
		await writeFile(join(dir, 'scores.json'), JSON.stringify({ 'repo-a': score() }));
		await writeFile(join(dir, 'score-history.json'), JSON.stringify({ 'repo-a': { compact: [], full: [score()] } }));
		await writeFile(join(dir, 'improvement-plans.json'), JSON.stringify({ 'repo-a': plan('repo-a', repoPath) }));
		process.env.REPO_SCORER_DATA_DIR = dir;

		const store = storage();

		expect(await store.listRepos()).toEqual([
			expect.objectContaining({ name: 'repo-a', path: repoPath, allowPlanExport: true })
		]);
		expect(await store.getScore('repo-a')).toMatchObject({ score: 72 });
		expect((await store.getScoreHistory('repo-a'))?.full).toHaveLength(1);
		expect(await store.getImprovementPlan('repo-a')).toMatchObject({ repoName: 'repo-a', sourceRepoPath: repoPath });
		await expect(readFile(join(dir, 'scores.json'), 'utf-8')).resolves.toContain('repo-a');
	});

	it('defaults added repositories to export disabled', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();

		await store.addRepo({ name: 'repo-a', path: repoPath });

		expect(await store.listRepos()).toEqual([
			expect.objectContaining({ name: 'repo-a', allowPlanExport: false })
		]);
	});

	it('replacing repo config preserves scores for unchanged repo paths', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });
		await store.saveScoreWithHistory('repo-a', score());

		store.replaceRepos([{ name: 'repo-a-renamed', path: repoPath, allowPlanExport: true }]);

		expect(await store.getScore('repo-a-renamed')).toMatchObject({ score: 72 });
		expect((await store.getScoreHistory('repo-a-renamed'))?.full).toHaveLength(1);
	});

	it('persists latest score and score history in one transaction', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });

		await store.saveScoreWithHistory('repo-a', score('2026-06-25T12:00:00.000Z', 72));

		expect(await store.getScore('repo-a')).toMatchObject({ score: 72, scoredAt: '2026-06-25T12:00:00.000Z' });
		const history = await store.getScoreHistory('repo-a');
		expect(history?.compact.at(-1)).toMatchObject({ finalScore: 72, scoredAt: '2026-06-25T12:00:00.000Z' });
		expect(history?.full.at(-1)).toMatchObject({ score: 72, scoredAt: '2026-06-25T12:00:00.000Z' });
	});

	it('keeps scores, history, and improvement plans isolated by evaluation mode', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });

		await store.saveScoreWithHistory('repo-a', score('2026-06-25T12:00:00.000Z', 72), 'ai-readiness');
		await store.saveScoreWithHistory('repo-a', {
			...score('2026-06-25T13:00:00.000Z', 81),
			categories: { verification_coverage: 12, repository_hygiene: 8 }
		}, 'maintainability');
		await store.saveImprovementPlan('repo-a', plan('repo-a', repoPath), 'ai-readiness');
		await store.saveImprovementPlan('repo-a', {
			...plan('repo-a', repoPath),
			summary: 'Improve maintainability.',
			currentScore: 81,
			currentBand: 'Healthy'
		}, 'maintainability');

		expect(await store.getScore('repo-a')).toMatchObject({ score: 72, evaluationMode: 'ai-readiness' });
		expect(await store.getScore('repo-a', 'maintainability')).toMatchObject({ score: 81, evaluationMode: 'maintainability' });
		expect((await store.getScoreHistory('repo-a'))?.full).toHaveLength(1);
		expect((await store.getScoreHistory('repo-a', 'maintainability'))?.full.at(-1)).toMatchObject({ score: 81 });
		expect(await store.getImprovementPlan('repo-a')).toMatchObject({ currentScore: 72, evaluationMode: 'ai-readiness' });
		expect(await store.getImprovementPlan('repo-a', 'maintainability')).toMatchObject({ currentScore: 81, evaluationMode: 'maintainability' });
	});

	it('migrates old single-mode SQLite scores and plans to ai-readiness composite keys', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const dbPath = join(dir, 'old.sqlite');
		const db = new Database(dbPath);
		db.exec(`
			CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
			CREATE TABLE repos (
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
			CREATE TABLE scores (
				repo_id INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
				scored_at TEXT NOT NULL,
				result_version INTEGER,
				rubric_version TEXT,
				final_score INTEGER NOT NULL,
				final_band TEXT NOT NULL,
				result_json TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE score_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
				scored_at TEXT NOT NULL,
				compact_json TEXT,
				full_json TEXT
			);
			CREATE TABLE improvement_plans (
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
		db.prepare('INSERT INTO repos (id, name, path, canonical_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(1, 'repo-a', repoPath, repoPath, 'now', 'now');
		db.prepare('INSERT INTO scores (repo_id, scored_at, result_version, rubric_version, final_score, final_band, result_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(1, '2026-06-25T12:00:00.000Z', 2, '1.0', 72, 'Operational', JSON.stringify(score()), 'now');
		db.prepare('INSERT INTO score_history (repo_id, scored_at, compact_json, full_json) VALUES (?, ?, ?, ?)').run(1, '2026-06-25T12:00:00.000Z', null, JSON.stringify(score()));
		db.prepare('INSERT INTO improvement_plans (repo_id, source_repo_path, generated_at, plan_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(1, repoPath, '2026-06-25T12:30:00.000Z', JSON.stringify(plan('repo-a', repoPath)), 'now');
		db.close();

		const store = new Storage(dbPath);
		try {
			expect(store.getScore('repo-a')).toMatchObject({ score: 72, evaluationMode: 'ai-readiness' });
			expect(store.getScore('repo-a', 'maintainability')).toBeNull();
			expect(store.getImprovementPlan('repo-a')).toMatchObject({ evaluationMode: 'ai-readiness' });
			await store.saveScoreWithHistory('repo-a', { ...score('2026-06-25T13:00:00.000Z', 80), categories: { verification_coverage: 10 } }, 'maintainability');
			expect(store.getScore('repo-a')).toMatchObject({ score: 72 });
			expect(store.getScore('repo-a', 'maintainability')).toMatchObject({ score: 80 });
		} finally {
			store.close();
		}
	});

	it('fails closed when stored JSON evaluation mode conflicts with the row mode', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });
		await store.saveScoreWithHistory('repo-a', { ...score(), evaluationMode: 'ai-readiness' }, 'ai-readiness');
		store.close();
		resetStorageForTests();

		const db = new Database(process.env.REPO_SCORER_DB_PATH);
		db.prepare('UPDATE scores SET evaluation_mode = ? WHERE evaluation_mode = ?').run('maintainability', 'ai-readiness');
		db.close();

		const reopened = storage();
		expect(() => reopened.getScore('repo-a', 'maintainability')).toThrow(/EVALUATION_MODE_MISMATCH/);
	});

	it('rolls back score persistence when history insertion fails', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });
		await store.saveScoreWithHistory('repo-a', score('2026-06-25T12:00:00.000Z', 72));
		vi.spyOn(store, 'compactHistoryEntryForTest').mockImplementation(() => {
			throw new Error('history failed');
		});

		expect(() => store.saveScoreWithHistory('repo-a', score('2026-06-25T13:00:00.000Z', 80))).toThrow('history failed');

		expect(await store.getScore('repo-a')).toMatchObject({ score: 72, scoredAt: '2026-06-25T12:00:00.000Z' });
	});

	it('stores improvement plans with source repo path and export metadata', async () => {
		const repoPath = await makeGitRepo('repo-a');
		const store = storage();
		await store.addRepo({ name: 'repo-a', path: repoPath });

		await store.saveImprovementPlan('repo-a', plan('repo-a', repoPath));
		await store.markImprovementPlanExported('repo-a', {
			planPath: '.agent/improvement-plan.md',
			agentsPath: 'AGENTS.md'
		});

		expect(await store.getImprovementPlan('repo-a')).toMatchObject({
			repoName: 'repo-a',
			sourceRepoPath: repoPath,
			exportedPlanPath: '.agent/improvement-plan.md',
			exportedAgentsPath: 'AGENTS.md'
		});
	});
});
