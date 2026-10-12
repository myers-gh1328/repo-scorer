import { toolingInstruction } from './improvementTooling';
import type { RepoInventory } from './repoInventory';
import type { AiTooling } from './server/appSettings';
import type { EvaluationMode, ScoreResult } from './types';

export function buildImprovementPrompt(
	repoName: string,
	rubricText: string,
	score: ScoreResult,
	files: { relativePath: string; content: string }[],
	inventory: RepoInventory,
	validationCandidates: string[],
	aiTooling: AiTooling,
	evaluationMode: EvaluationMode
): string {
	const evidence = files.length === 0
		? 'No agent-related files found in this repository.'
		: files.map(file => `### ${file.relativePath}\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n');

	return `You are creating a practical improvement plan for a repository.

## REPOSITORY
${repoName}

## CURRENT SCORE RESULT
${JSON.stringify(score, null, 2)}

${rubricText ? `## RUBRIC\n${rubricText}\n\n` : ''}## REPOSITORY EVIDENCE
${evidence}

## REPOSITORY PATH INVENTORY
Use these paths when referencing existing files or directories. Do not cite existing repo paths that are absent from this inventory.
${inventory.list.map(path => `- ${path}`).join('\n')}

## VALIDATION COMMAND CANDIDATES
Prefer these commands when they fit the task. If none fit, use a concrete content check such as grep -q.
${validationCandidates.length > 0 ? validationCandidates.map(command => `- ${command}`).join('\n') : '- No validation commands were found in repo files.'}

## TASK
Return ONLY a JSON object that a human or coding LLM can use to improve the repository.

## AI TOOLING TARGET
${toolingInstruction(aiTooling)}

Required schema:
{
  "summary": <short summary string>,
  "strongestCategories": [<category keys>],
  "weakestCategories": [<category keys>],
  "prioritizedTasks": [
    {
      "title": <short task title>,
      "category": <one category key>,
      "impact": <"high" | "medium" | "low">,
      "effort": <"high" | "medium" | "low">,
      "targetFiles": [<repo-relative files or directories to create/update>],
      "instructions": <specific implementation instructions an LLM can execute>,
      "acceptanceCriteria": [<observable completion checks>],
      "validationCommands": [<commands to run, if known>]
    }
  ]
}

Plan quality hints:
${planQualityHints(evaluationMode)}
- Prefer validation commands from VALIDATION COMMAND CANDIDATES. If using a new-file existence check, also include at least one grep/content check or repo test/check command somewhere in the plan.

Rules:
- Include exactly 3 to 5 prioritized tasks. This is a next-action batch, not a full roadmap.
- Optimize for the highest score impact first.
- Each task must be independently actionable in one coding-agent session.
- At least one task must improve or update an existing repo file from REPOSITORY PATH INVENTORY, such as AGENTS.md, README.md, package scripts, CI workflow files, docs, or validation workflow guidance. Do not make every task only create new .agent files.
- Prefer ${preferredPlanTargets(evaluationMode)}.
- If AI TOOLING TARGET is generic, do not recommend tool/vendor-specific files such as .cursor/**, .claude/**, .windsurf/**, or .github/copilot-instructions.md.
- If AI TOOLING TARGET names a specific tool, recommend that tool's conventional files where appropriate.
- Every task must have concrete repo-relative targetFiles.
- References to existing source, test, docs, schemas, or config files must use paths present in REPOSITORY PATH INVENTORY.
- New files are allowed only when they are listed in targetFiles.
- Every task must have at least two acceptanceCriteria.
- Every task must have at least one validationCommands entry. Existence checks such as "test -f ..." are allowed for new files, but at least one task in the plan must include a stronger repo validation command or content check such as "npm run check", "dotnet test ...", "make test", "pytest", or "grep -q ...".
- Tie each task to one weak or improvable category.
- Do not invent product facts not supported by the evidence.
- Return exactly one raw JSON object. Do not return markdown, commentary, code fences, or explanations.

Example shape:
${planExample(evaluationMode)}`;
}

export function buildRepairPrompt(
	raw: string,
	repoName: string,
	score: ScoreResult,
	validationErrors: string[],
	inventory: RepoInventory,
	validationCandidates: string[],
	aiTooling: AiTooling,
	evaluationMode: EvaluationMode
): string {
	const repairInventory = inventory.list.slice(0, 200);
	return `Return one valid JSON object for an improvement plan for ${repoName}. Do not include markdown, comments, code fences, or explanation.

Current score:
${JSON.stringify(score, null, 2)}

AI tooling target:
${toolingInstruction(aiTooling)}

Evaluation mode:
${evaluationMode}

Validation errors to fix:
${validationErrors.map(error => `- ${error}`).join('\n')}

You must fix every listed validation error. Preserve valid repo-specific references where possible. Do not remove tasks unless a task cannot be repaired.

Repository path inventory:
Use these paths when referencing existing files or directories. Do not cite existing repo paths that are absent from this inventory unless they are new files listed in targetFiles.
${repairInventory.map(path => `- ${path}`).join('\n')}

Validation command candidates:
Prefer these commands when they fit the task. If none fit, use a concrete content check such as grep -q.
${validationCandidates.length > 0 ? validationCandidates.map(command => `- ${command}`).join('\n') : '- No validation commands were found in repo files.'}

Required keys:
- summary
- strongestCategories
- weakestCategories
- prioritizedTasks with title, category, impact, effort, targetFiles, instructions, acceptanceCriteria, validationCommands

Repair rules:
- Return exactly one raw JSON object.
- Include exactly 3 to 5 prioritizedTasks.
- Every task needs concrete targetFiles, specific instructions, at least two acceptanceCriteria, and at least one validationCommands entry.
- Do not make every task only create new .agent files. Include at least one task that updates an existing repo guidance, workflow, validation, or docs file from the inventory.
- Do not use only existence/listing checks. Include at least one stronger repo validation command or content check such as grep, npm run check, dotnet test, make test, or pytest.
- ${repairTargetRule(evaluationMode)}

Original model output to repair:
${raw}`;
}

function planQualityHints(evaluationMode: EvaluationMode): string {
	if (evaluationMode === 'maintainability') {
		return [
			'- A good maintainability plan often has one task that strengthens tests, validation commands, or CI around real repo behavior.',
			'- A good maintainability plan often has one task that improves runtime/dependency, IaC, credential, or repository hygiene using existing project files.',
			'- A good maintainability plan often has one task that updates README, setup, troubleshooting, architecture, or operational docs when those gaps affect maintainers.'
		].join('\n');
	}
	return [
		'- A good small-model plan often has one task that updates existing guidance such as AGENTS.md or README.md.',
		'- A good small-model plan often has one task that creates scoped rules for a real source, docs, or infra path from the inventory.',
		'- A good small-model plan often has one task that creates a reusable workflow skill or verifier agent tied to real repo files.'
	].join('\n');
}

function preferredPlanTargets(evaluationMode: EvaluationMode): string {
	if (evaluationMode === 'maintainability') {
		return 'existing tests, package scripts, CI workflow files, README.md, docs/adr/*.md, docs/architecture/*.md, Makefile, IaC validation files, safe example config, and operational documentation before creating agent-specific artifacts';
	}
	return 'portable, agent-agnostic files such as AGENTS.md, .agent/improvement-plan.md, .agent/rules/*.md, .agent/skills/*/SKILL.md, .agent/agents/*.md, docs/adr/*.md, Makefile, package scripts, and CI workflow files when CI already exists';
}

function repairTargetRule(evaluationMode: EvaluationMode): string {
	if (evaluationMode === 'maintainability') {
		return 'Maintainability plans should prefer existing repo tests, validation, docs, CI, runtime, dependency, IaC, and configuration files; do not convert maintainability gaps into agent artifact work unless the score evidence specifically calls for it.';
	}
	return 'Generic tooling must use AGENTS.md and .agent/**, not vendor-specific files.';
}

function planExample(evaluationMode: EvaluationMode): string {
	if (evaluationMode === 'maintainability') {
		return JSON.stringify({
			summary: 'This repo has useful project files but needs clearer runtime guidance, stronger validation, and onboarding docs so maintainers can make routine changes safely.',
			strongestCategories: ['repository_hygiene'],
			weakestCategories: ['verification_coverage', 'runtime_dependency_health'],
			prioritizedTasks: [
				{
					title: 'Document runtime support policy',
					category: 'runtime_dependency_health',
					impact: 'high',
					effort: 'low',
					targetFiles: ['README.md'],
					instructions: 'Update README.md with supported runtime versions, dependency update expectations, and the validation command maintainers should run before merging runtime changes.',
					acceptanceCriteria: ['README.md names supported runtime expectations', 'README.md includes a concrete validation command'],
					validationCommands: ['grep -q "runtime" README.md']
				}
			]
		}, null, 2);
	}
	return JSON.stringify({
		summary: 'This repo has useful baseline guidance but needs portable scoped rules, reusable workflow instructions, and validation hooks so agents can make repeatable changes safely.',
		strongestCategories: ['persistent_guidance'],
		weakestCategories: ['scoped_rules', 'skills', 'validation_reproducibility'],
		prioritizedTasks: [
			{
				title: 'Add portable scoped repo rules',
				category: 'scoped_rules',
				impact: 'high',
				effort: 'medium',
				targetFiles: ['.agent/rules/repo-guidance.md'],
				instructions: 'Create repo-specific scoped guidance for the highest-risk code areas. Include conventions, ownership boundaries, and the exact validation commands agents should run before reporting completion.',
				acceptanceCriteria: ['The file contains repo-specific path or module guidance', 'The file includes concrete validation commands'],
				validationCommands: ['test -f .agent/rules/repo-guidance.md']
			}
		]
	}, null, 2);
}
