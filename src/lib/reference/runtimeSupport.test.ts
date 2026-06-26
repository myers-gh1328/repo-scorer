import { describe, expect, it } from 'vitest';
import { isRuntimeSupportMatrixStale, readRuntimeSupportMatrix, validateRuntimeSupportMatrix } from './runtimeSupport';

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

	it('detects stale checked-in support metadata from lastUpdated and expiryDays', () => {
		const matrix = {
			version: 'test',
			lastUpdated: '2026-01-01',
			expiryDays: 30,
			sources: ['official'],
			entries: [{ ecosystem: 'node' }]
		};

		expect(isRuntimeSupportMatrixStale(matrix, new Date('2026-01-20T00:00:00.000Z'))).toBe(false);
		expect(isRuntimeSupportMatrixStale(matrix, new Date('2026-02-15T00:00:00.000Z'))).toBe(true);
	});
});
