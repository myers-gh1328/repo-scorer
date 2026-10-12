import { isVendorSpecificPath } from './improvementTooling';
import type { RepoInventory } from './repoInventory';
import type { AiTooling } from './server/appSettings';
import type { ImprovementPlan, ImprovementTask } from './types';

const QUALITY_ERROR_MARKERS = [
	'should not only create agent artifact files',
	'validationCommands are too weak'
];

export function validateImprovementPlan(plan: ImprovementPlan, aiTooling: AiTooling, inventory: RepoInventory): string[] {
	const errors: string[] = [];
	if (plan.prioritizedTasks.length < 3 || plan.prioritizedTasks.length > 5) {
		errors.push('prioritizedTasks must contain 3 to 5 tasks.');
	}
	if (!plan.summary || plan.summary.length < 40) {
		errors.push('summary must be a concrete 1-2 sentence repo-specific summary.');
	}
	if (plan.prioritizedTasks.length > 0 && plan.prioritizedTasks.every(task => task.targetFiles.every(isAgentArtifactPath))) {
		errors.push('prioritizedTasks should not only create agent artifact files; include at least one task that updates an existing repo guidance, workflow, validation, or documentation file from the repository inventory.');
	}
	if (plan.prioritizedTasks.length > 0 && plan.prioritizedTasks.every(task => task.validationCommands.every(isWeakValidationCommand))) {
		errors.push('validationCommands are too weak across the plan; include at least one repo validation command or content check such as grep, npm run check, dotnet test, make test, or pytest.');
	}

	plan.prioritizedTasks.forEach((task, index) => {
		const label = `Task ${index + 1}`;
		if (task.title.length < 8 || task.title.length > 90) {
			errors.push(`${label} title must be specific and between 8 and 90 characters.`);
		}
		if (task.instructions.length < 80) {
			errors.push(`${label} instructions must be specific enough for a coding agent to execute, at least 80 characters.`);
		}
		if (task.targetFiles.length === 0 || task.targetFiles.some(file => !isConcreteTargetFile(file))) {
			errors.push(`${label} targetFiles must contain concrete repo-relative file paths, not placeholders or vague directories.`);
		}
		if (task.acceptanceCriteria.length < 2) {
			errors.push(`${label} must include at least two acceptance criteria.`);
		}
		if (task.validationCommands.length === 0) {
			errors.push(`${label} should include at least one validation command or manual verification command.`);
		}
		if (aiTooling === 'generic' && task.targetFiles.some(isVendorSpecificPath)) {
			errors.push(`${label} uses vendor-specific target files while AI tooling is generic.`);
		}
		const missingReferences = referencedRepoPaths(task)
			.filter(path => !isPlannedTarget(path, task.targetFiles))
			.filter(path => !inventoryHasPath(inventory, path));
		if (missingReferences.length > 0) {
			errors.push(`${label} references paths that were not found in the repository inventory: ${missingReferences.join(', ')}.`);
		}
	});

	return errors;
}

export function isQualityValidationError(error: string): boolean {
	return QUALITY_ERROR_MARKERS.some(marker => error.includes(marker));
}

function referencedRepoPaths(task: ImprovementTask): string[] {
	const text = [
		task.instructions,
		...task.acceptanceCriteria,
		...task.validationCommands
	].join('\n');
	const matches = text.match(/(?:`([^`]+)`|((?:\.?[A-Za-z0-9_-]+\/)[A-Za-z0-9_./*{}-]+)|([A-Za-z0-9_.-]+\.(?:md|json|yml|yaml|cs|csproj|slnx|tf|sh)))/g) ?? [];
	return [...new Set(matches
		.map(match => match.replace(/^`|`$/g, '').trim())
		.map(normalizeReferencedPath)
		.filter(path => path.length > 0)
		.filter(path => !path.includes(' '))
		.filter(path => path.includes('/') || path !== 'SKILL.md')
		.filter(path => !path.startsWith('http')))];
}

function isPlannedTarget(path: string, targetFiles: string[]): boolean {
	return targetFiles.some(target => {
		const normalizedTarget = normalizeReferencedPath(target);
		const targetName = normalizedTarget.split('/').at(-1);
		return path === normalizedTarget
			|| (path === targetName && targetName !== 'SKILL.md')
			|| path.startsWith(`${normalizedTarget}/`)
			|| normalizedTarget.startsWith(`${path}/`);
	});
}

function normalizeReferencedPath(path: string): string {
	return path
		.replace(/[.,;:!?]+$/g, '')
		.replace(/^\.\//, '')
		.replace(/\*\*?\/?$/g, '')
		.replace(/\/\.$/, '')
		.replace(/\/$/, '');
}

function inventoryHasPath(inventory: RepoInventory, path: string): boolean {
	if (inventory.files.has(path) || inventory.dirs.has(path)) return true;
	if (path.includes('*')) {
		const prefix = path.split('*')[0].replace(/\/$/, '');
		return [...inventory.files, ...inventory.dirs].some(item => item.startsWith(prefix));
	}
	return false;
}

function isAgentArtifactPath(file: string): boolean {
	return file.startsWith('.agent/')
		|| file.startsWith('.cursor/')
		|| file.startsWith('.claude/')
		|| file.startsWith('.windsurf/')
		|| file.startsWith('.github/copilot-instructions.md')
		|| file.startsWith('.github/instructions/')
		|| file.startsWith('.github/prompts/');
}

function isWeakValidationCommand(command: string): boolean {
	const normalized = command.trim().toLowerCase();
	if (!normalized) return true;
	if (/^(test \-f|ls |dir |stat )/.test(normalized)) return true;
	if (/^(grep|rg|npm |pnpm |yarn |dotnet |make |pytest|cargo |go test|python |python3 )/.test(normalized)) return false;
	return normalized.includes('verify') || normalized.includes('manual');
}

function isConcreteTargetFile(file: string): boolean {
	if (!file || file.includes('<') || file.includes('>')) return false;
	if (file === 'To be determined') return false;
	if (file.endsWith('/')) return false;
	return file.includes('.') || file.includes('/');
}
