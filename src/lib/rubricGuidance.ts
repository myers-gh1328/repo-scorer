import type { RubricDefinition } from './rubricSchema';

/**
 * How much rubric text a prompt carries, richest first. Prompts start at `full` and step down
 * only when the scoring model's context window cannot fit them.
 * - full: the whole rubric markdown
 * - category: scoring section + shared sections + every guidance section for the category
 * - compact: scoring section + the category's first (most specific) guidance section
 * - minimal: no rubric text; only the schema's one-line `evaluate` description
 */
export const GUIDANCE_LEVELS = ['full', 'category', 'compact', 'minimal'] as const;
export type GuidanceLevel = typeof GUIDANCE_LEVELS[number];

export interface RubricGuidance {
	markdown: string;
	scoringSection?: string;
	sharedSections: string[];
	categorySections: Record<string, string[]>;
	/** Section text keyed by heading, including the heading line. */
	sectionText: Record<string, string>;
}

interface MarkdownHeading {
	title: string;
	depth: number;
	line: number;
}

export function resolveRubricGuidance(markdown: string, definition: RubricDefinition): RubricGuidance {
	const lines = markdown.split('\n');
	const headings = parseHeadings(lines);
	const config = definition.guidance;
	const categorySections = Object.fromEntries(
		definition.categories.map(category => [category.key, category.guidanceSections ?? []])
	);
	const referenced = new Set([
		...(config?.scoringSection ? [config.scoringSection] : []),
		...(config?.sharedSections ?? []),
		...Object.values(categorySections).flat()
	]);

	const problems: string[] = [];
	const sectionText: Record<string, string> = {};
	for (const title of referenced) {
		const matches = headings.filter(heading => heading.title === title);
		if (matches.length !== 1) {
			problems.push(`"${title}" ${matches.length === 0 ? 'not found' : `found ${matches.length} times`}`);
			continue;
		}
		sectionText[title] = extractSection(lines, headings, matches[0]);
	}
	if (problems.length > 0) {
		throw new Error(`Rubric v${definition.version} guidance headings must each match exactly one markdown heading: ${problems.join('; ')}`);
	}

	return {
		markdown,
		scoringSection: config?.scoringSection,
		sharedSections: config?.sharedSections ?? [],
		categorySections,
		sectionText
	};
}

/** Guidance for a rubric with no schema heading references: only the full text, or nothing. */
export function plainRubricGuidance(markdown: string): RubricGuidance {
	return { markdown, sharedSections: [], categorySections: {}, sectionText: {} };
}

/** Rubric text for a level. Sections shared by several categories are included once. */
export function guidanceText(guidance: RubricGuidance, level: GuidanceLevel, categoryKeys: string[]): string {
	if (level === 'minimal') return '';
	if (level === 'full') return guidance.markdown.trim();
	const scoring = guidance.scoringSection ? [guidance.scoringSection] : [];
	const titles = level === 'category'
		? [...scoring, ...guidance.sharedSections, ...categoryKeys.flatMap(key => guidance.categorySections[key] ?? [])]
		: [...scoring, ...categoryKeys.flatMap(key => guidance.categorySections[key]?.slice(0, 1) ?? [])];
	return [...new Set(titles)].map(title => guidance.sectionText[title]).join('\n\n').trim();
}

/** Levels worth trying for these categories, richest first; levels with identical text are skipped. */
export function availableGuidanceLevels(guidance: RubricGuidance, categoryKeys: string[]): GuidanceLevel[] {
	const levels: GuidanceLevel[] = [];
	let previous: string | undefined;
	for (const level of GUIDANCE_LEVELS) {
		const text = guidanceText(guidance, level, categoryKeys);
		if (level !== 'minimal' && (!text || text === previous)) continue;
		levels.push(level);
		previous = text;
	}
	return levels;
}

function parseHeadings(lines: string[]): MarkdownHeading[] {
	const headings: MarkdownHeading[] = [];
	let fence: string | null = null;
	lines.forEach((line, index) => {
		const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
		if (fenceMatch) {
			const marker = fenceMatch[1][0];
			if (fence === null) fence = marker;
			else if (fence === marker) fence = null;
			return;
		}
		if (fence !== null) return;
		const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			headings.push({ title: heading[2].trim(), depth: heading[1].length, line: index });
		}
	});
	return headings;
}

function extractSection(lines: string[], headings: MarkdownHeading[], heading: MarkdownHeading): string {
	const next = headings.find(item => item.line > heading.line && item.depth <= heading.depth);
	const end = next ? next.line : lines.length;
	return lines
		.slice(heading.line, end)
		.join('\n')
		.replace(/\n-{3,}\s*$/, '')
		.trim();
}
