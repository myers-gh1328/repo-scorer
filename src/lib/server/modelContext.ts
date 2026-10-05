import { llmRequestHeaders } from '$lib/llmClient';
import { knownModelContextTokens } from '$lib/modelCatalog';
import type { ContextWindowSource } from '$lib/types';

export interface ContextWindow {
	tokens?: number;
	source: ContextWindowSource;
}

const LOOKUP_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;
// Fields OpenAI-compatible servers use to report a model's context window. llama.cpp's
// meta.n_ctx_train is the model's trained maximum, not the server's runtime limit, so it is ignored.
const CONTEXT_FIELDS = ['context_length', 'max_model_len', 'max_context_length', 'context_window'] as const;

const cache = new Map<string, { value: ContextWindow; expiresAt: number }>();

/**
 * Resolves the scoring model's context window: the explicit setting, then what the server reports
 * for the model, then a known-model floor. Unknown means prompts are sent in full, and the scorer
 * falls back a level only if the server rejects a prompt as too long.
 */
export async function resolveContextWindow(options: {
	baseUrl: string;
	model: string;
	configuredTokens?: number | null;
	apiKey?: string;
	fetchImpl?: typeof fetch;
}): Promise<ContextWindow> {
	if (options.configuredTokens) {
		return { tokens: options.configuredTokens, source: 'setting' };
	}
	const cacheKey = `${options.baseUrl}\n${options.model}`;
	const cached = cache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const reported = await fetchReportedContext(options);
	const catalog = knownModelContextTokens(options.model);
	const value: ContextWindow = reported
		? { tokens: reported, source: 'server' }
		: catalog
			? { tokens: catalog, source: 'catalog' }
			: { source: 'unknown' };
	cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
	return value;
}

export function clearContextWindowCache(): void {
	cache.clear();
}

async function fetchReportedContext(options: {
	baseUrl: string;
	model: string;
	apiKey?: string;
	fetchImpl?: typeof fetch;
}): Promise<number | undefined> {
	try {
		const response = await (options.fetchImpl ?? fetch)(`${options.baseUrl}/v1/models`, {
			headers: llmRequestHeaders(options.apiKey),
			signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
		});
		if (!response.ok) return undefined;
		const body = await response.json().catch(() => null) as { data?: unknown } | null;
		const models = Array.isArray(body?.data) ? body.data : [];
		const entry = models.find(item => isRecord(item) && item.id === options.model);
		return isRecord(entry) ? reportedContextTokens(entry) : undefined;
	} catch {
		return undefined;
	}
}

export function reportedContextTokens(entry: Record<string, unknown>): number | undefined {
	const candidates = [
		...CONTEXT_FIELDS.map(field => entry[field]),
		isRecord(entry.meta) ? entry.meta.n_ctx : undefined
	];
	return candidates.find((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
