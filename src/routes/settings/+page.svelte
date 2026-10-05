<script lang="ts">
	import type { PageData } from './$types';
	import type { RepoConfig } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let configured = $state<RepoConfig[]>([]);
	let initialized = $state(false);
	let manualName = $state('');
	let manualPath = $state('');
	let llmBaseUrl = $state('');
	let llmModel = $state('');
	let availableModels = $state<string[]>([]);
	let loadingModels = $state(false);
	let aiTooling = $state('generic');
	let useJsonSchema = $state(false);
	let localModelTier = $state('medium');
	let llmContextTokens = $state('');
	let saving = $state('');
	let message = $state('');
	let formError = $state('');

	$effect(() => {
		if (!initialized) {
			configured = data.configured;
			llmBaseUrl = data.settings.llmBaseUrl;
			llmModel = data.settings.llmModel;
			availableModels = [...data.models];
			aiTooling = data.settings.aiTooling;
			useJsonSchema = data.settings.useJsonSchema;
			localModelTier = data.settings.localModelTier;
			llmContextTokens = data.settings.llmContextTokens === null ? '' : String(data.settings.llmContextTokens);
			initialized = true;
		}
	});

	function isConfigured(path: string) {
		return configured.some(repo => repo.path === path);
	}

	async function updateRepo(action: 'add' | 'remove' | 'setExport', repo: RepoConfig, updates: Partial<RepoConfig> = {}) {
		saving = `${action}:${repo.path}`;
		message = '';
		formError = '';
		try {
			const res = await fetch('/api/repos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, name: repo.name, path: repo.path, ...updates })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				formError = body?.message ?? 'Could not update repo configuration';
				return;
			}
			configured = body.configured;
			message = action === 'add'
				? `Added ${repo.name}`
				: action === 'remove'
					? `Removed ${repo.name}`
					: `Updated ${repo.name}`;
			if (action === 'add' && repo.path === manualPath.trim()) {
				manualName = '';
				manualPath = '';
			}
		} catch {
			formError = 'Network error while updating repo configuration';
		} finally {
			saving = '';
		}
	}

	function addManualRepo() {
		const path = manualPath.trim();
		const name = manualName.trim() || path.split('/').filter(Boolean).at(-1) || '';
		return updateRepo('add', { name, path });
	}

	async function saveSettings() {
		saving = 'settings';
		message = '';
		formError = '';
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ llmBaseUrl, llmModel, aiTooling, useJsonSchema, localModelTier, llmContextTokens })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				formError = body?.message ?? 'Could not save LLM settings';
				return;
			}
			llmBaseUrl = body.llmBaseUrl;
			llmModel = body.llmModel;
			aiTooling = body.aiTooling;
			useJsonSchema = body.useJsonSchema;
			localModelTier = body.localModelTier;
			llmContextTokens = body.llmContextTokens === null ? '' : String(body.llmContextTokens);
			message = 'Saved LLM settings';
		} catch {
			formError = 'Network error while saving LLM settings';
		} finally {
			saving = '';
		}
	}

	async function loadModels() {
		loadingModels = true;
		message = '';
		formError = '';
		try {
			const res = await fetch(`/api/models?baseUrl=${encodeURIComponent(llmBaseUrl)}`);
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				formError = body?.message ?? 'Could not load models';
				return;
			}
			availableModels = Array.isArray(body?.models) && body.models.length > 0 ? body.models : [...data.models];
			if (availableModels.length > 0 && (!llmModel || !availableModels.includes(llmModel))) {
				llmModel = availableModels[0];
			}
			message = availableModels.length > 0 ? `Loaded ${availableModels.length} model${availableModels.length === 1 ? '' : 's'}` : 'No models reported by server';
		} catch {
			formError = 'Network error while loading models';
		} finally {
			loadingModels = false;
		}
	}
</script>

