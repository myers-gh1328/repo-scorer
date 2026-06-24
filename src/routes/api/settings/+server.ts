import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { readAppSettings, writeAppSettings } from '$lib/server/appSettings';
import { DEFAULT_OPENAI_MODEL_ID } from '$lib/modelCatalog';

export const GET: RequestHandler = async () => {
	return json(await readAppSettings());
};

export const POST: RequestHandler = async ({ request }) => {
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
		return json(await writeAppSettings({ llmBaseUrl, llmModel, aiTooling, useJsonSchema }));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(400, msg);
	}
};
