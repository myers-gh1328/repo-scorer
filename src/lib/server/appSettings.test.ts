import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppSettings } from './appSettings';

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
});

describe('readAppSettings', () => {
	it('migrates legacy MLX settings to neutral LLM settings on read', async () => {
		await writeFile(envFile, [
			'MLX_BASE_URL=http://192.168.4.43:8080',
			'MLX_MODEL=mlx-community/gemma-4-e4b-it-8bit'
		].join('\n'));

		const settings = await readAppSettings();

		expect(settings.llmBaseUrl).toBe('http://192.168.4.43:8080');
		expect(settings.llmModel).toBe('mlx-community/gemma-4-e4b-it-8bit');
		await expect(readFile(envFile, 'utf-8')).resolves.toContain('LLM_BASE_URL=http://192.168.4.43:8080');
		await expect(readFile(envFile, 'utf-8')).resolves.toContain('LLM_MODEL=mlx-community/gemma-4-e4b-it-8bit');
	});

	it('keeps explicit neutral settings when legacy settings also exist', async () => {
		await writeFile(envFile, [
			'MLX_BASE_URL=http://legacy.example',
			'MLX_MODEL=legacy-model',
			'LLM_BASE_URL=http://new.example',
			'LLM_MODEL=new-model'
		].join('\n'));

		const settings = await readAppSettings();

		expect(settings.llmBaseUrl).toBe('http://new.example');
		expect(settings.llmModel).toBe('new-model');
	});
});
