import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectDuplication, parseJscpdReport, DUPLICATION_IGNORE_GLOBS } from './duplication';

const report = {
  statistics: { total: { percentage: 5.1549, clones: 3, duplicatedLines: 61 } },
  duplicates: [
    { lines: 8, firstFile: { name: 'src/a.ts:typescript', start: 1, end: 8 }, secondFile: { name: 'src/b.ts:typescript', start: 10, end: 17 } },
    { lines: 30, firstFile: { name: 'src/c.svelte:svelte', start: 5, end: 34 }, secondFile: { name: 'src/d.svelte:svelte', start: 2, end: 31 } },
    { lines: 23, firstFile: { name: 'lib/x.py:python', start: 40, end: 62 }, secondFile: { name: 'lib/x.py:python', start: 90, end: 112 } }
  ]
};

type ExecCallback = (error: Error | null) => void;

function mockJscpd(writeReport: (outputDir: string) => Promise<void>, error: Error | null = null) {
  vi.mocked(execFile).mockImplementation(((_command: string, args: string[], _options: unknown, callback: ExecCallback) => {
    const outputDir = args[args.indexOf('--output') + 1];
    writeReport(outputDir).then(() => callback(error), callback);
  }) as unknown as typeof execFile);
}

describe('parseJscpdReport', () => {
  it('summarizes percentage, counts and the largest clone pairs without format suffixes', () => {
    expect(parseJscpdReport(report)).toEqual({
      status: 'measured',
      percentage: 5.15,
      cloneCount: 3,
      duplicatedLines: 61,
      topPairs: [
        'src/c.svelte:5-34 <-> src/d.svelte:2-31 (30 lines)',
        'lib/x.py:40-62 <-> lib/x.py:90-112 (23 lines)',
        'src/a.ts:1-8 <-> src/b.ts:10-17 (8 lines)'
      ]
    });
  });

  it('caps top pairs at 10', () => {
    const many = { ...report, duplicates: Array.from({ length: 15 }, () => report.duplicates[0]) };
    expect(parseJscpdReport(many).topPairs).toHaveLength(10);
  });

  it('treats a report without statistics as unavailable', () => {
    expect(parseJscpdReport({})).toEqual({ status: 'unavailable' });
  });
});

describe('detectDuplication', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('runs jscpd with code-only excludes and parses its JSON report', async () => {
    mockJscpd(dir => writeFile(join(dir, 'jscpd-report.json'), JSON.stringify(report)));

    const result = await detectDuplication('/repo');

    expect(result.status).toBe('measured');
    expect(result.cloneCount).toBe(3);
    const args = vi.mocked(execFile).mock.calls[0][1] as string[];
    expect(args).toContain('/repo');
    expect(args[args.indexOf('--reporters') + 1]).toBe('json');
    expect(args[args.indexOf('--min-tokens') + 1]).toBe('50');
    expect(args[args.indexOf('--min-lines') + 1]).toBe('5');
    expect(args[args.indexOf('--ignore') + 1]).toBe(DUPLICATION_IGNORE_GLOBS.join(','));
    for (const dir of ['node_modules', 'target', 'dist', '.venv', '.svelte-kit']) {
      expect(DUPLICATION_IGNORE_GLOBS).toContain(`**/${dir}/**`);
    }
    expect(args).not.toContain('--threshold');
  });

  it('returns unavailable when jscpd fails', async () => {
    mockJscpd(async () => undefined, new Error('spawn failed'));
    expect(await detectDuplication('/repo')).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when jscpd writes no report', async () => {
    mockJscpd(async () => undefined);
    expect(await detectDuplication('/repo')).toEqual({ status: 'unavailable' });
  });
});
