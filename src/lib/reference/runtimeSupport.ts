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

export interface RuntimeSupportAnalysis {
	risks: string[];
	supportedRuntimeFiles: string[];
	unknownRuntimeVersionFiles: string[];
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
	return runtimeSupportAnalysis(files, matrix).risks;
}

export function isRuntimeSupportMatrixStale(matrix: RuntimeSupportMatrix, now = new Date()): boolean {
	const updated = new Date(`${matrix.lastUpdated}T00:00:00.000Z`);
	if (Number.isNaN(updated.getTime())) return true;
	const ageMs = now.getTime() - updated.getTime();
	return ageMs > matrix.expiryDays * 24 * 60 * 60 * 1000;
}

export function runtimeSupportAnalysis(files: RuntimeFile[], matrix: RuntimeSupportMatrix): RuntimeSupportAnalysis {
	const findings = [
		...nodeFindings(files, matrix),
		...pythonFindings(files, matrix),
		...dotnetFindings(files, matrix),
		...dockerImageFindings(files, matrix)
	];
	return {
		risks: unique(findings.filter(finding => finding.status === 'unsupported').map(finding => finding.message)),
		supportedRuntimeFiles: unique(findings.filter(finding => finding.status === 'supported').map(finding => finding.path)),
		unknownRuntimeVersionFiles: unique(findings.filter(finding => finding.status === 'unknown').map(finding => finding.path))
	};
}

interface RuntimeFinding {
	path: string;
	status: 'supported' | 'unsupported' | 'unknown';
	message: string;
}

function nodeRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	return nodeFindings(files, matrix)
		.filter(finding => finding.status === 'unsupported')
		.map(finding => finding.message);
}

function nodeFindings(files: RuntimeFile[], matrix: RuntimeSupportMatrix): RuntimeFinding[] {
	const node = ecosystemEntry(matrix, 'node');
	const unsupported = unsupportedMajors(node);
	const supported = supportedMajors(node);
	const findings: RuntimeFinding[] = [];
	const packageJson = files.find(file => file.relativePath === 'package.json');
	if (packageJson) {
		try {
			const parsed = JSON.parse(packageJson.content) as { engines?: { node?: unknown } };
			const engine = typeof parsed.engines?.node === 'string' ? parsed.engines.node : '';
			const majors = extractMajorVersions(engine);
			findings.push(...classifyMajors('package.json', 'package.json engines.node', 'Node.js', majors, supported, unsupported));
		} catch {
			findings.push(unknown(packageJson.relativePath, 'package.json could not be parsed for Node.js support'));
		}
	}
	for (const file of files.filter(file => /^(\.nvmrc|\.node-version)$/i.test(file.relativePath))) {
		const majors = extractMajorVersions(file.content);
		findings.push(...classifyMajors(file.relativePath, file.relativePath, 'Node.js', majors, supported, unsupported));
	}
	return findings;
}

function pythonRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	return pythonFindings(files, matrix)
		.filter(finding => finding.status === 'unsupported')
		.map(finding => finding.message);
}

function pythonFindings(files: RuntimeFile[], matrix: RuntimeSupportMatrix): RuntimeFinding[] {
	const python = ecosystemEntry(matrix, 'python');
	const unsupported = unsupportedMajorMinors(python);
	const supported = supportedMajorMinors(python);
	return files.flatMap(file => {
		if (!/(^|\/)(runtime\.txt|pyproject\.toml|requirements\.txt)$/i.test(file.relativePath)) return [];
		const versions = extractPythonVersions(file.content);
		return classifyMajorMinors(file.relativePath, file.relativePath, 'Python', versions, supported, unsupported);
	});
}

function dotnetRisks(files: RuntimeFile[], matrix: RuntimeSupportMatrix): string[] {
	return dotnetFindings(files, matrix)
		.filter(finding => finding.status === 'unsupported')
		.map(finding => finding.message);
}

function dotnetFindings(files: RuntimeFile[], matrix: RuntimeSupportMatrix): RuntimeFinding[] {
	const dotnet = ecosystemEntry(matrix, 'dotnet');
	const unsupported = unsupportedMajors(dotnet);
	const supported = supportedMajors(dotnet);
	return files.flatMap(file => {
		if (!/(^|\/)(global\.json|.*\.csproj)$/i.test(file.relativePath)) return [];
		const majors = [...file.content.matchAll(/\b([1-9]\d?)\.\d+(?:\.\d+)?\b/g)].map(match => match[1]);
		return classifyMajors(file.relativePath, file.relativePath, '.NET', majors, supported, unsupported);
	});
}

