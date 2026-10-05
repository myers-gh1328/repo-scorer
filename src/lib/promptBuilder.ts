import type { ScanResult } from './scanner';
import type { RubricCategoryDefinition, RubricDefinition } from './rubricSchema';
import { guidanceText, type GuidanceLevel, type RubricGuidance } from './rubricGuidance';
import type { EvaluationMode } from './types';

export interface CategoryEvidenceBundle {
  includedFiles: { relativePath: string; content: string }[];
  omittedFiles: string[];
  evidenceInventory: Record<string, unknown>;
  totalIncludedChars: number;
  truncated: boolean;
}

export function buildCategoryPrompt(
  guidance: RubricGuidance,
  level: GuidanceLevel,
  rubricDefinition: RubricDefinition,
  category: RubricCategoryDefinition,
  scan: ScanResult,
  bundle: CategoryEvidenceBundle,
  evaluationMode: EvaluationMode = 'ai-readiness'
): string {
  const modeLabel = evaluationMode === 'maintainability' ? 'maintainability' : 'repository maturity';
  const fileSection =
    bundle.includedFiles.length === 0
      ? 'No evidence file contents were included for this category.'
      : bundle.includedFiles
          .map(f => `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');
  const omittedSection = bundle.omittedFiles.length === 0
    ? 'No matching evidence files were omitted.'
    : bundle.omittedFiles.map(path => `- ${path}`).join('\n');
  const categoryCaps = (rubricDefinition.caps ?? []).filter(cap => cap.category === category.key);
  const capSection = categoryCaps.length === 0
    ? 'No deterministic cap rules are configured for this category.'
    : categoryCaps
        .map(cap => `- If evidenceInventory.${cap.when.evidenceField} is ${cap.when.equals}, the score for "${category.key}" cannot exceed ${cap.maxScore}. Reason: ${cap.reason}`)
        .join('\n');

  return `You are evaluating one ${modeLabel} category using a bounded evidence chunk.

## CATEGORY TO SCORE

Key: ${category.key}
Label: ${category.label}
Maximum score: ${category.weight}
What to evaluate: ${category.evaluate}
${category.scannerSection ? `Scanner quality section: ${category.scannerSection}` : ''}
${rubricSection(guidance, level, category)}
## HEALTH BANDS

${rubricDefinition.bands.map(band => `- ${band.min}-${band.max}: ${band.label}`).join('\n')}

## AUTHORITATIVE EVIDENCE INVENTORY

The following inventory was produced by deterministic scanning. Treat it as authoritative for artifact presence and absence. Do not infer missing artifacts from prose, naming, or adjacent documentation.

\`\`\`json
${JSON.stringify(bundle.evidenceInventory, null, 2)}
\`\`\`

## DETERMINISTIC SCORING CONSTRAINTS

Apply these constraints before choosing the score. Do not assign a score above a listed cap, even if related prose or architecture docs are strong.

${capSection}

## INCLUDED EVIDENCE FILE CONTENTS

${fileSection}

## OMITTED EVIDENCE FILES

These files were discovered but omitted from this category prompt to stay within the evidence budget. Consider their paths as inventory facts only; do not invent their contents.

${omittedSection}

## TASK

Score only the category "${category.key}" from 0 to ${category.weight}. Return ONLY one raw JSON object with this exact structure:

{
  "score": <integer 0-${category.weight}>,
  "evidence": [<strings citing inventory facts or included file paths>],
  "gaps": [<strings describing missing or weak evidence>],
  "structuredGaps": [
    {
      "description": <string>,
      "severity": <"blocking" | "high" | "medium" | "low">,
      "evidenceNeeded": [<strings naming deterministic artifacts that would satisfy the gap>]
    }
  ]
}

Rules:
- Use only the deterministic inventory and included evidence contents as evidence; the rubric describes how to judge it.
- If the rubric and the deterministic constraints disagree, the deterministic constraints win.
- If the deterministic inventory says a formal artifact is absent, adjacent documentation may earn partial credit only; do not award full credit for that artifact-specific requirement.
- If your gaps identify a missing material requirement for this category, the score cannot be the category maximum.
- Model-authored severity is for human triage only; deterministic consistency checks decide final band constraints.
- If important evidence was omitted because the prompt was truncated, mention that uncertainty in gaps.
- Do not score other categories.
- Return raw JSON only - no markdown, no prose, no code fences.`;
}

function rubricSection(guidance: RubricGuidance, level: GuidanceLevel, category: RubricCategoryDefinition): string {
  const text = guidanceText(guidance, level, [category.key]);
  if (!text) return '';
  const relevant = guidance.categorySections[category.key] ?? [];
  const intro = level === 'full'
    ? `The complete rubric follows for reference. Score only the category above.${relevant.length > 0 ? ` The sections most relevant to it are: ${relevant.map(title => `"${title}"`).join(', ')}.` : ''}`
    : 'Rubric excerpts that apply to this category. Use the scoring anchors and the pass and risk signals when choosing the score.';
  return `
## RUBRIC

${intro}

----- BEGIN RUBRIC -----
${text}
----- END RUBRIC -----
`;
}
