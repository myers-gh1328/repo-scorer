import { readFile, writeFile } from 'node:fs/promises';

const ENV_PATH = '.env';
const DEFAULT_MLX_BASE_URL = 'http://localhost:8080';

export interface AppSettings {
	mlxBaseUrl: string;
}

export async function readAppSettings(): Promise<AppSettings> {
	return { mlxBaseUrl: await readEnvValue('MLX_BASE_URL') ?? DEFAULT_MLX_BASE_URL };
}

export async function writeAppSettings(settings: AppSettings): Promise<AppSettings> {
	const mlxBaseUrl = normalizeBaseUrl(settings.mlxBaseUrl);
	await writeEnvValue('MLX_BASE_URL', mlxBaseUrl);
	process.env.MLX_BASE_URL = mlxBaseUrl;
	return { mlxBaseUrl };
}

export function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim();
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error('LLM base URL must be a valid URL');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('LLM base URL must start with http:// or https://');
	}
	parsed.pathname = parsed.pathname.replace(/\/+$/, '');
	parsed.search = '';
	parsed.hash = '';
	return parsed.toString().replace(/\/$/, '');
}

async function readEnvValue(key: string): Promise<string | null> {
	const lines = await readEnvLines();
	const prefix = `${key}=`;
	const line = lines.find(item => item.startsWith(prefix));
	return line ? line.slice(prefix.length) : null;
}

async function writeEnvValue(key: string, value: string): Promise<void> {
	const lines = await readEnvLines();
	const prefix = `${key}=`;
	const nextLine = `${key}=${value}`;
	const index = lines.findIndex(line => line.startsWith(prefix));
	if (index >= 0) {
		lines[index] = nextLine;
	} else {
		lines.push(nextLine);
	}
	await writeFile(ENV_PATH, `${lines.join('\n')}\n`);
}

async function readEnvLines(): Promise<string[]> {
	try {
		return (await readFile(ENV_PATH, 'utf-8')).split(/\r?\n/).filter((line, index, lines) => {
			return line.length > 0 || index < lines.length - 1;
		});
	} catch {
		return [];
	}
}

