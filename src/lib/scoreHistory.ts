import type { ScoreHistoryEntry, ScoreResult } from './types';

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const WEEKLY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

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

function weekKey(date: Date): string {
	const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const day = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
	const week = Math.floor(day / 7) + 1;
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
