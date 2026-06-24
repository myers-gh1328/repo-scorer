import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { normalizeBaseUrl, readAppSettings } from '$lib/server/appSettings';
import { isOpenAIModelId } from '$lib/modelCatalog';

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
		response = await fetch(`${baseUrl}/v1/models`);
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
		.filter((id): id is string => typeof id === 'string' && isOpenAIModelId(id)) ?? [];

	return json({ models });
};
