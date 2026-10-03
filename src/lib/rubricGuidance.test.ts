import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadRubricDefinition, normalizeRubricDefinition, type RubricDefinition } from './rubricSchema';
import { availableGuidanceLevels, guidanceText, plainRubricGuidance, resolveRubricGuidance } from './rubricGuidance';
import { listEvaluationModes, readEvaluationRubric } from './evaluationModes';

function definition(overrides: Record<string, unknown> = {}): RubricDefinition {
	return normalizeRubricDefinition({
		version: 'test',
		totalScore: 10,
		guidance: { scoringSection: 'Scale', sharedSections: ['Shared'] },
		categories: [
			{ key: 'alpha', label: 'Alpha', weight: 6, evaluate: 'Alpha', guidanceSections: ['Alpha signals', 'Alpha detail'] },
			{ key: 'beta', label: 'Beta', weight: 4, evaluate: 'Beta', guidanceSections: ['Beta signals', 'Alpha detail'] }
		],
		bands: [{ label: 'Any', min: 0, max: 10 }],
		...overrides
	});
}

const markdown = `# Rubric

## Scale

Levels 0-5.

## Shared

Shared standards.

---

## Signals

### Alpha signals

Alpha pass and risk.

\`\`\`md
## Beta signals
Inside a code fence, not a heading.
\`\`\`

### Beta signals

Beta pass and risk.

## Details

### Alpha detail

Alpha component guidance.

#### Alpha example

Nested example.

## Appendix

Unreferenced appendix.
`;

describe('resolveRubricGuidance', () => {
	it('resolves every shipped evaluation mode rubric', async () => {
		for (const mode of listEvaluationModes()) {
			const { definition: def, guidance } = await readEvaluationRubric(mode.id);
			for (const category of def.categories) {
				expect(category.guidanceSections?.length, `${mode.id}:${category.key}`).toBeGreaterThan(0);
				expect(guidanceText(guidance, 'compact', [category.key]).length).toBeGreaterThan(0);
			}
		}
	});

	it('gives every AI readiness category its own pass and risk signals', async () => {
		const def = loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
		const guidance = resolveRubricGuidance(await readFile('rubric.md', 'utf-8'), def);
		for (const category of def.categories) {
			const compact = guidanceText(guidance, 'compact', [category.key]);
			expect(compact, category.key).toContain('Pass signals:');
			expect(compact, category.key).toContain('Risk signals:');
		}
	});

	it('extracts sections up to the next heading of the same or higher level, ignoring code fences', () => {
		const guidance = resolveRubricGuidance(markdown, definition());

		expect(guidance.sectionText['Alpha signals']).toContain('Inside a code fence');
		expect(guidance.sectionText['Alpha signals']).not.toContain('Beta pass and risk');
		expect(guidance.sectionText['Alpha detail']).toContain('Nested example.');
		expect(guidance.sectionText['Alpha detail']).not.toContain('Unreferenced appendix');
		expect(guidance.sectionText.Shared).not.toMatch(/---$/);
	});

	it('fails loudly when a referenced heading is missing or ambiguous', () => {
		const def = definition({
			categories: [
				{ key: 'alpha', label: 'Alpha', weight: 10, evaluate: 'Alpha', guidanceSections: ['Missing heading', 'Alpha signals'] }
			]
		});
		const duplicated = `${markdown}\n### Alpha signals\n\nAgain.\n`;

		expect(() => resolveRubricGuidance(markdown, def)).toThrow('"Missing heading" not found');
		expect(() => resolveRubricGuidance(duplicated, def)).toThrow('"Alpha signals" found 2 times');
	});

	it('rejects malformed guidance fields in the schema', () => {
		expect(() => definition({ guidance: 'Scale' })).toThrow('guidance must be an object');
		expect(() => definition({
			categories: [{ key: 'alpha', label: 'Alpha', weight: 10, evaluate: 'Alpha', guidanceSections: 'Alpha signals' }]
		})).toThrow('guidanceSections');
	});
});

describe('guidanceText', () => {
	const guidance = resolveRubricGuidance(markdown, definition());

	it('returns the whole rubric at the full level', () => {
		expect(guidanceText(guidance, 'full', ['alpha'])).toContain('Unreferenced appendix');
	});

	it('returns scale, shared, and all category sections at the category level', () => {
		const text = guidanceText(guidance, 'category', ['alpha']);
		expect(text).toContain('Levels 0-5.');
		expect(text).toContain('Shared standards.');
		expect(text).toContain('Alpha pass and risk.');
		expect(text).toContain('Alpha component guidance.');
		expect(text).not.toContain('Beta pass and risk.');
	});

	it('returns scale and only the first category section at the compact level', () => {
		const text = guidanceText(guidance, 'compact', ['alpha']);
		expect(text).toContain('Levels 0-5.');
		expect(text).toContain('Alpha pass and risk.');
		expect(text).not.toContain('Shared standards.');
		expect(text).not.toContain('Alpha component guidance.');
	});

	it('includes sections shared by several categories once', () => {
		const text = guidanceText(guidance, 'category', ['alpha', 'beta']);
		expect(text.match(/Alpha component guidance/g)).toHaveLength(1);
	});

	it('returns nothing at the minimal level', () => {
		expect(guidanceText(guidance, 'minimal', ['alpha'])).toBe('');
	});
});

describe('availableGuidanceLevels', () => {
	it('offers every level when each one carries different text', () => {
		const guidance = resolveRubricGuidance(markdown, definition());
		expect(availableGuidanceLevels(guidance, ['alpha'])).toEqual(['full', 'category', 'compact', 'minimal']);
	});

	it('skips levels whose text is identical to the richer level', async () => {
		const { guidance } = await readEvaluationRubric('maintainability');
		expect(availableGuidanceLevels(guidance, ['verification_coverage'])).toEqual(['full', 'category', 'minimal']);
	});

	it('offers only full and minimal for a rubric without heading references', () => {
		expect(availableGuidanceLevels(plainRubricGuidance('Some rubric'), ['alpha'])).toEqual(['full', 'minimal']);
	});
});
