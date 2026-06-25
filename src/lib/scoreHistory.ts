import { readFile, writeFile } from 'node:fs/promises';
import type { ScoreHistoryEntry, ScoreHistoryStore, ScoreResult } from './types';
import { withScoreWriteLock } from './server/scoreConcurrency';

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const WEEKLY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_FULL_SNAPSHOTS = 5;

export function compactHistoryEntry(result: ScoreResult): ScoreHistoryEntry {
	const finalScore = result.finalScore ?? result.score;
	const finalBand = result.finalBand ?? result.band;
	return {
		scoredAt: result.scoredAt,
		resultVersion: result.resultVersion,
		rubricVersion: result.rubricVersion,
		modelScore: result.modelScore ?? result.rawScore,
		cappedScore: result.cappedScore,
		finalScore,
		finalBand,
		categories: { ...result.categories },
		appliedCapCount: result.appliedCaps?.length ?? 0,
		failedConsistencyCheckCount: result.consistencyChecks?.filter(check => !check.passed).length ?? 0
	};
}

export async function appendScoreHistory(historyPath: string, repoName: string, result: ScoreResult): Promise<void> {
	await withScoreWriteLock(async () => {
		let store: ScoreHistoryStore = {};
		try {
			store = JSON.parse(await readFile(historyPath, 'utf-8'));
		} catch {
			// file missing or corrupt - start fresh
		}

		const existing = normalizeRepoHistory(store[repoName]);
		store[repoName] = {
			compact: pruneCompactHistory([...existing.compact, compactHistoryEntry(result)]),
			full: [...existing.full, result].slice(-MAX_FULL_SNAPSHOTS)
		};
		await writeFile(historyPath, JSON.stringify(store, null, 2));
	});
}

export function pruneCompactHistory(entries: ScoreHistoryEntry[], now = new Date()): ScoreHistoryEntry[] {
	const sorted = [...entries].sort((a, b) => new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime());
	const recent: ScoreHistoryEntry[] = [];
	const weekly = new Map<string, ScoreHistoryEntry>();
	const monthly = new Map<string, ScoreHistoryEntry>();
	const nowMs = now.getTime();

	for (const entry of sorted) {
		const scoredAt = new Date(entry.scoredAt);
		const ageMs = nowMs - scoredAt.getTime();
		if (ageMs <= RECENT_WINDOW_MS) {
			recent.push(entry);
		} else if (ageMs <= WEEKLY_WINDOW_MS) {
			weekly.set(weekKey(scoredAt), entry);
		} else {
			monthly.set(monthKey(scoredAt), entry);
		}
	}

	return [...monthly.values(), ...weekly.values(), ...recent]
		.sort((a, b) => new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime());
}

function normalizeRepoHistory(value: unknown): { compact: ScoreHistoryEntry[]; full: ScoreResult[] } {
	if (!isRecord(value)) return { compact: [], full: [] };
	return {
		compact: Array.isArray(value.compact) ? value.compact.filter(isCompactEntry) : [],
		full: Array.isArray(value.full) ? value.full.filter(isScoreResultLike) : []
	};
}

function weekKey(date: Date): string {
	const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const day = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
	const week = Math.floor(day / 7) + 1;
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isCompactEntry(value: unknown): value is ScoreHistoryEntry {
	return isRecord(value) &&
		typeof value.scoredAt === 'string' &&
		typeof value.finalScore === 'number' &&
		typeof value.finalBand === 'string' &&
		isRecord(value.categories);
}

function isScoreResultLike(value: unknown): value is ScoreResult {
	return isRecord(value) &&
		typeof value.scoredAt === 'string' &&
		typeof value.score === 'number' &&
		typeof value.band === 'string' &&
		isRecord(value.categories);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
