import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_OPENAI_MODEL_ID, normalizeModelId } from '$lib/modelCatalog';
import { DEFAULT_LOCAL_MODEL_TIER, LOCAL_MODEL_TIERS, type LocalModelTier } from '$lib/types';

const DEFAULT_ENV_PATH = '.env';
const DEFAULT_LLM_BASE_URL = 'http://localhost:8080';
export const AI_TOOLING_VALUES = ['generic', 'cursor', 'claude', 'copilot', 'windsurf'] as const;
export type AiTooling = typeof AI_TOOLING_VALUES[number];

export interface AppSettings {
	llmBaseUrl: string;
	llmModel: string;
	aiTooling: AiTooling;
	useJsonSchema: boolean;
	localModelTier: LocalModelTier;
}

export type AppSettingsInput = Omit<AppSettings, 'localModelTier'> & { localModelTier?: string };

export async function readAppSettings(): Promise<AppSettings> {
	const explicitBaseUrl = await readEnvValue('LLM_BASE_URL');
	const legacyBaseUrl = explicitBaseUrl ? null : await readEnvValue('MLX_BASE_URL');
	const explicitModel = await readEnvValue('LLM_MODEL');
	const legacyModel = explicitModel ? null : await readEnvValue('MLX_MODEL');
	const llmBaseUrl = explicitBaseUrl ?? legacyBaseUrl ?? DEFAULT_LLM_BASE_URL;
	const llmModel = normalizeModel(explicitModel ?? legacyModel ?? DEFAULT_OPENAI_MODEL_ID);

	if (!explicitBaseUrl && legacyBaseUrl) {
		await writeEnvValue('LLM_BASE_URL', llmBaseUrl);
		process.env.LLM_BASE_URL = llmBaseUrl;
	}
	if (!explicitModel && legacyModel) {
		await writeEnvValue('LLM_MODEL', llmModel);
		process.env.LLM_MODEL = llmModel;
	}

	return {
		llmBaseUrl,
		llmModel,
		aiTooling: normalizeAiTooling(await readEnvValue('AI_TOOLING') ?? 'generic'),
		useJsonSchema: normalizeBoolean(await readEnvValue('USE_JSON_SCHEMA') ?? 'false'),
		localModelTier: normalizeLocalModelTier(await readEnvValue('LOCAL_MODEL_TIER') ?? DEFAULT_LOCAL_MODEL_TIER)
	};
}

export async function writeAppSettings(settings: AppSettingsInput): Promise<AppSettings> {
	const llmBaseUrl = normalizeBaseUrl(settings.llmBaseUrl);
	const llmModel = normalizeModel(settings.llmModel);
	const aiTooling = normalizeAiTooling(settings.aiTooling);
	const useJsonSchema = Boolean(settings.useJsonSchema);
	const localModelTier = normalizeLocalModelTier(settings.localModelTier ?? DEFAULT_LOCAL_MODEL_TIER);
	await writeEnvValue('LLM_BASE_URL', llmBaseUrl);
	await writeEnvValue('LLM_MODEL', llmModel);
	await writeEnvValue('AI_TOOLING', aiTooling);
	await writeEnvValue('USE_JSON_SCHEMA', String(useJsonSchema));
	await writeEnvValue('LOCAL_MODEL_TIER', localModelTier);
	process.env.LLM_BASE_URL = llmBaseUrl;
	process.env.LLM_MODEL = llmModel;
	process.env.AI_TOOLING = aiTooling;
	process.env.USE_JSON_SCHEMA = String(useJsonSchema);
	process.env.LOCAL_MODEL_TIER = localModelTier;
	return { llmBaseUrl, llmModel, aiTooling, useJsonSchema, localModelTier };
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

export function normalizeAiTooling(value: string): AiTooling {
	return AI_TOOLING_VALUES.includes(value as AiTooling) ? value as AiTooling : 'generic';
}

export function normalizeLocalModelTier(value: string): LocalModelTier {
	return LOCAL_MODEL_TIERS.includes(value as LocalModelTier) ? value as LocalModelTier : DEFAULT_LOCAL_MODEL_TIER;
}

export function normalizeModel(value: string): string {
	return normalizeModelId(value.trim() || DEFAULT_OPENAI_MODEL_ID);
}

function normalizeBoolean(value: string): boolean {
	return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
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
	await writeFile(envPath(), `${lines.join('\n')}\n`);
}

async function readEnvLines(): Promise<string[]> {
	try {
		return (await readFile(envPath(), 'utf-8')).split(/\r?\n/).filter((line, index, lines) => {
			return line.length > 0 || index < lines.length - 1;
		});
	} catch {
		return [];
	}
}

function envPath(): string {
	return process.env.REPO_SCORER_ENV_PATH ?? DEFAULT_ENV_PATH;
}
