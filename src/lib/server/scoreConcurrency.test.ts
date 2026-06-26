import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	beginScoring,
	clearStaleScoringJobs,
	finishScoring,
	getScoringJobs,
	isAnyScoring,
	updateScoringProgress,
	withScoreWriteLock
} from './scoreConcurrency';

describe('scoreConcurrency', () => {
	beforeEach(() => {
		vi.useRealTimers();
		for (const job of getScoringJobs()) {
			finishScoring(job.repoName, job.evaluationMode);
		}
	});

	it('rejects duplicate active scoring for the same repo', () => {
		expect(beginScoring('repo-a')).toBe(true);
		try {
			expect(beginScoring('repo-a')).toBe(false);
			expect(isAnyScoring()).toBe(true);
		} finally {
			finishScoring('repo-a');
		}
		expect(beginScoring('repo-a')).toBe(true);
		finishScoring('repo-a');
	});

	it('tracks the same repo independently by evaluation mode', () => {
		expect(beginScoring('repo-a', 'ai-readiness')).toBe(true);
		expect(beginScoring('repo-a', 'maintainability')).toBe(true);
		expect(beginScoring('repo-a', 'ai-readiness')).toBe(false);

		expect(getScoringJobs().map(job => `${job.repoName}:${job.evaluationMode}`).sort()).toEqual([
			'repo-a:ai-readiness',
			'repo-a:maintainability'
		]);

		finishScoring('repo-a', 'ai-readiness');
		expect(beginScoring('repo-a', 'ai-readiness')).toBe(true);
	});

	it('serializes score writes', async () => {
		const events: string[] = [];

		await Promise.all([
			withScoreWriteLock(async () => {
				events.push('a:start');
				await Promise.resolve();
				events.push('a:end');
			}),
			withScoreWriteLock(async () => {
				events.push('b:start');
				await Promise.resolve();
				events.push('b:end');
			})
		]);

		expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
	});

	it('reports active scoring jobs with elapsed time', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		expect(beginScoring('repo-a')).toBe(true);

		vi.setSystemTime(new Date('2026-06-25T12:00:03.000Z'));
		expect(getScoringJobs()).toEqual([
			expect.objectContaining({
				repoName: 'repo-a',
				status: 'running',
				startedAt: '2026-06-25T12:00:00.000Z',
				elapsedMs: 3000,
				staleAfterMs: 600000,
				phase: 'scan',
				phaseLabel: 'Scanning repository',
				currentStep: 0,
				totalSteps: 1,
				percent: 0
			})
		]);
	});

	it('updates scoring progress phase and percent', () => {
		expect(beginScoring('repo-a')).toBe(true);
		updateScoringProgress('repo-a', {
			phase: 'category',
			phaseLabel: 'Scoring Skills (3/12)',
			currentStep: 3,
			totalSteps: 16
		});

		expect(getScoringJobs()[0]).toMatchObject({
			repoName: 'repo-a',
			phase: 'category',
			phaseLabel: 'Scoring Skills (3/12)',
			currentStep: 3,
			totalSteps: 16,
			percent: 19
		});
	});

	it('marks jobs stale after the stale timeout', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		expect(beginScoring('repo-a')).toBe(true);

		vi.setSystemTime(new Date('2026-06-25T12:10:01.000Z'));
		expect(getScoringJobs()[0]).toMatchObject({
			repoName: 'repo-a',
			status: 'stale',
			elapsedMs: 601000,
			staleAfterMs: 600000
		});
	});

	it('clears only stale scoring jobs', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		expect(beginScoring('stale-repo')).toBe(true);
		vi.setSystemTime(new Date('2026-06-25T12:10:01.000Z'));
		expect(beginScoring('running-repo')).toBe(true);

		expect(clearStaleScoringJobs()).toEqual(['stale-repo']);
		expect(getScoringJobs().map(job => job.repoName)).toEqual(['running-repo']);
	});

	it('can clear stale scoring jobs for one evaluation mode only', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
		expect(beginScoring('repo-a', 'ai-readiness')).toBe(true);
		expect(beginScoring('repo-a', 'maintainability')).toBe(true);
		vi.setSystemTime(new Date('2026-06-25T12:10:01.000Z'));

		expect(clearStaleScoringJobs('maintainability')).toEqual(['repo-a']);
		expect(getScoringJobs().map(job => `${job.repoName}:${job.evaluationMode}`)).toEqual(['repo-a:ai-readiness']);
	});
});
