import { readFile } from 'node:fs/promises';
import { readRubricDefinition, type RubricDefinition } from './rubricSchema';
import { resolveRubricGuidance, type RubricGuidance } from './rubricGuidance';
import { DEFAULT_EVALUATION_MODE, type EvaluationMode } from './types';

export interface EvaluationModeDefinition {
	id: EvaluationMode;
	label: string;
	beta: boolean;
	rubricPath: string;
	schemaPath: string;
	referenceDataPath?: string;
}

export const EVALUATION_MODES: Record<EvaluationMode, EvaluationModeDefinition> = {
	'ai-readiness': {
		id: 'ai-readiness',
		label: 'AI Readiness',
		beta: false,
		rubricPath: 'rubric.md',
		schemaPath: 'rubric.schema.json'
	},
	maintainability: {
		id: 'maintainability',
		label: 'Maintainability',
		beta: true,
		rubricPath: 'rubrics/maintainability/rubric.md',
		schemaPath: 'rubrics/maintainability/rubric.schema.json',
		referenceDataPath: 'src/lib/reference/runtimeSupport.json'
	}
};

export function parseEvaluationMode(value: unknown): EvaluationMode {
	if (value === undefined || value === null || value === '') return DEFAULT_EVALUATION_MODE;
	if (value === 'ai-readiness' || value === 'maintainability') return value;
	throw new Error(`Unsupported evaluation mode "${String(value)}"`);
}

export function evaluationModeDefinition(mode: EvaluationMode): EvaluationModeDefinition {
	return EVALUATION_MODES[mode];
}

export function listEvaluationModes(): EvaluationModeDefinition[] {
	return Object.values(EVALUATION_MODES);
}

export async function readEvaluationRubric(
	mode: EvaluationMode
): Promise<{ markdown: string; definition: RubricDefinition; guidance: RubricGuidance }> {
	const config = evaluationModeDefinition(mode);
	const [markdown, definition] = await Promise.all([
		readFile(config.rubricPath, 'utf-8'),
		readRubricDefinition(config.schemaPath)
	]);
	// Throws when a schema guidance heading is missing from the markdown, so a prose edit cannot silently drop guidance.
	return { markdown, definition, guidance: resolveRubricGuidance(markdown, definition) };
}
