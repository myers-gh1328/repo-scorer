<script lang="ts">
  import type { PageData } from './$types';
  import { CATEGORY_MAX, CATEGORY_LABELS, bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let rescoring = $state(false);
  let rescoreError = $state('');
  let planning = $state(false);
  let planError = $state('');
  let copied = $state(false);

  async function rescore() {
    rescoring = true;
    rescoreError = '';
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, path: data.repoPath })
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
    copied = false;
    try {
      const res = await fetch('/api/improvement-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, path: data.repoPath })
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

  const categoryEntries = Object.keys(CATEGORY_MAX) as (keyof typeof CATEGORY_MAX)[];
</script>

<main>
  <a class="back-link" href="/">← Dashboard</a>

  <div style="display:flex; justify-content:space-between; align-items:center; margin: 1.5rem 0 1rem; gap: 0.75rem;">
    <h1 style="margin:0">{data.name}</h1>
    <div class="button-row">
      <button onclick={rescore} disabled={rescoring}>
        {rescoring ? 'Scoring…' : 'Re-score'}
      </button>
      <button onclick={generatePlan} disabled={planning || !data.result}>
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

  {#if !data.result}
    <p style="color:#888">This repo has not been scored yet. Click Re-score to evaluate it.</p>
  {:else}
    {@const r = data.result}

    <div class="score-hero">
      <span class="score-number" style="color:{bandColor(r.band)}">{r.score}</span>
      <span class="band-label" style="color:{bandColor(r.band)}">{r.band}</span>
      <span style="color:#666; font-size:0.85rem">
        {r.primaryLanguage} · scored {new Date(r.scoredAt).toLocaleString()}
      </span>
    </div>

    <div class="categories section">
      <h2>Category Breakdown</h2>
      {#each categoryEntries as key}
        {@const val = r.categories[key]}
        {@const max = CATEGORY_MAX[key]}
        {@const pct = max > 0 ? (val / max) * 100 : 0}
        <div class="category-row">
          <div class="category-label">
            <span>{CATEGORY_LABELS[key]}</span>
            <span>{val} / {max}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:{pct}%"></div>
          </div>
        </div>
      {/each}
    </div>

    {#if r.qualityFlags.length > 0}
      <div class="section">
        <h2>Strengths</h2>
        <ul class="flags">
          {#each r.qualityFlags as flag}
            <li style="color:#2ecc71">✓ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if r.riskFlags.length > 0}
      <div class="section">
        <h2>Risks</h2>
        <ul class="flags">
          {#each r.riskFlags as flag}
            <li style="color:#e74c3c">✗ {flag}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if r.recommendations.length > 0}
      <div class="section">
        <h2>Recommendations</h2>
        <ul class="flags">
          {#each r.recommendations as rec}
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
          <button onclick={() => copyPlan(plan.markdown)}>
            {copied ? 'Copied' : 'Copy Markdown'}
          </button>
        </div>
        <p class="muted">
          Generated {new Date(plan.generatedAt).toLocaleString()}
        </p>
        <p>{plan.summary}</p>

        <div class="plan-tasks">
          {#each plan.prioritizedTasks as task, index}
            <div class="plan-task">
              <div class="task-heading">
                <h3>{index + 1}. {task.title}</h3>
                <span>{CATEGORY_LABELS[task.category]}</span>
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
        <h2>Improvement Plan</h2>
        <p class="muted">Generate a plan after scoring to create LLM-ready remediation tasks.</p>
      </div>
    {/if}
  {/if}
</main>
