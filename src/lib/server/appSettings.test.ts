import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { llmApiKeyFor, readAppSettings, writeAppSettings } from './appSettings';

let dir: string;
let envFile: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'repo-scorer-settings-'));
	envFile = join(dir, '.env');
	process.env.REPO_SCORER_ENV_PATH = envFile;
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	delete process.env.REPO_SCORER_ENV_PATH;
	delete process.env.LLM_BASE_URL;
	delete process.env.LLM_MODEL;
	delete process.env.LOCAL_MODEL_TIER;
});

describe('readAppSettings', () => {
	it('migrates approved legacy MLX settings to neutral LLM settings on read', async () => {
		await writeFile(envFile, [
			'MLX_BASE_URL=http://192.168.20.43:8080',
			'MLX_MODEL=gpt-5.4-nano'
		].join('\n'));

		const settings = await readAppSettings();

		expect(settings.llmBaseUrl).toBe('http://192.168.20.43:8080');
		expect(settings.llmModel).toBe('gpt-5.4-nano');
		await expect(readFile(envFile, 'utf-8')).resolves.toContain('LLM_BASE_URL=http://192.168.20.43:8080');
		await expect(readFile(envFile, 'utf-8')).resolves.toContain('LLM_MODEL=gpt-5.4-nano');
	});

	it('keeps explicit neutral settings when legacy settings also exist', async () => {
		await writeFile(envFile, [
			'MLX_BASE_URL=http://legacy.example',
			'MLX_MODEL=legacy-model',
			'LLM_BASE_URL=http://new.example',
			'LLM_MODEL=gpt-5.5'
		].join('\n'));

		const settings = await readAppSettings();

		expect(settings.llmBaseUrl).toBe('http://new.example');
		expect(settings.llmModel).toBe('gpt-5.5');
	});

	it('defaults to a suggested OpenAI model when no model is configured', async () => {
		await writeFile(envFile, 'LLM_BASE_URL=http://localhost:8080\n');

		const settings = await readAppSettings();

		expect(settings.llmModel).toBe('gpt-5.4-mini');
	});

	it('rejects local but persists concrete model values', async () => {
		await expect(writeAppSettings({
			llmBaseUrl: 'http://localhost:8080',
			llmModel: 'local',
			aiTooling: 'generic',
			useJsonSchema: false
		})).rejects.toThrow('Model "local" is not allowed');

		const settings = await writeAppSettings({
			llmBaseUrl: 'http://localhost:8080',
			llmModel: 'mlx-community/gemma-4-e4b-it-8bit',
			aiTooling: 'generic',
			useJsonSchema: false
		});

		expect(settings.llmModel).toBe('mlx-community/gemma-4-e4b-it-8bit');
	});
});

describe('local model tier', () => {
	it('defaults to medium and normalizes unknown values', async () => {
		expect((await readAppSettings()).localModelTier).toBe('medium');

		await writeFile(envFile, 'LOCAL_MODEL_TIER=huge\n');
		expect((await readAppSettings()).localModelTier).toBe('medium');
	});

	it('persists a selected tier', async () => {
		const settings = await writeAppSettings({
			llmBaseUrl: 'http://localhost:8080',
			llmModel: 'gpt-5.4-mini',
			aiTooling: 'generic',
			useJsonSchema: false,
			localModelTier: 'small'
		});

		expect(settings.localModelTier).toBe('small');
		expect(await readFile(envFile, 'utf-8')).toContain('LOCAL_MODEL_TIER=small');
		expect((await readAppSettings()).localModelTier).toBe('small');
	});
});

describe('LLM API key', () => {
	it('is not part of the settings returned to the browser', async () => {
		await writeFile(envFile, 'LLM_BASE_URL=http://localhost:8080\nLLM_API_KEY=sk-secret\n');

		expect(JSON.stringify(await readAppSettings())).not.toContain('sk-secret');
	});

	it('is only released for the configured base URL', async () => {
		await writeFile(envFile, 'LLM_BASE_URL=http://localhost:8080\nLLM_API_KEY=sk-secret\n');

		await expect(llmApiKeyFor('http://localhost:8080/')).resolves.toBe('sk-secret');
		await expect(llmApiKeyFor('http://attacker.example')).resolves.toBeUndefined();
		await expect(llmApiKeyFor('not a url')).resolves.toBeUndefined();
	});

	it('is undefined when unset or blank', async () => {
		await writeFile(envFile, 'LLM_BASE_URL=http://localhost:8080\nLLM_API_KEY=\n');

		await expect(llmApiKeyFor('http://localhost:8080')).resolves.toBeUndefined();
	});
});
