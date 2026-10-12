import type { AiTooling } from './server/appSettings';
import type { ImprovementTask } from './types';

export function toolingInstruction(aiTooling: AiTooling): string {
	switch (aiTooling) {
		case 'cursor':
			return 'Cursor. Use Cursor-specific files such as .cursor/rules/*.mdc only where they are the right target.';
		case 'claude':
			return 'Claude. Use Claude-specific files such as .claude/rules/*.md, .claude/skills/*/SKILL.md, and .claude/agents/*.md only where they are the right target.';
		case 'copilot':
			return 'GitHub Copilot. Use files such as .github/copilot-instructions.md, .github/instructions/*.instructions.md, and .github/prompts/*.prompt.md only where they are the right target.';
		case 'windsurf':
			return 'Windsurf. Use Windsurf-specific files only where they are the right target.';
		default:
			return 'Generic / portable. Use agent-agnostic files such as AGENTS.md and .agent/**. Do not create vendor-specific AI tool files.';
	}
}

export function isVendorSpecificPath(file: string): boolean {
	return file.startsWith('.cursor/')
		|| file.startsWith('.claude/')
		|| file.startsWith('.windsurf/')
		|| file === '.github/copilot-instructions.md'
		|| file.startsWith('.github/instructions/')
		|| file.startsWith('.github/prompts/');
}

export function rewriteTaskForTooling(task: ImprovementTask, aiTooling: AiTooling): ImprovementTask {
	const targetFiles = task.targetFiles.map(path => rewriteVendorSpecificPath(path, aiTooling));
	return {
		...task,
		title: replaceVendorText(task.title, aiTooling),
		targetFiles,
		instructions: replaceVendorText(task.instructions, aiTooling),
		acceptanceCriteria: task.acceptanceCriteria.map(item => replaceVendorText(item, aiTooling)),
		validationCommands: task.validationCommands.map(item => replaceVendorText(item, aiTooling))
	};
}

function rewriteVendorSpecificPath(path: string, aiTooling: AiTooling): string {
	if (aiTooling === 'cursor') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.cursor/rules/').replace(/\.md$/, '.mdc');
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.cursor/');
		return path;
	}
	if (aiTooling === 'claude') {
		if (path.startsWith('.agent/rules/')) return path.replace('.agent/rules/', '.claude/rules/');
		if (path.startsWith('.agent/skills/')) return path.replace('.agent/skills/', '.claude/skills/');
		if (path.startsWith('.agent/agents/')) return path.replace('.agent/agents/', '.claude/agents/');
		return path;
	}
	if (aiTooling === 'copilot') {
		if (path === '.agent/instructions.md') return '.github/copilot-instructions.md';
		if (path.startsWith('.agent/instructions/')) return path.replace('.agent/instructions/', '.github/instructions/');
		if (path.startsWith('.agent/prompts/')) return path.replace('.agent/prompts/', '.github/prompts/');
		return path;
	}
	if (aiTooling === 'windsurf') {
		if (path.startsWith('.agent/')) return path.replace('.agent/', '.windsurf/');
		return path;
	}
	if (path.startsWith('.cursor/rules/')) return path.replace('.cursor/rules/', '.agent/rules/').replace(/\.mdc$/, '.md');
	if (path.startsWith('.cursor/')) return path.replace('.cursor/', '.agent/');
	if (path.startsWith('.claude/')) return path.replace('.claude/', '.agent/');
	if (path.startsWith('.windsurf/')) return path.replace('.windsurf/', '.agent/');
	if (path === '.github/copilot-instructions.md') return '.agent/instructions.md';
	if (path.startsWith('.github/instructions/')) return path.replace('.github/instructions/', '.agent/instructions/');
	if (path.startsWith('.github/prompts/')) return path.replace('.github/prompts/', '.agent/prompts/');
	return path;
}

function replaceVendorText(value: string, aiTooling: AiTooling): string {
	if (aiTooling === 'cursor') {
		return value
			.replace(/\.agent\/rules\/([A-Za-z0-9_./-]+)\.md\b/g, '.cursor/rules/$1.mdc')
			.replace(/\.agent\//g, '.cursor/');
	}
	if (aiTooling !== 'generic') return value;
	return value
		.replace(/\bCursor\b/g, 'agent')
		.replace(/\.cursor\/rules\//g, '.agent/rules/')
		.replace(/\.cursor\//g, '.agent/')
		.replace(/\.claude\//g, '.agent/')
		.replace(/\.windsurf\//g, '.agent/')
		.replace(/\.github\/copilot-instructions\.md/g, '.agent/instructions.md')
		.replace(/\.github\/instructions\//g, '.agent/instructions/')
		.replace(/\.github\/prompts\//g, '.agent/prompts/')
		.replace(/\.mdc\b/g, '.md');
}
