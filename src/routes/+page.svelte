<script lang="ts">
  import type { PageData } from './$types';
  import { bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  type ScoreJobStatus = {
    repoName: string;
    evaluationMode: string;
    status: 'running' | 'stale';
    startedAt: string;
    elapsedMs: number;
    staleAfterMs: number;
    phase: string;
    phaseLabel: string;
    currentStep: number;
    totalSteps: number;
    percent: number;
  };

  let scoring = $state<string | null>(null);
  let scoreError = $state<Record<string, string>>({});
  let scoreJobs = $state<ScoreJobStatus[]>([]);
  let clearingStale = $state(false);
  const isScoring = $derived(scoring !== null);
  const allScores = $derived(data.repos.map(repo => data.scores[repo.name]).filter(Boolean));
  const bandCounts = $derived(['Mature', 'Managed', 'Operational', 'Emerging', 'Fragile']
    .map(band => ({ band, count: allScores.filter(score => (score.finalBand ?? score.band) === band).length }))
    .filter(item => item.count > 0));
  const categoryEntries = $derived(data.rubric.categories);
  const scoreJobsByRepo = $derived(Object.fromEntries(scoreJobs
    .filter(job => job.evaluationMode === data.mode)
    .map(job => [job.repoName, job])));
  const modeQuery = $derived(`?mode=${data.mode}`);

  $effect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function loadScoreJobs() {
      try {
        const res = await fetch(`/api/score/status?mode=${data.mode}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) scoreJobs = Array.isArray(body.jobs) ? body.jobs : [];
      } catch {
        if (!cancelled) scoreJobs = [];
      }
    }

    loadScoreJobs();
    timer = setInterval(loadScoreJobs, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  });

  async function scoreRepo(name: string, path: string) {
    scoring = name;
    scoreError = { ...scoreError, [name]: '' };
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, mode: data.mode })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        scoreError = { ...scoreError, [name]: body?.message ?? 'Scoring failed' };
        return;
      }

      window.location.href = `/repo/${name}${modeQuery}`;
    } catch {
      scoreError = { ...scoreError, [name]: 'Network error — could not reach server' };
    } finally {
      scoring = null;
    }
  }

  async function clearStaleJobs() {
    clearingStale = true;
    try {
      await fetch('/api/score/clear-stale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: data.mode })
      });
      const res = await fetch(`/api/score/status?mode=${data.mode}`);
      const body = await res.json().catch(() => ({ jobs: [] }));
      scoreJobs = Array.isArray(body.jobs) ? body.jobs : [];
    } finally {
      clearingStale = false;
    }
  }

  function finalScore(score: NonNullable<PageData['scores'][string]>): number {
    return score.finalScore ?? score.score;
  }

  function finalBand(score: NonNullable<PageData['scores'][string]>): string {
    return score.finalBand ?? score.band;
  }

  function categoryPercent(score: NonNullable<PageData['scores'][string]>, category: PageData['rubric']['categories'][number]): number {
    const value = score.categories?.[category.key] ?? 0;
    return category.weight > 0 ? Math.round((value / category.weight) * 100) : 0;
  }

  function formatElapsed(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  function historyEntries(repoName: string) {
    return data.scoreHistory[repoName]?.compact ?? [];
  }

  function previousDelta(repoName: string, current: number): number | null {
    const entries = historyEntries(repoName);
    if (entries.length < 2) return null;
    return current - entries[entries.length - 2].finalScore;
  }

  function sparklinePoints(repoName: string): string {
    const entries = historyEntries(repoName).slice(-12);
    if (entries.length === 0) return '';
    if (entries.length === 1) return `0,${40 - entries[0].finalScore * 0.4} 120,${40 - entries[0].finalScore * 0.4}`;
    return entries.map((entry, index) => {
      const x = (index / (entries.length - 1)) * 120;
      const y = 40 - entry.finalScore * 0.4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
</script>

<main>
  <div class="page-header">
    <div>
      <h1>Repo Scorer</h1>
      <p class="subtitle">Agentic Repository Maturity Dashboard</p>
    </div>
    <div class="button-row">
      {#each data.modes as mode}
        <a class="button-link" class:disabled-link={mode.id === data.mode} href={`/?mode=${mode.id}`}>
          {mode.label}{mode.beta ? ' beta' : ''}
        </a>
      {/each}
    </div>
    <a
      class="button-link"
      class:disabled-link={isScoring}
      aria-disabled={isScoring}
      href={isScoring ? undefined : '/settings'}
      onclick={(event) => {
        if (isScoring) event.preventDefault();
      }}
    >Settings</a>
  </div>

  {#if bandCounts.length > 0}
    <section class="dashboard-panel">
      <div class="section-header">
        <h2>Score Distribution</h2>
        <span class="muted">{allScores.length} scored repos</span>
      </div>
      <div class="distribution-strip" aria-label="Score distribution by band">
        {#each bandCounts as item}
          <div
            class="distribution-segment"
            style="flex-grow:{item.count}; background:{bandColor(item.band)}"
            title={`${item.band}: ${item.count}`}
          >
            <span>{item.band}</span>
            <strong>{item.count}</strong>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if scoreJobs.length > 0}
    <section class="dashboard-panel">
      <div class="section-header">
        <h2>Scoring Status</h2>
        {#if scoreJobs.some(job => job.status === 'stale')}
          <button onclick={clearStaleJobs} disabled={clearingStale}>
            {clearingStale ? 'Clearing…' : 'Clear Stale Jobs'}
          </button>
        {/if}
      </div>
      <div class="status-list">
        {#each scoreJobs as job}
          <span class:stale={job.status === 'stale'} class="status-pill">
            {job.repoName}: {job.phaseLabel} · {formatElapsed(job.elapsedMs)}
            <span class="mini-progress"><span style="width:{job.percent}%"></span></span>
          </span>
        {/each}
      </div>
    </section>
  {/if}

  <table>
    <thead>
      <tr>
        <th>Repository</th>
        <th>Score</th>
        <th>Band</th>
        <th>Last Scored</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.repos as repo}
        {@const score = data.scores[repo.name]}
        {@const job = scoreJobsByRepo[repo.name]}
        {@const delta = score ? previousDelta(repo.name, finalScore(score)) : null}
        <tr>
          <td>
            {#if score}
              <a href="/repo/{repo.name}{modeQuery}">{repo.name}</a>
            {:else}
              {repo.name}
            {/if}
            {#if scoreError[repo.name]}
              <div class="row-error">{scoreError[repo.name]}</div>
            {/if}
            {#if job}
              <div class:stale={job.status === 'stale'} class="row-status">
                {job.status === 'stale' ? 'Stale scoring job' : 'Scoring'} · {formatElapsed(job.elapsedMs)}
              </div>
            {/if}
          </td>
          <td class="score-cell">
            {#if score}
              {finalScore(score)}
              {#if score.modelScore !== undefined && score.modelScore !== finalScore(score)}
                <span class="score-delta">model {score.modelScore}</span>
              {/if}
              {#if delta !== null && delta !== 0}
                <span class:positive={delta > 0} class:negative={delta < 0} class="score-delta">{delta > 0 ? '+' : ''}{delta}</span>
              {/if}
            {:else}
              —
            {/if}
          </td>
          <td>
            {#if score}
              <span class="band" style="color: {bandColor(finalBand(score))}">{finalBand(score)}</span>
            {:else}
              <span class="unscored">Not yet scored</span>
            {/if}
          </td>
          <td class="date-cell">
            {score ? new Date(score.scoredAt).toLocaleString() : '—'}
            {#if score && historyEntries(repo.name).length > 1}
              <svg class="sparkline" viewBox="0 0 120 40" aria-label="Score trend">
                <polyline points={sparklinePoints(repo.name)} />
              </svg>
            {/if}
          </td>
          <td>
            <button
              onclick={() => scoreRepo(repo.name, repo.path)}
              disabled={isScoring}
            >
              {scoring === repo.name ? 'Scoring…' : 'Score'}
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if allScores.length > 0}
    <section class="dashboard-panel">
      <div class="section-header">
        <h2>Category Heatmap</h2>
        <span class="muted">Percent of each category max</span>
      </div>
      <div class="heatmap-table">
        <div class="heatmap-row heatmap-header">
          <span>Repo</span>
          {#each categoryEntries as category}
            <span title={category.label}>{category.label}</span>
          {/each}
        </div>
        {#each data.repos as repo}
          {@const score = data.scores[repo.name]}
          {#if score}
            <div class="heatmap-row">
              <span>{repo.name}</span>
              {#each categoryEntries as category}
                {@const pct = categoryPercent(score, category)}
                <span
                  class="heatmap-cell"
                  style={`--pct:${pct}%; --alpha:${Math.max(0.18, pct / 100)}`}
                  title={`${category.label}: ${score.categories?.[category.key] ?? 0} / ${category.weight}`}
                >
                  {pct}
                </span>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}
</main>
