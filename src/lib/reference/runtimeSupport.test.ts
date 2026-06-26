import { describe, expect, it } from 'vitest';
import { readRuntimeSupportMatrix, validateRuntimeSupportMatrix } from './runtimeSupport';

describe('runtimeSupport', () => {
	it('loads checked-in runtime support metadata with required source fields', async () => {
		const matrix = await readRuntimeSupportMatrix();

		expect(matrix.version).toMatch(/^\d{4}-\d{2}-\d{2}/);
		expect(matrix.lastUpdated).toBe('2026-06-26');
		expect(matrix.expiryDays).toBeGreaterThan(0);
		expect(matrix.sources.length).toBeGreaterThan(0);
		expect(matrix.entries.length).toBeGreaterThan(0);
	});

	it('rejects metadata without sources', () => {
		expect(() => validateRuntimeSupportMatrix({
			version: 'test',
			lastUpdated: '2026-06-26',
			expiryDays: 60,
			sources: [],
			entries: [{ ecosystem: 'node' }]
		})).toThrow(/sources/);
	});
});
