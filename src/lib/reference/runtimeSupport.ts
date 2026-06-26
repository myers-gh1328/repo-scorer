import { readFile } from 'node:fs/promises';

export interface RuntimeSupportMatrix {
	version: string;
	lastUpdated: string;
	expiryDays: number;
	sources: string[];
	entries: unknown[];
}

export async function readRuntimeSupportMatrix(path = 'src/lib/reference/runtimeSupport.json'): Promise<RuntimeSupportMatrix> {
	const parsed = JSON.parse(await readFile(path, 'utf-8')) as unknown;
	return validateRuntimeSupportMatrix(parsed);
}

export function validateRuntimeSupportMatrix(value: unknown): RuntimeSupportMatrix {
	if (!isRecord(value)) throw new Error('Runtime support matrix must be an object');
	const version = stringField(value, 'version');
	const lastUpdated = stringField(value, 'lastUpdated');
	const expiryDays = numberField(value, 'expiryDays');
	const sources = stringArray(value.sources);
	if (sources.length === 0) throw new Error('Runtime support matrix must include sources');
	if (!Array.isArray(value.entries) || value.entries.length === 0) {
		throw new Error('Runtime support matrix must include entries');
	}
	for (const [index, entry] of value.entries.entries()) {
		if (!isRecord(entry)) throw new Error(`Runtime support entry ${index + 1} must be an object`);
		stringField(entry, 'ecosystem');
		const entrySource = entry.source;
		if (entrySource !== undefined && (typeof entrySource !== 'string' || !entrySource.trim())) {
			throw new Error(`Runtime support entry ${index + 1} source must be a non-empty string`);
		}
	}
	return { version, lastUpdated, expiryDays, sources, entries: value.entries };
}

function stringField(value: Record<string, unknown>, key: string): string {
	const field = value[key];
	if (typeof field !== 'string' || !field.trim()) {
		throw new Error(`Runtime support matrix field "${key}" must be a non-empty string`);
	}
	return field.trim();
}

function numberField(value: Record<string, unknown>, key: string): number {
	const field = value[key];
	if (typeof field !== 'number' || !Number.isFinite(field)) {
		throw new Error(`Runtime support matrix field "${key}" must be a finite number`);
	}
	return field;
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