function dockerImageFindings(files: RuntimeFile[], matrix: RuntimeSupportMatrix): RuntimeFinding[] {
	return files.flatMap(file => {
		if (!/(^|\/)(Dockerfile|.*\.Dockerfile)$/i.test(file.relativePath)) return [];
		return [...file.content.matchAll(/^\s*FROM\s+([^\s:@]+)(?::([^\s@]+))?/gim)].flatMap(match => {
			const image = match[1].toLowerCase();
			const tag = match[2] ?? '';
			if (image === 'node' || image.endsWith('/node')) {
				return classifyMajors(file.relativePath, `Dockerfile base image ${match[1]}:${tag || 'latest'}`, 'Node.js', extractMajorVersions(tag), supportedMajors(ecosystemEntry(matrix, 'node')), unsupportedMajors(ecosystemEntry(matrix, 'node')));
			}
			if (image === 'python' || image.endsWith('/python')) {
				return classifyMajorMinors(file.relativePath, `Dockerfile base image ${match[1]}:${tag || 'latest'}`, 'Python', extractPythonVersions(tag), supportedMajorMinors(ecosystemEntry(matrix, 'python')), unsupportedMajorMinors(ecosystemEntry(matrix, 'python')));
			}
			if (image.includes('dotnet/')) {
				return classifyMajors(file.relativePath, `Dockerfile base image ${match[1]}:${tag || 'latest'}`, '.NET', extractMajorVersions(tag), supportedMajors(ecosystemEntry(matrix, 'dotnet')), unsupportedMajors(ecosystemEntry(matrix, 'dotnet')));
			}
			return [];
		});
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

function supportedMajors(entry: Record<string, unknown> | null): Set<string> {
	const versions = Array.isArray(entry?.versions) ? entry.versions : [];
	return new Set(versions
		.filter(isRecord)
		.filter(version => version.supported === true && typeof version.major === 'string')
		.map(version => version.major as string));
}

function unsupportedMajorMinors(entry: Record<string, unknown> | null): Set<string> {
	const versions = Array.isArray(entry?.versions) ? entry.versions : [];
	return new Set(versions
		.filter(isRecord)
		.filter(version => version.supported === false && typeof version.majorMinor === 'string')
		.map(version => version.majorMinor as string));
}

function supportedMajorMinors(entry: Record<string, unknown> | null): Set<string> {
	const versions = Array.isArray(entry?.versions) ? entry.versions : [];
	return new Set(versions
		.filter(isRecord)
		.filter(version => version.supported === true && typeof version.majorMinor === 'string')
		.map(version => version.majorMinor as string));
}

function classifyMajors(path: string, source: string, label: string, versions: string[], supported: Set<string>, unsupported: Set<string>): RuntimeFinding[] {
	if (versions.length === 0) return [unknown(path, `${source} does not declare a parseable ${label} major version`)];
	return unique(versions).map(version => classify(path, source, label, version, supported, unsupported));
}

function classifyMajorMinors(path: string, source: string, label: string, versions: string[], supported: Set<string>, unsupported: Set<string>): RuntimeFinding[] {
	if (versions.length === 0) return [unknown(path, `${source} does not declare a parseable ${label} major/minor version`)];
	return unique(versions).map(version => classify(path, source, label, version, supported, unsupported));
}

function classify(path: string, source: string, label: string, version: string, supported: Set<string>, unsupported: Set<string>): RuntimeFinding {
	if (unsupported.has(version)) return { path, status: 'unsupported', message: `${source} references unsupported ${label} ${version}` };
	if (supported.has(version)) return { path, status: 'supported', message: `${source} references supported ${label} ${version}` };
	return unknown(path, `${source} references ${label} ${version}, which is not in checked-in support data`);
}

function unknown(path: string, message: string): RuntimeFinding {
	return { path, status: 'unknown', message };
}

function extractMajorVersions(value: string): string[] {
	return [...value.matchAll(/\b([1-9]\d?)\b/g)].map(match => match[1]);
}

function extractPythonVersions(value: string): string[] {
	return [...value.matchAll(/\b(?:python(?:_version)?[-\s:=~<>!"]*)?(\d+\.\d+)/gi)].map(match => match[1]);
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort();
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
