<script lang="ts">
  import type { PageData } from './$types';
  import { bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let rescoring = $state(false);
  let rescoreError = $state('');
  let planning = $state(false);
  let exporting = $state(false);
  let planError = $state('');
  let exportMessage = $state('');
  let exportedAt = $state('');
  let initializedExportState = $state(false);
  let copied = $state(false);
  const actionsDisabled = $derived(rescoring);
  const modeQuery = $derived(`?mode=${data.mode}`);

  $effect(() => {
    if (!initializedExportState) {
      exportedAt = data.improvementPlan?.exportedAt ?? '';
      initializedExportState = true;
    }
  });

  async function rescore() {
    rescoring = true;
    rescoreError = '';
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, path: data.repoPath, mode: data.mode })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        rescoreError = body?.message ?? 'Scoring failed';
        return;
      }

      window.location.reload();
    } catch {
      rescoreError = 'Network error — could not reach server';
    } finally {
      rescoring = false;
    }
  }

  async function generatePlan() {
    planning = true;
    planError = '';
    exportMessage = '';
    copied = false;
    try {
      const res = await fetch('/api/improvement-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, path: data.repoPath, mode: data.mode })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        planError = body?.message ?? 'Improvement plan failed';
        return;
      }

      window.location.reload();
    } catch {
      planError = 'Network error — could not reach server';
    } finally {
      planning = false;
    }
  }

  async function copyPlan(markdown: string) {
    await navigator.clipboard.writeText(markdown);
    copied = true;
  }

  async function exportPlan() {
    exporting = true;
    planError = '';
    exportMessage = '';
    try {
      const res = await fetch('/api/improvement-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', name: data.name, path: data.repoPath, mode: data.mode })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        planError = body?.message ?? 'Export failed';
        return;
      }
      exportedAt = body.exportedAt ?? new Date().toISOString();
      exportMessage = `Exported to ${body.exported?.planPath ?? body.planPath} and updated ${body.exported?.agentsPath ?? body.agentsPath}`;
    } catch {
      planError = 'Network error — could not reach server';
    } finally {
      exporting = false;
    }
  }

  const categoryEntries = $derived(data.rubric.categories);
  const profileScores = $derived(data.isStaleRubric ? undefined : data.result?.profileScores);
  const cloudProfile = $derived(profileScores?.cloud);
  const localProfile = $derived(profileScores?.[data.localProfileKey]);
  const otherLocalProfiles = $derived(
    Object.values(profileScores ?? {}).filter(profile => profile.key.startsWith('local-') && profile.key !== data.localProfileKey)
  );
  const categoryLabels = $derived(data.rubric.categoryLabels);

  function scoreDrop(from: number, to: number): string {
    const delta = from - to;
    return delta > 0 ? `-${delta}` : '0';
  }

  const compactHistory = $derived(data.scoreHistory?.compact ?? []);

  function trendDelta(current: number): number | null {
    if (compactHistory.length < 2) return null;
    return current - compactHistory[compactHistory.length - 2].finalScore;
  }

  function trendPoints(): string {
    const entries = compactHistory.slice(-16);
    if (entries.length === 0) return '';
    if (entries.length === 1) return `0,${80 - entries[0].finalScore * 0.8} 240,${80 - entries[0].finalScore * 0.8}`;
    return entries.map((entry, index) => {
      const x = (index / (entries.length - 1)) * 240;
      const y = 80 - entry.finalScore * 0.8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
</script>

<main>
  <a class="back-link" href="/{modeQuery}">← Dashboard</a>

  <div style="display:flex; justify-content:space-between; align-items:center; margin: 1.5rem 0 1rem; gap: 0.75rem;">
    <h1 style="margin:0">{data.name}</h1>
    <div class="button-row">
      {#each data.modes as mode}
        <a class="button-link" class:disabled-link={mode.id === data.mode} href={`/repo/${data.name}?mode=${mode.id}`}>
          {mode.label}{mode.beta ? ' beta' : ''}
        </a>
      {/each}
      <button onclick={rescore} disabled={actionsDisabled}>
        {rescoring ? 'Scoring…' : 'Re-score'}
      </button>
      <button onclick={generatePlan} disabled={actionsDisabled || planning || !data.result}>
        {planning ? 'Generating…' : 'Generate Plan'}
      </button>
    </div>
  </div>

  {#if rescoreError}
    <div class="row-error" style="margin-bottom:1rem">{rescoreError}</div>
  {/if}
  {#if planError}
    <div class="row-error" style="margin-bottom:1rem">{planError}</div>
  {/if}
  {#if exportMessage}
    <div class="notice">{exportMessage}</div>
  {/if}

  {#if !data.result}
    <p style="color:#888">This repo has not been scored yet. Click Re-score to evaluate it.</p>
  {:else}
    {@const r = data.result}
    {@const modelScore = r.modelScore ?? r.rawScore ?? r.score}
    {@const modelBand = r.modelBand ?? r.band}
    {@const cappedScore = r.cappedScore ?? r.score}
    {@const cappedBand = r.cappedBand ?? r.band}
    {@const finalScore = r.finalScore ?? r.score}
    {@const finalBand = r.finalBand ?? r.band}
    {@const hasScoreStages = r.resultVersion === 2 || r.modelScore !== undefined || r.cappedScore !== undefined || r.finalScore !== undefined}
    {@const qualityFlags = r.qualityFlags ?? []}
    {@const riskFlags = r.riskFlags ?? []}
    {@const recommendations = r.recommendations ?? []}
    {@const failedConsistencyChecks = (r.consistencyChecks ?? []).filter(check => !check.passed)}
    {@const appliedCaps = r.appliedCaps ?? []}
    {@const delta = trendDelta(finalScore)}

    {#if data.isStaleRubric}
      <div class="notice stale-notice">
        Scored with rubric v{r.rubricVersion ?? '1.0'}; the current rubric is v{data.rubric.version}.
        Category weights changed, so the breakdown below uses the old scale.
        {#if data.hasProfiles}Re-score to see Cloud and Local scores.{:else}Re-score to update.{/if}
      </div>
    {/if}

    <div class="score-hero">
      <span class="score-number" style="color:{bandColor(finalBand)}">{finalScore}</span>
      <span class="band-label" style="color:{bandColor(finalBand)}">{finalBand}</span>
      <span style="color:#666; font-size:0.85rem">
        {r.primaryLanguage} · scored {new Date(r.scoredAt).toLocaleString()}
      </span>
      {#if hasScoreStages}
        <div class="score-stages">
          <span>Model: {modelScore} {modelBand}</span>
          <span>Evidence caps: {cappedScore} {cappedBand}</span>
          <span>Final: {finalScore} {finalBand}</span>
        </div>
      {/if}
    </div>

    {#if cloudProfile || localProfile}
      <div class="section">
        <h2>Cloud vs Local</h2>
        <div class="profile-grid">
          {#each [cloudProfile, localProfile].filter(Boolean) as profile}
            {@const p = profile!}
            <div class="profile-card">
              <div class="profile-head">
                <span class="profile-label">{p.label}</span>
                <span class="profile-score" style="color:{bandColor(p.band)}">{p.score}</span>
                <span style="color:{bandColor(p.band)}">{p.band}</span>
              </div>
              {#if p.sizeRange}
                <small class="muted">{p.sizeRange}</small>
              {/if}
              {#if p.guidanceBudget}
                {@const b = p.guidanceBudget}
                {@const pct = Math.min((b.estimatedTokens / (b.budget * 2)) * 100, 100)}
                <div class="budget">
                  <div class="category-label">
                    <span>Always-on guidance (approx.)</span>
                    <span>~{b.estimatedTokens} / {b.budget} tokens</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:{pct}%; background:{b.withinBudget ? bandColor('Managed') : b.factor > 0.5 ? bandColor('Emerging') : bandColor('Fragile')}"></div>
                  </div>
                  <small class="muted">
                    {b.files.length > 0 ? b.files.join(', ') : 'No always-on guidance files'} · measured for {b.tool} tooling
                    {#if !b.withinBudget} · guidance credit ×{b.factor.toFixed(2)}{/if}
                  </small>
                </div>
              {/if}
              <table class="profile-table">
                <tbody>
                  {#each categoryEntries as category}
                    {@const weight = p.weights[category.key] ?? 0}
                    <tr>
                      <td>{category.label}</td>
                      <td class="num">{weight === 0 ? 'N/A for this tier' : `${p.categories[category.key] ?? 0} / ${weight}`}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#each p.riskFlags as flag}
                <p class="profile-risk">{flag}</p>
              {/each}
              {#each p.consistencyChecks.filter(check => !check.passed) as check}
                <p class="profile-risk">{check.requirement}: {check.reason}</p>
              {/each}
            </div>
          {/each}
        </div>
        {#if otherLocalProfiles.length > 0}
          <p class="muted other-tiers">
            Other local tiers:
            {#each otherLocalProfiles as other, index}
              {index > 0 ? ' · ' : ''}{other.label} {other.score} ({other.band})
            {/each}
            · change your tier in <a href="/settings">Settings</a>
          </p>
        {/if}
      </div>
    {/if}

    {#if hasScoreStages}
      <div class="score-waterfall section">
        <h2>Score Path</h2>
        <div class="waterfall">
          <div class="waterfall-step">
            <span>Model</span>
            <strong>{modelScore}</strong>
            <small>{modelBand}</small>
          </div>
          <div class="waterfall-change">
            {scoreDrop(modelScore, cappedScore)}
          </div>
          <div class="waterfall-step">
            <span>Evidence caps</span>
            <strong>{cappedScore}</strong>
            <small>{cappedBand}</small>
          </div>
          <div class="waterfall-change">
            {scoreDrop(cappedScore, finalScore)}
          </div>
          <div class="waterfall-step final">
            <span>Final</span>
            <strong>{finalScore}</strong>
            <small>{finalBand}</small>
          </div>
        </div>
      </div>
    {/if}

    {#if compactHistory.length > 0}
      <div class="section trend-panel">
        <div class="section-header">
          <h2>Score Trend</h2>
          <span class="muted">
            {compactHistory.length} retained points
            {#if data.scoreHistory?.full}
              · {data.scoreHistory.full.length} full snapshots
            {/if}
          </span>
        </div>
        <div class="trend-summary">
          <svg class="trend-chart" viewBox="0 0 240 80" aria-label="Score history trend">
            <polyline points={trendPoints()} />
          </svg>
          <div>
            <strong>{finalScore}</strong>
            <span>{finalBand}</span>
            {#if delta !== null}
              <small class:positive={delta > 0} class:negative={delta < 0}>
                {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${delta} since previous retained score`}
              </small>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <div class="categories section">
      <h2>Category Breakdown</h2>
      {#each categoryEntries as category}
        {@const key = category.key}
        {@const val = r.categories[key] ?? 0}
        {@const rawVal = r.rawCategories?.[key]}
        {@const max = data.isStaleRubric ? 0 : category.weight}
        {@const pct = max > 0 ? (val / max) * 100 : 0}
        <div class="category-row">
          <div class="category-label">
            <span>{category.label}</span>
            <span>
              {max > 0 ? `${val} / ${max}` : val}
              {#if rawVal !== undefined && rawVal !== val}
                <small class="score-delta">model {rawVal}</small>
              {/if}
            </span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:{pct}%; background:{bandColor(pct >= 90 ? 'Mature' : pct >= 75 ? 'Managed' : pct >= 60 ? 'Operational' : pct >= 40 ? 'Emerging' : 'Fragile')}"></div>
          </div>
        </div>
      {/each}
    </div>

    {#if appliedCaps.length > 0}
      <div class="section">
        <h2>Score Adjustments</h2>
        <div class="cap-grid">
          {#each appliedCaps as cap}
            <div class="cap-chip">
              <strong>{categoryLabels[cap.category] ?? cap.category}</strong>
              <span>{cap.originalScore} → {cap.cappedScore}</span>
              <small>{cap.reason}</small>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if failedConsistencyChecks.length > 0}
      <div class="section">
        <h2>Why Not {modelBand}</h2>
        <ul class="flags">
          {#each failedConsistencyChecks as check}
            <li style="color:#e67e22">
              {check.requirement}: {check.reason}
              {#if check.impact?.bandCeiling}
                Final band ceiling: {check.impact.bandCeiling}
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if qualityFlags.length > 0}
      <div class="section">
        <h2>Strengths</h2>
        <ul class="flags">
          {#each qualityFlags as flag}
            <li style="color:#2ecc71">✓ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if riskFlags.length > 0}
      <div class="section">
        <h2>Risks</h2>
        <ul class="flags">
          {#each riskFlags as flag}
            <li style="color:#e74c3c">✗ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if recommendations.length > 0}
      <div class="section">
        <h2>Recommendations</h2>
        <ul class="flags">
          {#each recommendations as rec}
            <li style="color:#f39c12">→ {rec}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if data.improvementPlan}
      {@const plan = data.improvementPlan}
      <div class="section">
        <div class="section-header">
          <h2>Improvement Plan</h2>
          <div class="button-row">
            <button onclick={exportPlan} disabled={actionsDisabled || exporting}>
              {exporting ? 'Exporting…' : exportedAt ? 'Re-export to Repo' : 'Export to Repo'}
            </button>
            <button onclick={() => copyPlan(plan.markdown)} disabled={actionsDisabled}>
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
          </div>
        </div>
        <p class="muted">
          Generated {new Date(plan.generatedAt).toLocaleString()}
          {#if exportedAt}
            · exported {new Date(exportedAt).toLocaleString()}
          {/if}
        </p>
        <p>{plan.summary}</p>

        <div class="plan-tasks">
          {#each plan.prioritizedTasks as task, index}
            <div class="plan-task">
              <div class="task-heading">
                <h3>{index + 1}. {task.title}</h3>
                <span>{categoryLabels[task.category] ?? task.category}</span>
              </div>
              <div class="task-meta">
                <span>Impact: {task.impact}</span>
                <span>Effort: {task.effort}</span>
              </div>
              <p>{task.instructions}</p>
              {#if task.targetFiles.length > 0}
                <div class="task-list">
                  <strong>Target files</strong>
                  <ul>
                    {#each task.targetFiles as file}
                      <li>{file}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if task.acceptanceCriteria.length > 0}
                <div class="task-list">
                  <strong>Acceptance criteria</strong>
                  <ul>
                    {#each task.acceptanceCriteria as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if task.validationCommands.length > 0}
                <div class="task-list">
                  <strong>Validation</strong>
                  <ul>
                    {#each task.validationCommands as command}
                      <li><code>{command}</code></li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <textarea class="markdown-output" readonly value={plan.markdown}></textarea>
      </div>
    {:else}
      <div class="section">
        <div class="section-header">
          <h2>Improvement Plan</h2>
          <button onclick={generatePlan} disabled={actionsDisabled || planning}>
            {planning ? 'Generating…' : 'Generate Plan'}
          </button>
        </div>
        <p class="muted">Generate a plan after scoring to create LLM-ready remediation tasks stored in repo-scorer.</p>
      </div>
    {/if}
  {/if}
</main>
