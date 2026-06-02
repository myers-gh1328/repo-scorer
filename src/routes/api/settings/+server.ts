import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { readAppSettings, writeAppSettings } from '$lib/server/appSettings';

export const GET: RequestHandler = async () => {
	return json(await readAppSettings());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const mlxBaseUrl = typeof body?.mlxBaseUrl === 'string' ? body.mlxBaseUrl : '';
	const aiTooling = typeof body?.aiTooling === 'string' ? body.aiTooling : 'generic';

	try {
		return json(await writeAppSettings({ mlxBaseUrl, aiTooling }));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(400, msg);
	}
};
