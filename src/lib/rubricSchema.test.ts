import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { CATEGORY_MAX } from './types';
import { loadRubricDefinition, normalizeRubricDefinition } from './rubricSchema';

describe('rubricSchema', () => {
	it('loads category weights and labels from rubric.schema.json', async () => {
		const raw = await readFile('rubric.schema.json', 'utf-8');
		const rubric = loadRubricDefinition(raw);

		expect(rubric.categories).toHaveLength(12);
		expect(rubric.categories[0]).toMatchObject({
			key: 'persistent_guidance',
			label: 'Persistent guidance',
			weight: 15
		});
		expect(rubric.categoryMax.persistent_guidance).toBe(15);
		expect(rubric.categoryLabels.tool_manifests_mcp).toBe('Tool manifests and MCP');
		expect(rubric.totalWeight).toBe(100);
	});

	it('matches the currently hardcoded category weights during migration', async () => {
		const raw = await readFile('rubric.schema.json', 'utf-8');
		const rubric = loadRubricDefinition(raw);

		expect(rubric.categoryMax).toEqual(CATEGORY_MAX);
	});

	it('matches the scoring table in rubric.md', async () => {
		const schemaRaw = await readFile('rubric.schema.json', 'utf-8');
		const rubricMarkdown = await readFile('rubric.md', 'utf-8');
		const rubric = loadRubricDefinition(schemaRaw);
		const tableRows = parseScoringTable(rubricMarkdown);

		expect(rubric.categories.map(category => ({
			label: category.label,
			weight: category.weight,
			evaluate: category.evaluate
		}))).toEqual(tableRows);
	});

	it('calculates health bands from schema ranges', async () => {
		const raw = await readFile('rubric.schema.json', 'utf-8');
		const rubric = loadRubricDefinition(raw);

		expect(rubric.bandForScore(39)).toBe('Fragile');
		expect(rubric.bandForScore(40)).toBe('Emerging');
		expect(rubric.bandForScore(74)).toBe('Operational');
		expect(rubric.bandForScore(75)).toBe('Managed');
		expect(rubric.bandForScore(90)).toBe('Mature');
	});

	it('rejects schemas whose category weights do not total the declared score', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'one', label: 'One', weight: 60, evaluate: 'One thing' },
				{ key: 'two', label: 'Two', weight: 30, evaluate: 'Two things' }
			],
			bands: [
				{ label: 'Low', min: 0, max: 100 }
			]
		})).toThrow(/sum to 90, expected 100/);
	});

	it('rejects duplicate category keys', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'duplicate', label: 'One', weight: 50, evaluate: 'One thing' },
				{ key: 'duplicate', label: 'Two', weight: 50, evaluate: 'Two things' }
			],
			bands: [
				{ label: 'Low', min: 0, max: 100 }
			]
		})).toThrow(/Duplicate rubric category key/);
	});

	it('rejects health bands with gaps', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'one', label: 'One', weight: 100, evaluate: 'One thing' }
			],
			bands: [
				{ label: 'Low', min: 0, max: 49 },
				{ label: 'High', min: 51, max: 100 }
			]
		})).toThrow(/contiguous/);
	});

	it('rejects duplicate health band labels', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'one', label: 'One', weight: 100, evaluate: 'One thing' }
			],
			bands: [
				{ label: 'Repeated', min: 0, max: 49 },
				{ label: 'Repeated', min: 50, max: 100 }
			]
		})).toThrow(/Duplicate rubric band label/);
	});

	it('loads band constraints with named deterministic checks', () => {
		const rubric = normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'governance', label: 'Governance', weight: 100, evaluate: 'Governance' }
			],
			bands: [
				{ label: 'Managed', min: 0, max: 89 },
				{ label: 'Mature', min: 90, max: 100 }
			],
			bandConstraints: [
				{
					band: 'Mature',
					check: 'has_agent_context_review_cadence',
					category: 'governance',
					severity: 'high',
					requirement: 'Agent context has documented ownership and review cadence',
					maxBandOnFailure: 'Managed'
				}
			]
		});

		expect(rubric.bandConstraints).toEqual([
			expect.objectContaining({
				band: 'Mature',
				check: 'has_agent_context_review_cadence',
				maxBandOnFailure: 'Managed'
			})
		]);
	});

	it('rejects band constraints that reference unknown bands or categories', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'governance', label: 'Governance', weight: 100, evaluate: 'Governance' }
			],
			bands: [
				{ label: 'Managed', min: 0, max: 89 },
				{ label: 'Mature', min: 90, max: 100 }
			],
			bandConstraints: [
				{
					band: 'Mature',
					check: 'has_agent_context_review_cadence',
					category: 'missing',
					severity: 'high',
					requirement: 'Bad category',
					maxBandOnFailure: 'Managed'
				}
			]
		})).toThrow(/unknown category/);

		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'governance', label: 'Governance', weight: 100, evaluate: 'Governance' }
			],
			bands: [
				{ label: 'Managed', min: 0, max: 89 },
				{ label: 'Mature', min: 90, max: 100 }
			],
			bandConstraints: [
				{
					band: 'Mature',
					check: 'has_agent_context_review_cadence',
					category: 'governance',
					severity: 'high',
					requirement: 'Bad band',
					maxBandOnFailure: 'Missing'
				}
			]
		})).toThrow(/unknown maxBandOnFailure/);
	});

	it('rejects band constraints that reference unknown deterministic checks', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'governance', label: 'Governance', weight: 100, evaluate: 'Governance' }
			],
			bands: [
				{ label: 'Managed', min: 0, max: 89 },
				{ label: 'Mature', min: 90, max: 100 }
			],
			bandConstraints: [
				{
					band: 'Mature',
					check: 'missing_check',
					category: 'governance',
					severity: 'high',
					requirement: 'Bad check',
					maxBandOnFailure: 'Managed'
				}
			]
		})).toThrow(/unknown consistency check/);
	});

	it('rejects caps that reference unknown evidence fields', () => {
		expect(() => normalizeRubricDefinition({
			version: 'test',
			totalScore: 100,
			categories: [
				{ key: 'tools', label: 'Tools', weight: 100, evaluate: 'Tools' }
			],
			bands: [
				{ label: 'Low', min: 0, max: 100 }
			],
			caps: [
				{
					category: 'tools',
					maxScore: 50,
					reason: 'Bad field',
					when: {
						evidenceField: 'hasMcpManfiest',
						equals: false
					}
				}
			]
		})).toThrow(/unknown evidence field/);
	});
});

function parseScoringTable(markdown: string): { label: string; weight: number; evaluate: string }[] {
	const section = markdown.split('## 6. Scoring rubric')[1]?.split('### Health bands')[0];
	if (!section) throw new Error('Could not find scoring rubric section');

	return section
		.split(/\r?\n/)
		.filter(line => line.startsWith('| ') && !line.includes('---') && !line.includes('Category | Weight'))
		.map(line => {
			const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
			return {
				label: cells[0],
				weight: Number(cells[1]),
				evaluate: cells[2]
			};
		});
}
