import { DEFAULT_EVALUATION_MODE, type EvaluationMode } from '$lib/types';

export const SCORE_JOB_STALE_AFTER_MS = 10 * 60 * 1000;

export type ScoreJobPhase = 'scan' | 'category' | 'caps' | 'consistency' | 'persist' | 'complete';

export interface ScoreJobStatus {
	repoName: string;
	evaluationMode: EvaluationMode;
	status: 'running' | 'stale';
	startedAt: string;
	elapsedMs: number;
	staleAfterMs: number;
	phase: ScoreJobPhase;
	phaseLabel: string;
	currentStep: number;
	totalSteps: number;
	percent: number;
}

interface ActiveScoreJob {
	repoName: string;
	evaluationMode: EvaluationMode;
	startedAtMs: number;
	startedAt: string;
	phase: ScoreJobPhase;
	phaseLabel: string;
	currentStep: number;
	totalSteps: number;
}

const activeScores = new Map<string, ActiveScoreJob>();
let scoreWriteQueue: Promise<void> = Promise.resolve();

export function beginScoring(repoName: string, evaluationMode: EvaluationMode = DEFAULT_EVALUATION_MODE): boolean {
	const key = jobKey(repoName, evaluationMode);
	if (activeScores.has(key)) return false;
	activeScores.set(key, {
		repoName,
		evaluationMode,
		startedAtMs: Date.now(),
		startedAt: new Date().toISOString(),
		phase: 'scan',
		phaseLabel: 'Scanning repository',
		currentStep: 0,
		totalSteps: 1
	});
	return true;
}

export function updateScoringProgress(
	repoName: string,
	progress: Partial<Pick<ActiveScoreJob, 'phase' | 'phaseLabel' | 'currentStep' | 'totalSteps'>> & { evaluationMode?: EvaluationMode }
): void {
	const evaluationMode = progress.evaluationMode ?? DEFAULT_EVALUATION_MODE;
	const key = jobKey(repoName, evaluationMode);
	const job = activeScores.get(key);
	if (!job) return;
	activeScores.set(key, {
		...job,
		...progress
	});
}

export function finishScoring(repoName: string, evaluationMode: EvaluationMode = DEFAULT_EVALUATION_MODE): void {
	activeScores.delete(jobKey(repoName, evaluationMode));
}

export function isAnyScoring(): boolean {
	return activeScores.size > 0;
}

export function getScoringJobs(evaluationMode?: EvaluationMode): ScoreJobStatus[] {
	const now = Date.now();
	return [...activeScores.values()]
		.filter(job => !evaluationMode || job.evaluationMode === evaluationMode)
		.sort((a, b) => a.startedAtMs - b.startedAtMs || a.repoName.localeCompare(b.repoName))
		.map(job => {
			const elapsedMs = Math.max(0, now - job.startedAtMs);
			return {
				repoName: job.repoName,
				evaluationMode: job.evaluationMode,
				status: elapsedMs > SCORE_JOB_STALE_AFTER_MS ? 'stale' : 'running',
				startedAt: job.startedAt,
				elapsedMs,
				staleAfterMs: SCORE_JOB_STALE_AFTER_MS,
				phase: job.phase,
				phaseLabel: job.phaseLabel,
				currentStep: job.currentStep,
				totalSteps: job.totalSteps,
				percent: percent(job.currentStep, job.totalSteps)
			};
		});
}

export function clearStaleScoringJobs(evaluationMode?: EvaluationMode): string[] {
	const staleJobs = getScoringJobs(evaluationMode).filter(job => job.status === 'stale');
	for (const job of staleJobs) {
		activeScores.delete(jobKey(job.repoName, job.evaluationMode));
	}
	return staleJobs.map(job => job.repoName);
}

function jobKey(repoName: string, evaluationMode: EvaluationMode): string {
	return `${repoName}:${evaluationMode}`;
}

function percent(currentStep: number, totalSteps: number): number {
	if (totalSteps <= 0) return 0;
	return Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
}

export async function withScoreWriteLock<T>(write: () => Promise<T>): Promise<T> {
	const previous = scoreWriteQueue;
	let release!: () => void;
	scoreWriteQueue = new Promise<void>(resolve => {
		release = resolve;
	});

	await previous.catch(() => {
		// A failed write should not permanently block later writes.
	});

	try {
		return await write();
	} finally {
		release();
	}
}
