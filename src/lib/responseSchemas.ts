import { CATEGORY_MAX } from './types';
import type { CategoryScores, LLMResponseFormat } from './types';
import type { RubricDefinition } from './rubricSchema';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];
const CATEGORY_PROPERTIES = Object.fromEntries(
	CATEGORY_KEYS.map(key => [key, { type: 'integer', minimum: 0, maximum: CATEGORY_MAX[key] }])
);
const CATEGORY_RATIONALE_PROPERTIES = Object.fromEntries(
	CATEGORY_KEYS.map(key => [key, {
		type: 'object',
		additionalProperties: false,
		required: ['score', 'evidence', 'gaps'],
		properties: {
			score: { type: 'integer', minimum: 0, maximum: CATEGORY_MAX[key] },
			evidence: { type: 'array', items: { type: 'string' } },
			gaps: { type: 'array', items: { type: 'string' } },
			structuredGaps: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['description'],
					properties: {
						description: { type: 'string' },
						severity: { type: 'string', enum: ['blocking', 'high', 'medium', 'low'] },
						evidenceNeeded: { type: 'array', items: { type: 'string' } }
					}
				}
			}
		}
	}])
);

export const scoreResponseFormat: LLMResponseFormat = {
	type: 'json_schema',
	json_schema: {
		name: 'repo_score',
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['score', 'band', 'primaryLanguage', 'categories', 'qualityFlags', 'riskFlags', 'recommendations'],
			properties: {
				score: { type: 'integer', minimum: 0, maximum: 100 },
				band: { type: 'string', enum: ['Fragile', 'Emerging', 'Operational', 'Managed', 'Mature'] },
				primaryLanguage: { type: 'string' },
				categories: {
					type: 'object',
					additionalProperties: false,
					required: CATEGORY_KEYS,
					properties: CATEGORY_PROPERTIES
				},
				categoryRationales: {
					type: 'object',
					additionalProperties: false,
					properties: CATEGORY_RATIONALE_PROPERTIES
				},
				qualityFlags: { type: 'array', items: { type: 'string' } },
				riskFlags: { type: 'array', items: { type: 'string' } },
				recommendations: { type: 'array', items: { type: 'string' } }
			}
		}
	}
};

export function scoreResponseFormatForRubric(rubric: RubricDefinition): LLMResponseFormat {
	const categoryKeys = rubric.categories.map(category => category.key);
	const categoryProperties = Object.fromEntries(
		rubric.categories.map(category => [
			category.key,
			{ type: 'integer', minimum: 0, maximum: category.weight }
		])
	);
	const rationaleProperties = Object.fromEntries(
		rubric.categories.map(category => [
			category.key,
			{
				type: 'object',
				additionalProperties: false,
				required: ['score', 'evidence', 'gaps'],
				properties: {
					score: { type: 'integer', minimum: 0, maximum: category.weight },
					evidence: { type: 'array', items: { type: 'string' } },
					gaps: { type: 'array', items: { type: 'string' } },
					structuredGaps: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['description'],
							properties: {
								description: { type: 'string' },
								severity: { type: 'string', enum: ['blocking', 'high', 'medium', 'low'] },
								evidenceNeeded: { type: 'array', items: { type: 'string' } }
							}
						}
					}
				}
			}
		])
	);

	return {
		type: 'json_schema',
		json_schema: {
			name: `repo_score_${rubric.version.replace(/[^a-zA-Z0-9_]+/g, '_')}`,
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['score', 'band', 'primaryLanguage', 'categories', 'qualityFlags', 'riskFlags', 'recommendations'],
				properties: {
					score: { type: 'integer', minimum: 0, maximum: rubric.totalScore },
					band: { type: 'string', enum: rubric.bands.map(band => band.label) },
					primaryLanguage: { type: 'string' },
					categories: {
						type: 'object',
						additionalProperties: false,
						required: categoryKeys,
						properties: categoryProperties
					},
					categoryRationales: {
						type: 'object',
						additionalProperties: false,
						properties: rationaleProperties
					},
					qualityFlags: { type: 'array', items: { type: 'string' } },
					riskFlags: { type: 'array', items: { type: 'string' } },
					recommendations: { type: 'array', items: { type: 'string' } }
				}
			}
		}
	};
}

export const improvementPlanResponseFormat: LLMResponseFormat = {
	type: 'json_schema',
	json_schema: {
		name: 'improvement_plan',
		schema: {
			type: 'object',
			required: ['summary', 'strongestCategories', 'weakestCategories', 'prioritizedTasks'],
			properties: {
				summary: { type: 'string' },
				strongestCategories: {
					type: 'array',
					items: { type: 'string' }
				},
				weakestCategories: {
					type: 'array',
					items: { type: 'string' }
				},
				prioritizedTasks: {
					type: 'array',
					items: {
						type: 'object',
						required: [
							'title',
							'category',
							'impact',
							'effort',
							'targetFiles',
							'instructions',
							'acceptanceCriteria',
							'validationCommands'
						],
						properties: {
							title: { type: 'string' },
							category: { type: 'string' },
							impact: { type: 'string' },
							effort: { type: 'string' },
							targetFiles: { type: 'array', items: { type: 'string' } },
							instructions: { type: 'string' },
							acceptanceCriteria: { type: 'array', items: { type: 'string' } },
							validationCommands: { type: 'array', items: { type: 'string' } }
						}
					}
				}
			}
		}
	}
};
