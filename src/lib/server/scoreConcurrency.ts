export const SCORE_JOB_STALE_AFTER_MS = 10 * 60 * 1000;

export type ScoreJobPhase = 'scan' | 'category' | 'caps' | 'consistency' | 'persist' | 'complete';

export interface ScoreJobStatus {
	repoName: string;
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
	startedAtMs: number;
	startedAt: string;
	phase: ScoreJobPhase;
	phaseLabel: string;
	currentStep: number;
	totalSteps: number;
}

const activeScores = new Map<string, ActiveScoreJob>();
let scoreWriteQueue: Promise<void> = Promise.resolve();

export function beginScoring(repoName: string): boolean {
	if (activeScores.has(repoName)) return false;
	activeScores.set(repoName, {
		repoName,
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
	progress: Partial<Pick<ActiveScoreJob, 'phase' | 'phaseLabel' | 'currentStep' | 'totalSteps'>>
): void {
	const job = activeScores.get(repoName);
	if (!job) return;
	activeScores.set(repoName, {
		...job,
		...progress
	});
}

export function finishScoring(repoName: string): void {
	activeScores.delete(repoName);
}

export function isAnyScoring(): boolean {
	return activeScores.size > 0;
}

export function getScoringJobs(): ScoreJobStatus[] {
	const now = Date.now();
	return [...activeScores.values()]
		.sort((a, b) => a.startedAtMs - b.startedAtMs || a.repoName.localeCompare(b.repoName))
		.map(job => {
			const elapsedMs = Math.max(0, now - job.startedAtMs);
			return {
				repoName: job.repoName,
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

export function clearStaleScoringJobs(): string[] {
	const staleJobs = getScoringJobs().filter(job => job.status === 'stale');
	for (const job of staleJobs) {
		activeScores.delete(job.repoName);
	}
	return staleJobs.map(job => job.repoName);
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
