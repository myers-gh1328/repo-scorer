import type { ScanResult } from './scanner';

export function buildPrompt(rubric: string, scan: ScanResult): string {
  const fileSection =
    scan.files.length === 0
      ? 'No agent-related files found in this repository.'
      : scan.files
          .map(f => `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');

  return `You are evaluating a software repository against the Agentic Repository Maturity Guide below.

## RUBRIC

${rubric}

## REPOSITORY FILES FOUND

${fileSection}

## TASK

Evaluate the repository based only on the files shown above. return ONLY a JSON object (no explanation, no markdown, no code block wrapper) with this exact structure:

{
  "score": <integer 0-100>,
  "band": <"Fragile" | "Emerging" | "Operational" | "Managed" | "Mature">,
  "primaryLanguage": <primary programming language as a string>,
  "categories": {
    "persistent_guidance": <integer 0-15>,
    "scoped_rules": <integer 0-10>,
    "skills": <integer 0-10>,
    "specialized_agents": <integer 0-10>,
    "tool_manifests_mcp": <integer 0-10>,
    "validation_reproducibility": <integer 0-10>,
    "ci_pr_automation": <integer 0-10>,
    "security_sandboxing_hooks": <integer 0-10>,
    "domain_context": <integer 0-5>,
    "governance_observability": <integer 0-5>,
    "versioning_provenance": <integer 0-3>,
    "onboarding_discoverability": <integer 0-2>
  },
  "qualityFlags": [<strings describing strengths>],
  "riskFlags": [<strings describing gaps or problems>],
  "recommendations": [<strings listing prioritized improvement actions>]
}

Rules:
- The category scores must sum exactly to the total score.
- The band must match: 0-39=Fragile, 40-59=Emerging, 60-74=Operational, 75-89=Managed, 90-100=Mature.
- Return raw JSON only — no markdown, no code fences, no explanation.`;
}
