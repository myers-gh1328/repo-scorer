import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { normalizeBaseUrl, readAppSettings, llmApiKeyFor } from '$lib/server/appSettings';
import { llmRequestHeaders } from '$lib/llmClient';
import { isBlockedModelId } from '$lib/modelCatalog';

interface ModelListResponse {
	data?: Array<{ id?: unknown }>;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const requestedBaseUrl = url.searchParams.get('baseUrl');
	const settings = requestedBaseUrl ? null : await readAppSettings();
	let baseUrl: string;

	try {
		baseUrl = normalizeBaseUrl(requestedBaseUrl ?? settings?.llmBaseUrl ?? '');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(400, msg);
	}

	let response: Response;
	try {
		response = await fetch(`${baseUrl}/v1/models`, { headers: llmRequestHeaders(await llmApiKeyFor(baseUrl)) });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(503, `LLM server unreachable: ${msg}`);
	}

	if (!response.ok) {
		throw error(503, `LLM server returned ${response.status}: ${await response.text()}`);
	}

	const body = await response.json().catch(() => null) as ModelListResponse | null;
	const models = body?.data
		?.map(model => model.id)
		.filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && !isBlockedModelId(id)) ?? [];

	return json({ models: [...new Set(models)] });
};
