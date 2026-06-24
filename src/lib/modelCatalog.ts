export const OPENAI_MODEL_IDS = [
	'gpt-5.5',
	'gpt-5.4',
	'gpt-5.4-mini',
	'gpt-5.4-nano'
] as const;

export type OpenAIModelId = typeof OPENAI_MODEL_IDS[number];

export const DEFAULT_OPENAI_MODEL_ID: OpenAIModelId = 'gpt-5.4-mini';

export function isOpenAIModelId(value: string): value is OpenAIModelId {
	return OPENAI_MODEL_IDS.includes(value as OpenAIModelId);
}

export function requireOpenAIModelId(value: string): OpenAIModelId {
	const trimmed = value.trim();
	if (isOpenAIModelId(trimmed)) {
		return trimmed;
	}
	throw new Error(`Model must be one of: ${OPENAI_MODEL_IDS.join(', ')}`);
}
