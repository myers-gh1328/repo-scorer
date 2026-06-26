import { readFile } from 'node:fs/promises';
import { CONSISTENCY_CHECK_IDS } from './consistencyChecks';

const EVIDENCE_FIELDS = new Set([
	'guidanceFiles',
	'nestedGuidanceFiles',
	'skillFiles',
	'recipeLikeDocs',
	'specializedAgentFiles',
	'workflowFiles',
	'workflowTriggers',
	'mcpManifestFiles',
	'hookFiles',
	'lockfiles',
	'agentDocs',
	'hasRootGuidance',
	'hasFormalSkills',
	'hasSpecializedAgents',
	'hasCiWorkflow',
	'hasPushOrPrCi',
	'hasManualOnlyCi',
	'hasMcpManifest',
	'hasHooks',
	'hasExternalUnversionedHookReference'
	,
	'testFiles',
	'testScripts',
	'validationScripts',
	'hasAutomatedTests',
	'gitignoreFiles',
	'hasGitignore',
	'secretRiskFiles',
	'hasCommittedSecretRisk',
	'iacFiles',
	'iacValidationCommands',
	'cloudDeploymentFiles',
	'hasCloudDeploymentWithoutIac',
	'runtimeFiles',
	'runtimeVersionFiles',
	'eolRuntimeRisks',
	'hasSupportedCoreRuntime'
]);

const CONSISTENCY_CHECKS = new Set<string>(CONSISTENCY_CHECK_IDS);

export interface RubricCategoryDefinition {
	key: string;
	label: string;
	weight: number;
	scannerSection?: string;
	evaluate: string;
}

export interface RubricBandDefinition {
	label: string;
	min: number;
	max: number;
	interpretation?: string;
}

export interface RubricCapRuleDefinition {
	category: string;
	maxScore: number;
	reason: string;
	when: {
		evidenceField: string;
		equals: boolean;
	};
}

export type RubricConstraintSeverity = 'blocking' | 'high' | 'medium' | 'low';

export interface RubricBandConstraintDefinition {
	band: string;
	check: string;
	category: string;
	severity: RubricConstraintSeverity;
	requirement: string;
	maxBandOnFailure: string;
}

export interface RubricDefinitionInput {
	version: string;
	totalScore: number;
	categories: RubricCategoryDefinition[];
	bands: RubricBandDefinition[];
	caps?: RubricCapRuleDefinition[];
	bandConstraints?: RubricBandConstraintDefinition[];
}

export interface RubricDefinition extends RubricDefinitionInput {
	totalWeight: number;
	categoryMax: Record<string, number>;
	categoryLabels: Record<string, string>;
	bandForScore: (score: number) => string;
}

export function loadRubricDefinition(raw: string): RubricDefinition {
	return normalizeRubricDefinition(JSON.parse(raw));
}

export async function readRubricDefinition(path = 'rubric.schema.json'): Promise<RubricDefinition> {
	return loadRubricDefinition(await readFile(path, 'utf-8'));
}

export function normalizeRubricDefinition(value: unknown): RubricDefinition {
	if (!isRecord(value)) {
		throw new Error('Rubric schema must be an object');
	}

	const version = stringField(value, 'version');
	const totalScore = numberField(value, 'totalScore');
	const categories = normalizeCategories(value.categories);
	const bands = normalizeBands(value.bands, totalScore);
	const caps = normalizeCaps(value.caps, categories);
	const bandConstraints = normalizeBandConstraints(value.bandConstraints, categories, bands);
	const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);

	if (totalWeight !== totalScore) {
		throw new Error(`Rubric category weights sum to ${totalWeight}, expected ${totalScore}`);
	}

	return {
		version,
		totalScore,
		categories,
		bands,
		caps,
		bandConstraints,
		totalWeight,
		categoryMax: Object.fromEntries(categories.map(category => [category.key, category.weight])),
		categoryLabels: Object.fromEntries(categories.map(category => [category.key, category.label])),
		bandForScore(score: number): string {
			const band = bands.find(item => score >= item.min && score <= item.max);
			if (!band) {
				throw new Error(`No health band found for score ${score}`);
			}
			return band.label;
		}
	};
}

function normalizeBandConstraints(
	value: unknown,
	categories: RubricCategoryDefinition[],
	bands: RubricBandDefinition[]
): RubricBandConstraintDefinition[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error('Rubric schema bandConstraints must be an array when present');
	}
	const categoryKeys = new Set(categories.map(category => category.key));
	const bandLabels = new Set(bands.map(band => band.label));
	const severities = new Set(['blocking', 'high', 'medium', 'low']);

	return value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`Rubric band constraint ${index + 1} must be an object`);
		}
		const band = stringField(item, 'band');
		if (!bandLabels.has(band)) {
			throw new Error(`Rubric band constraint ${index + 1} references unknown band "${band}"`);
		}
		const maxBandOnFailure = stringField(item, 'maxBandOnFailure');
		if (!bandLabels.has(maxBandOnFailure)) {
			throw new Error(`Rubric band constraint ${index + 1} references unknown maxBandOnFailure "${maxBandOnFailure}"`);
		}
		const category = stringField(item, 'category');
		if (!categoryKeys.has(category)) {
			throw new Error(`Rubric band constraint ${index + 1} references unknown category "${category}"`);
		}
		const severity = stringField(item, 'severity');
		if (!severities.has(severity)) {
			throw new Error(`Rubric band constraint ${index + 1} has invalid severity "${severity}"`);
		}
		const check = stringField(item, 'check');
		if (!CONSISTENCY_CHECKS.has(check)) {
			throw new Error(`Rubric band constraint ${index + 1} references unknown consistency check "${check}"`);
		}
		return {
			band,
			check,
			category,
			severity: severity as RubricConstraintSeverity,
			requirement: stringField(item, 'requirement'),
			maxBandOnFailure
		};
	});
}

