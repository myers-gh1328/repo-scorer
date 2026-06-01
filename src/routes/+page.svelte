<script lang="ts">
  import type { PageData } from './$types';
  import { bandColor } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let scoring = $state<string | null>(null);
  let scoreError = $state<Record<string, string>>({});

  async function scoreRepo(name: string, path: string) {
    scoring = name;
    scoreError = { ...scoreError, [name]: '' };
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        scoreError = { ...scoreError, [name]: body?.message ?? 'Scoring failed' };
        return;
      }

      window.location.href = `/repo/${name}`;
    } catch {
      scoreError = { ...scoreError, [name]: 'Network error — could not reach server' };
    } finally {
      scoring = null;
    }
  }
</script>

<main>
  <h1>Repo Scorer</h1>
  <p class="subtitle">Agentic Repository Maturity Dashboard</p>

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
        <tr>
          <td>
            {#if score}
              <a href="/repo/{repo.name}">{repo.name}</a>
            {:else}
              {repo.name}
            {/if}
            {#if scoreError[repo.name]}
              <div class="row-error">{scoreError[repo.name]}</div>
            {/if}
          </td>
          <td class="score-cell">{score?.score ?? '—'}</td>
          <td>
            {#if score}
              <span class="band" style="color: {bandColor(score.band)}">{score.band}</span>
            {:else}
              <span class="unscored">Not yet scored</span>
            {/if}
          </td>
          <td class="date-cell">
            {score ? new Date(score.scoredAt).toLocaleString() : '—'}
          </td>
          <td>
            <button
              onclick={() => scoreRepo(repo.name, repo.path)}
              disabled={scoring === repo.name}
            >
              {scoring === repo.name ? 'Scoring…' : 'Score'}
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
