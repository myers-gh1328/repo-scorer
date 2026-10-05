import { describe, expect, it } from 'vitest';
import {
	chooseGuidanceLevel,
	describePromptContext,
	estimateTokens,
	inputTokenBudget,
	isContextLengthError,
	nextGuidanceLevel
} from './promptBudget';
import type { GuidanceLevel } from './rubricGuidance';

const sizes: Record<GuidanceLevel, number> = { full: 70_000, category: 7_000, compact: 1_400, minimal: 350 };
const build = (level: GuidanceLevel) => 'x'.repeat(sizes[level]);
const levels: GuidanceLevel[] = ['full', 'category', 'compact', 'minimal'];

describe('inputTokenBudget', () => {
	it('is unlimited when the context window is unknown', () => {
		expect(inputTokenBudget({ baseUrl: 'http://x' })).toBeUndefined();
	});

	it('reserves output tokens and a safety margin', () => {
		expect(inputTokenBudget({ baseUrl: 'http://x', contextTokens: 32_000, maxTokens: 4096 })).toBe(32_000 - 4096 - 1600);
		expect(inputTokenBudget({ baseUrl: 'http://x', contextTokens: 4096, maxTokens: 1024 })).toBe(4096 - 1024 - 512);
	});
});

describe('chooseGuidanceLevel', () => {
	it('always uses the richest level when there is no budget', () => {
		expect(chooseGuidanceLevel(levels, build, undefined)).toMatchObject({ level: 'full', fits: true });
	});

	it('uses the richest level that fits', () => {
		expect(chooseGuidanceLevel(levels, build, estimateTokens(build('full'))).level).toBe('full');
		expect(chooseGuidanceLevel(levels, build, 5_000).level).toBe('category');
		expect(chooseGuidanceLevel(levels, build, 500).level).toBe('compact');
	});

	it('returns the smallest level marked as not fitting when nothing fits', () => {
		expect(chooseGuidanceLevel(levels, build, 10)).toMatchObject({ level: 'minimal', fits: false });
	});
});

describe('nextGuidanceLevel', () => {
	it('steps down one level and stops after the last', () => {
		expect(nextGuidanceLevel(levels, 'full')).toBe('category');
		expect(nextGuidanceLevel(['full', 'minimal'], 'full')).toBe('minimal');
		expect(nextGuidanceLevel(levels, 'minimal')).toBeUndefined();
	});
});

describe('isContextLengthError', () => {
	it.each([
		"LLM returned 400: This model's maximum context length is 32768 tokens. However, your messages resulted in 40000 tokens.",
		'LLM returned 400: {"error":{"code":"context_length_exceeded"}}',
		'LLM returned 400: the request exceeds the available context size, try increasing it (n_ctx: 8192)',
		'LLM returned 400: prompt is too long: 210000 tokens > 200000 maximum',
		'LLM returned 400: Input is too long for requested model'
	])('recognizes %s', message => {
		expect(isContextLengthError(new Error(message))).toBe(true);
	});

	it.each([
		'LLM returned 400: invalid model id',
		'LLM returned 503: loading model',
		'fetch failed'
	])('ignores %s', message => {
		expect(isContextLengthError(new Error(message))).toBe(false);
	});
});

describe('describePromptContext', () => {
	it('summarizes a single level with the window source', () => {
		expect(describePromptContext({
			contextTokens: 128_000,
			contextSource: 'catalog',
			levels: { a: 'full', b: 'full' },
			evidenceTrimmed: []
		})).toBe('full rubric · 128k-token window (catalog)');
	});

	it('summarizes mixed levels, unknown windows and trimmed evidence', () => {
		expect(describePromptContext({
			contextSource: 'unknown',
			levels: { a: 'category', b: 'compact', c: 'category' },
			evidenceTrimmed: ['b']
		})).toBe('category excerpts for 2 of 3, compact excerpts for 1 of 3 · context window unknown · evidence trimmed for b');
	});
});