function normalizeCaps(value: unknown, categories: RubricCategoryDefinition[]): RubricCapRuleDefinition[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error('Rubric schema caps must be an array when present');
	}
	const categoryKeys = new Set(categories.map(category => category.key));
	return value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`Rubric cap ${index + 1} must be an object`);
		}
		const category = stringField(item, 'category');
		if (!categoryKeys.has(category)) {
			throw new Error(`Rubric cap ${index + 1} references unknown category "${category}"`);
		}
		const maxScore = numberField(item, 'maxScore');
		const categoryMax = categories.find(item => item.key === category)?.weight ?? 0;
		if (!Number.isInteger(maxScore) || maxScore < 0 || maxScore > categoryMax) {
			throw new Error(`Rubric cap ${index + 1} maxScore must be an integer between 0 and ${categoryMax}`);
		}
		const when = item.when;
		if (!isRecord(when)) {
			throw new Error(`Rubric cap ${index + 1} must include a when condition`);
		}
		const equals = when.equals;
		if (typeof equals !== 'boolean') {
			throw new Error(`Rubric cap ${index + 1} when.equals must be boolean`);
		}
		const evidenceField = stringField(when, 'evidenceField');
		if (!EVIDENCE_FIELDS.has(evidenceField)) {
			throw new Error(`Rubric cap ${index + 1} references unknown evidence field "${evidenceField}"`);
		}
		return {
			category,
			maxScore,
			reason: stringField(item, 'reason'),
			when: {
				evidenceField,
				equals
			}
		};
	});
}

function normalizeCategories(value: unknown): RubricCategoryDefinition[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('Rubric schema must include at least one category');
	}

	const seen = new Set<string>();
	return value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`Rubric category ${index + 1} must be an object`);
		}
		const key = stringField(item, 'key');
		if (!/^[a-z][a-z0-9_]*$/.test(key)) {
			throw new Error(`Rubric category key "${key}" must be snake_case`);
		}
		if (seen.has(key)) {
			throw new Error(`Duplicate rubric category key "${key}"`);
		}
		seen.add(key);

		const weight = numberField(item, 'weight');
		if (!Number.isInteger(weight) || weight <= 0) {
			throw new Error(`Rubric category "${key}" weight must be a positive integer`);
		}

		return {
			key,
			label: stringField(item, 'label'),
			weight,
			scannerSection: optionalStringField(item, 'scannerSection'),
			evaluate: stringField(item, 'evaluate')
		};
	});
}

function normalizeBands(value: unknown, totalScore: number): RubricBandDefinition[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('Rubric schema must include at least one health band');
	}

	const seenLabels = new Set<string>();
	const bands = value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`Rubric band ${index + 1} must be an object`);
		}
		const label = stringField(item, 'label');
		if (seenLabels.has(label)) {
			throw new Error(`Duplicate rubric band label "${label}"`);
		}
		seenLabels.add(label);
		const min = numberField(item, 'min');
		const max = numberField(item, 'max');
		if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
			throw new Error(`Rubric band ${index + 1} must have valid integer min/max values`);
		}
		return {
			label,
			min,
			max,
			interpretation: optionalStringField(item, 'interpretation')
		};
	}).sort((a, b) => a.min - b.min);

	if (bands[0].min !== 0 || bands[bands.length - 1].max !== totalScore) {
		throw new Error(`Rubric bands must cover scores 0 through ${totalScore}`);
	}
	for (let i = 1; i < bands.length; i += 1) {
		if (bands[i].min !== bands[i - 1].max + 1) {
			throw new Error('Rubric bands must be contiguous and non-overlapping');
		}
	}

	return bands;
}

function stringField(value: Record<string, unknown>, key: string): string {
	const field = value[key];
	if (typeof field !== 'string' || !field.trim()) {
		throw new Error(`Rubric schema field "${key}" must be a non-empty string`);
	}
	return field.trim();
}

function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	if (field === undefined) return undefined;
	if (typeof field !== 'string' || !field.trim()) {
		throw new Error(`Rubric schema field "${key}" must be a non-empty string when present`);
	}
	return field.trim();
}

function numberField(value: Record<string, unknown>, key: string): number {
	const field = value[key];
	if (typeof field !== 'number' || !Number.isFinite(field)) {
		throw new Error(`Rubric schema field "${key}" must be a finite number`);
	}
	return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
