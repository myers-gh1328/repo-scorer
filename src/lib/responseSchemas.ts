import { CATEGORY_MAX } from './types';
import type { CategoryScores, LLMResponseFormat } from './types';

const CATEGORY_KEYS = Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[];
const CATEGORY_PROPERTIES = Object.fromEntries(
	CATEGORY_KEYS.map(key => [key, { type: 'integer', minimum: 0, maximum: CATEGORY_MAX[key] }])
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
				qualityFlags: { type: 'array', items: { type: 'string' } },
				riskFlags: { type: 'array', items: { type: 'string' } },
				recommendations: { type: 'array', items: { type: 'string' } }
			}
		}
	}
};

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
