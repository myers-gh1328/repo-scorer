import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendScoreHistory, compactHistoryEntry, pruneCompactHistory } from './scoreHistory';
import type { ScoreResult } from './types';

function score(scoredAt: string, finalScore = 74): ScoreResult {
	return {
		scoredAt,
		resultVersion: 2,
		rubricVersion: '1.0',
		modelScore: finalScore + 2,
		cappedScore: finalScore,
		finalScore,
		modelBand: 'Managed',
		cappedBand: 'Operational',
		finalBand: 'Operational',
		score: finalScore,
		rawScore: finalScore + 2,
		band: 'Operational',
		primaryLanguage: 'TypeScript',
		categories: { skills: 4, ci_pr_automation: 3 } as ScoreResult['categories'],
		rawCategories: { skills: 10, ci_pr_automation: 10 } as ScoreResult['categories'],
		appliedCaps: [{ category: 'skills', originalScore: 10, cappedScore: 4, maxScore: 4, reason: 'cap' }],
		consistencyChecks: [{ id: 'check', requirement: 'req', severity: 'high', passed: false, categories: ['skills'], evidence: [], reason: 'reason', impact: { bandCeiling: 'Managed' } }],
		qualityFlags: [],
		riskFlags: [],
		recommendations: []
	};
}

describe('scoreHistory', () => {
	it('creates compact history entries without rationales or flags', () => {
		expect(compactHistoryEntry(score('2026-06-25T12:00:00.000Z'))).toEqual({
			scoredAt: '2026-06-25T12:00:00.000Z',
			resultVersion: 2,
			rubricVersion: '1.0',
			modelScore: 76,
			cappedScore: 74,
			finalScore: 74,
			finalBand: 'Operational',
			categories: { skills: 4, ci_pr_automation: 3 },
			appliedCapCount: 1,
			failedConsistencyCheckCount: 1
		});
	});

	it('appends compact history and keeps the last five full snapshots', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'score-history-'));
		const path = join(dir, 'score-history.json');

		// Pin the clock so the fixture dates stay inside the "keep all recent" window.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		try {
			for (let index = 0; index < 7; index += 1) {
				await appendScoreHistory(path, 'repo-a', score(`2026-06-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`, 70 + index));
			}
		} finally {
			vi.useRealTimers();
		}

		const stored = JSON.parse(await readFile(path, 'utf-8'));
		expect(stored['repo-a'].compact).toHaveLength(7);
		expect(stored['repo-a'].full).toHaveLength(5);
		expect(stored['repo-a'].full.map((item: ScoreResult) => item.finalScore)).toEqual([72, 73, 74, 75, 76]);
	});

	it('prunes compact history by all recent, weekly, then monthly buckets', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		const entries = [
			// Recent entries: both retained.
			compactHistoryEntry(score('2026-06-20T12:00:00.000Z', 80)),
			compactHistoryEntry(score('2026-06-21T12:00:00.000Z', 81)),
			// Same older week: newest retained.
			compactHistoryEntry(score('2026-05-01T12:00:00.000Z', 70)),
			compactHistoryEntry(score('2026-05-03T12:00:00.000Z', 71)),
			// Same old month: newest retained.
			compactHistoryEntry(score('2025-04-01T12:00:00.000Z', 60)),
			compactHistoryEntry(score('2025-04-20T12:00:00.000Z', 61))
		];

		expect(pruneCompactHistory(entries).map(entry => entry.finalScore)).toEqual([61, 71, 80, 81]);
		vi.useRealTimers();
	});
});
