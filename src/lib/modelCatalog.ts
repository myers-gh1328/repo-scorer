export const OPENAI_MODEL_IDS = [
	'gpt-5.5',
	'gpt-5.4',
	'gpt-5.4-mini',
	'gpt-5.4-nano'
] as const;

export type OpenAIModelId = typeof OPENAI_MODEL_IDS[number];

export const DEFAULT_OPENAI_MODEL_ID: OpenAIModelId = 'gpt-5.4-mini';
const BLOCKED_MODEL_IDS = new Set(['local']);

export function isOpenAIModelId(value: string): value is OpenAIModelId {
	return OPENAI_MODEL_IDS.includes(value as OpenAIModelId);
}

export function normalizeModelId(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return DEFAULT_OPENAI_MODEL_ID;
	}
	if (BLOCKED_MODEL_IDS.has(trimmed.toLowerCase())) {
		throw new Error(`Model "${trimmed}" is not allowed because some self-hosted servers treat it as a Hugging Face model id to download`);
	}
	return trimmed;
}

export const requireOpenAIModelId = normalizeModelId;

export function isBlockedModelId(value: string): boolean {
	return BLOCKED_MODEL_IDS.has(value.trim().toLowerCase());
}