<main>
	<div class="page-header">
		<div>
			<a class="back-link" href="/">← Dashboard</a>
			<h1>Settings</h1>
			<p class="subtitle">Manage repositories available for scoring.</p>
		</div>
	</div>

	{#if message}
		<div class="notice">{message}</div>
	{/if}
	{#if formError}
		<div class="row-error settings-error">{formError}</div>
	{/if}

	<section class="section">
		<h2>LLM Server</h2>
		<div class="settings-row">
			<label>
				<span>Base URL</span>
				<input bind:value={llmBaseUrl} placeholder="http://192.168.20.43:8080" />
			</label>
			<button disabled={!llmBaseUrl.trim() || loadingModels} onclick={loadModels}>
				{loadingModels ? 'Loading…' : 'Load models'}
			</button>
			<label>
				<span>Model</span>
				<select bind:value={llmModel}>
					{#each availableModels as model}
						<option value={model}>{model}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>AI Tooling</span>
				<select bind:value={aiTooling}>
					<option value="generic">Generic / portable</option>
					<option value="cursor">Cursor</option>
					<option value="claude">Claude</option>
					<option value="copilot">GitHub Copilot</option>
					<option value="windsurf">Windsurf</option>
				</select>
			</label>
			<label>
				<span>Local model size</span>
				<select bind:value={localModelTier} title="Used for the Local score. Models larger than ~35B total parameters should use the Cloud score.">
					<option value="tiny">Tiny (up to ~4B)</option>
					<option value="small">Small (~5-14B)</option>
					<option value="medium">Medium (~15-35B)</option>
				</select>
			</label>
			<label>
				<span>Context window (tokens)</span>
				<input
					bind:value={llmContextTokens}
					inputmode="numeric"
					placeholder="Auto-detect"
					title="The scoring model's context window. Prompts include the full rubric unless it would not fit, then step down to per-category excerpts. Leave blank to use what the server reports; set it for local servers that don't report one (such as mlx_lm.server)."
				/>
			</label>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={useJsonSchema} />
				<span>JSON schema</span>
			</label>
			<button disabled={!llmBaseUrl.trim() || !llmModel.trim() || saving === 'settings'} onclick={saveSettings}>
				{saving === 'settings' ? 'Saving…' : 'Save'}
			</button>
		</div>
	</section>

	<section class="section">
		<h2>Configured Repositories</h2>
		{#if configured.length === 0}
			<p class="muted">No repositories configured.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Path</th>
						<th>Plan export</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each configured as repo}
						<tr>
							<td>{repo.name}</td>
							<td class="path-cell">{repo.path}</td>
							<td>
								<label class="checkbox-label">
									<input
										type="checkbox"
										checked={repo.allowPlanExport === true}
										disabled={saving === `setExport:${repo.path}`}
										onchange={(event) => updateRepo('setExport', repo, { allowPlanExport: event.currentTarget.checked })}
									/>
									<span>{repo.allowPlanExport === true ? 'Enabled' : 'Disabled'}</span>
								</label>
							</td>
							<td>
								<button
									class="danger"
									disabled={saving === `remove:${repo.path}`}
									onclick={() => updateRepo('remove', repo)}
								>
									{saving === `remove:${repo.path}` ? 'Removing…' : 'Remove'}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section class="section">
		<h2>Add Repository Manually</h2>
		<div class="form-grid">
			<label>
				<span>Name</span>
				<input bind:value={manualName} placeholder="repo-name" />
			</label>
			<label>
				<span>Path</span>
				<input bind:value={manualPath} placeholder="/Users/mike.myers/source/repos/example" />
			</label>
			<button disabled={!manualPath.trim() || saving === `add:${manualPath.trim()}`} onclick={addManualRepo}>
				Add
			</button>
		</div>
	</section>

	<section class="section">
		<h2>Discovered Repositories</h2>
		{#if data.discovered.length === 0}
			<p class="muted">No local Git repositories found in the default search roots.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Path</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.discovered as repo}
						<tr>
							<td>{repo.name}</td>
							<td class="path-cell">{repo.path}</td>
							<td>
								{#if isConfigured(repo.path)}
									<span class="unscored">Added</span>
								{:else}
									<button
										disabled={saving === `add:${repo.path}`}
										onclick={() => updateRepo('add', repo)}
									>
										{saving === `add:${repo.path}` ? 'Adding…' : 'Add'}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>
