import { readFile } from 'node:fs/promises';

export interface RuntimeSupportMatrix {
	version: string;
	lastUpdated: string;
	expiryDays: number;
	sources: string[];
	entries: unknown[];
}

interface RuntimeFile {
	relativePath: string;
	content: string;
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

export function runtimeSupportRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	const risks = [
		...nodeRisks(files, matrix),
		...pythonRisks(files, matrix),
		...dotnetRisks(files, matrix)
	];
	return [...new Set(risks)].sort();
}

function nodeRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	const node = ecosystemEntry(matrix, 'node');
	const unsupported = unsupportedMajors(node);
	const packageJson = files.find(file => file.relativePath === 'package.json');
	if (!packageJson) return [];
	try {
		const parsed = JSON.parse(packageJson.content) as { engines?: { node?: unknown } };
		const engine = typeof parsed.engines?.node === 'string' ? parsed.engines.node : '';
		return [...engine.matchAll(/\b(\d{2})\b/g)]
			.map(match => match[1])
			.filter(major => unsupported.has(major))
			.map(major => `package.json engines.node references unsupported Node.js ${major}`);
	} catch {
		return [];
	}
}

function pythonRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	const python = ecosystemEntry(matrix, 'python');
	const unsupported = unsupportedMajorMinors(python);
	return files.flatMap(file => {
		if (!/(^|\/)(runtime\.txt|pyproject\.toml|requirements\.txt)$/i.test(file.relativePath)) return [];
		return [...file.content.matchAll(/\bpython(?:_version)?\s*[=~<>!]*\s*["']?(\d+\.\d+)/gi)]
			.map(match => match[1])
			.filter(version => unsupported.has(version))
			.map(version => `${file.relativePath} references unsupported Python ${version}`);
	});
}

function dotnetRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	const dotnet = ecosystemEntry(matrix, 'dotnet');
	const unsupported = unsupportedMajors(dotnet);
	return files.flatMap(file => {
		if (!/(^|\/)(global\.json|.*\.csproj)$/i.test(file.relativePath)) return [];
		return [...file.content.matchAll(/\b([1-9]\d?)\.\d+(?:\.\d+)?\b/g)]
			.map(match => match[1])
			.filter(major => unsupported.has(major))
			.map(major => `${file.relativePath} references unsupported .NET ${major}`);
	});
}

function ecosystemEntry(matrix: RuntimeSupportMatrix, ecosystem: string): Record<string, unknown> | null {
	return matrix.entries.find((entry): entry is Record<string, unknown> =>
		isRecord(entry) && entry.ecosystem === ecosystem
	) ?? null;
}

function unsupportedMajors(entry: Record<string, unknown> | null): Set<string> {
	const versions = Array.isArray(entry?.versions) ? entry.versions : [];
	return new Set(versions
		.filter(isRecord)
		.filter(version => version.supported === false && typeof version.major === 'string')
		.map(version => version.major as string));
}

function unsupportedMajorMinors(entry: Record<string, unknown> | null): Set<string> {
	const versions = Array.isArray(entry?.versions) ? entry.versions : [];
	return new Set(versions
		.filter(isRecord)
		.filter(version => version.supported === false && typeof version.majorMinor === 'string')
		.map(version => version.majorMinor as string));
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
