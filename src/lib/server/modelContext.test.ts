import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearContextWindowCache, reportedContextTokens, resolveContextWindow } from './modelContext';

function modelsResponse(data: unknown[]) {
	return { ok: true, json: async () => ({ data }) } as unknown as Response;
}

describe('resolveContextWindow', () => {
	beforeEach(() => {
		clearContextWindowCache();
	});

	it('prefers the explicit setting without asking the server', async () => {
		const fetchImpl = vi.fn();

		await expect(resolveContextWindow({ baseUrl: 'http://llm', model: 'm', configuredTokens: 8192, fetchImpl }))
			.resolves.toEqual({ tokens: 8192, source: 'setting' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('uses the context window the server reports for the configured model', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(modelsResponse([
			{ id: 'other', max_model_len: 4096 },
			{ id: 'qwen3-8b', max_model_len: 32768 }
		]));

		await expect(resolveContextWindow({ baseUrl: 'http://llm', model: 'qwen3-8b', fetchImpl }))
			.resolves.toEqual({ tokens: 32768, source: 'server' });
	});

	it('falls back to the known-model floor, then unknown', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(modelsResponse([{ id: 'gpt-5.4-mini' }, { id: 'local-model' }]));

		await expect(resolveContextWindow({ baseUrl: 'http://llm', model: 'gpt-5.4-mini', fetchImpl }))
			.resolves.toEqual({ tokens: 128_000, source: 'catalog' });
		await expect(resolveContextWindow({ baseUrl: 'http://llm', model: 'local-model', fetchImpl }))
			.resolves.toEqual({ source: 'unknown' });
	});

	it('treats an unreachable server as unknown and caches the lookup', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

		await expect(resolveContextWindow({ baseUrl: 'http://llm', model: 'local-model', fetchImpl }))
			.resolves.toEqual({ source: 'unknown' });
		await resolveContextWindow({ baseUrl: 'http://llm', model: 'local-model', fetchImpl });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});

describe('reportedContextTokens', () => {
	it.each([
		[{ context_length: 131072 }, 131072],
		[{ max_context_length: 8192 }, 8192],
		[{ context_window: 200000 }, 200000],
		[{ meta: { n_ctx: 4096, n_ctx_train: 32768 } }, 4096],
		[{ meta: { n_ctx_train: 32768 } }, undefined],
		[{ context_length: '8192' }, undefined]
	])('reads %j as %s', (entry, expected) => {
		expect(reportedContextTokens(entry)).toBe(expected);
	});
});
