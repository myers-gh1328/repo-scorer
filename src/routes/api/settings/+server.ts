import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { normalizeBaseUrl, readAppSettings, writeAppSettings } from '$lib/server/appSettings';
import { DEFAULT_OPENAI_MODEL_ID, OPENAI_MODEL_IDS, isBlockedModelId } from '$lib/modelCatalog';

export const GET: RequestHandler = async () => {
	return json(await readAppSettings());
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	const body = await request.json().catch(() => null);
	const llmBaseUrl = typeof body?.llmBaseUrl === 'string'
		? body.llmBaseUrl
		: typeof body?.mlxBaseUrl === 'string'
			? body.mlxBaseUrl
			: '';
	const llmModel = typeof body?.llmModel === 'string'
		? body.llmModel
		: typeof body?.mlxModel === 'string'
			? body.mlxModel
			: DEFAULT_OPENAI_MODEL_ID;
	const aiTooling = typeof body?.aiTooling === 'string' ? body.aiTooling : 'generic';
	const useJsonSchema = Boolean(body?.useJsonSchema);

	try {
		await assertModelAllowedByServer(llmBaseUrl, llmModel, fetch);
		return json(await writeAppSettings({ llmBaseUrl, llmModel, aiTooling, useJsonSchema }));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(400, msg);
	}
};

async function assertModelAllowedByServer(baseUrlValue: string, model: string, fetch: typeof globalThis.fetch): Promise<void> {
	const normalizedModel = model.trim() || DEFAULT_OPENAI_MODEL_ID;
	if (isBlockedModelId(normalizedModel)) {
		throw new Error(`Model "${normalizedModel}" is not allowed because some self-hosted servers treat it as a Hugging Face model id to download`);
	}
	if ((OPENAI_MODEL_IDS as readonly string[]).includes(normalizedModel)) {
		return;
	}
	const baseUrl = normalizeBaseUrl(baseUrlValue);
	const response = await fetch(`${baseUrl}/v1/models`);
	if (!response.ok) {
		throw new Error(`Could not validate model list: LLM server returned ${response.status}`);
	}
	const body = await response.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null;
	const discovered = body?.data
		?.map(item => item.id)
		.filter((id): id is string => typeof id === 'string' && !isBlockedModelId(id)) ?? [];
	if (!discovered.includes(normalizedModel)) {
		throw new Error(`Model "${normalizedModel}" was not reported by the configured LLM server`);
	}
}
