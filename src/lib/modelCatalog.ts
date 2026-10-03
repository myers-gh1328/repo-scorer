// Model ids offered in Settings without asking the server's /v1/models first.
// Any other id must be reported by the configured server before it can be saved.
export const KNOWN_MODEL_IDS = [
	'gpt-5.5',
	'gpt-5.4',
	'gpt-5.4-mini',
	'gpt-5.4-nano'
] as const;

export const DEFAULT_MODEL_ID: string = 'gpt-5.4-mini';
const BLOCKED_MODEL_IDS = new Set(['local']);

export function isKnownModelId(value: string): boolean {
	return (KNOWN_MODEL_IDS as readonly string[]).includes(value);
}

export function isBlockedModelId(value: string): boolean {
	return BLOCKED_MODEL_IDS.has(value.trim().toLowerCase());
}

export function blockedModelMessage(value: string): string {
	return `Model "${value}" is not allowed because some self-hosted servers treat it as a Hugging Face model id to download`;
}

export function normalizeModelId(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return DEFAULT_MODEL_ID;
	}
	if (isBlockedModelId(trimmed)) {
		throw new Error(blockedModelMessage(trimmed));
	}
	return trimmed;
}
