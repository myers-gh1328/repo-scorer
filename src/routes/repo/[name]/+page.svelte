<script lang="ts">
  import type { PageData } from './$types';
  import { CATEGORY_MAX, CATEGORY_LABELS, bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let rescoring = $state(false);
  let rescoreError = $state('');

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

  const categoryEntries = Object.keys(CATEGORY_MAX) as (keyof typeof CATEGORY_MAX)[];
</script>

<main>
  <a class="back-link" href="/">← Dashboard</a>

  <div style="display:flex; justify-content:space-between; align-items:center; margin: 1.5rem 0 1rem;">
    <h1 style="margin:0">{data.name}</h1>
    <button onclick={rescore} disabled={rescoring}>
      {rescoring ? 'Scoring…' : 'Re-score'}
    </button>
  </div>

  {#if rescoreError}
    <div class="row-error" style="margin-bottom:1rem">{rescoreError}</div>
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
  {/if}
</main>
