import type { GuidanceLevel } from './rubricGuidance';
import type { LLMConfig, PromptContext } from './types';

// Deliberately pessimistic: English prose runs ~4 characters per token, code and JSON closer to 3.
const CHARS_PER_TOKEN = 3.5;
const DEFAULT_OUTPUT_TOKENS = 2048;
const MIN_SAFETY_MARGIN_TOKENS = 512;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tokensToChars(tokens: number): number {
	return Math.floor(tokens * CHARS_PER_TOKEN);
}

/** Tokens available for the prompt, or undefined when the context window is unknown (no limit applied). */
export function inputTokenBudget(config: LLMConfig): number | undefined {
	if (!config.contextTokens) return undefined;
	const output = config.maxTokens ?? DEFAULT_OUTPUT_TOKENS;
	const margin = Math.max(MIN_SAFETY_MARGIN_TOKENS, Math.ceil(config.contextTokens * 0.05));
	return Math.max(0, config.contextTokens - output - margin);
}

export interface LevelChoice {
	level: GuidanceLevel;
	prompt: string;
	fits: boolean;
}

/**
 * The richest level whose prompt fits the budget. With no budget the first level is used as-is,
 * so models with an unknown or large context window always get the most rubric text.
 */
export function chooseGuidanceLevel(
	levels: GuidanceLevel[],
	build: (level: GuidanceLevel) => string,
	budget: number | undefined
): LevelChoice {
	let choice: LevelChoice | undefined;
	for (const level of levels) {
		const prompt = build(level);
		const fits = budget === undefined || estimateTokens(prompt) <= budget;
		choice = { level, prompt, fits };
		if (fits) return choice;
	}
	if (!choice) throw new Error('No guidance levels to choose from');
	return choice;
}

export function nextGuidanceLevel(levels: GuidanceLevel[], current: GuidanceLevel): GuidanceLevel | undefined {
	return levels[levels.indexOf(current) + 1];
}

const LEVEL_LABELS: Record<GuidanceLevel, string> = {
	full: 'full rubric',
	category: 'category excerpts',
	compact: 'compact excerpts',
	minimal: 'no rubric text'
};

/** One-line summary for the UI, e.g. "full rubric · 128k-token window (catalog)". */
export function describePromptContext(context: PromptContext): string {
	const counts = new Map<GuidanceLevel, number>();
	for (const level of Object.values(context.levels)) counts.set(level, (counts.get(level) ?? 0) + 1);
	const total = Object.keys(context.levels).length;
	const levels = counts.size === 1
		? LEVEL_LABELS[[...counts.keys()][0]]
		: [...counts.entries()].map(([level, count]) => `${LEVEL_LABELS[level]} for ${count} of ${total}`).join(', ');
	const window = context.contextTokens
		? `${formatTokens(context.contextTokens)}-token window (${context.contextSource})`
		: 'context window unknown';
	const trimmed = context.evidenceTrimmed.length > 0 ? ` · evidence trimmed for ${context.evidenceTrimmed.join(', ')}` : '';
	return `${levels} · ${window}${trimmed}`;
}

function formatTokens(tokens: number): string {
	return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

/** True when an LLM error says the prompt was longer than the model or server accepts. */
export function isContextLengthError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /context[ _-]?(length|window|size)|maximum context|n_ctx|too many tokens|prompt is too long|input is too long|exceeds? (the )?(model'?s? )?(context|maximum)|reduce the length/i.test(message);
}
