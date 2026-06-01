import { describe, it, expect } from 'vitest';
import { buildPrompt } from './promptBuilder';
import type { ScanResult } from './scanner';

describe('buildPrompt', () => {
  const rubric = 'Scoring rubric content goes here.';

  it('includes the rubric in the prompt', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('Scoring rubric content goes here.');
  });

  it('includes file paths and content for scanned files', () => {
    const scan: ScanResult = {
      files: [{ relativePath: 'AGENTS.md', content: '# Agent Guide' }]
    };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('Agent Guide');
  });

  it('notes when no files were found', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('No agent-related files found');
  });

  it('instructs the model to return only JSON', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('return ONLY a JSON object');
  });

  it('includes all 12 category keys in the expected JSON schema', () => {
    const scan: ScanResult = { files: [] };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('persistent_guidance');
    expect(prompt).toContain('scoped_rules');
    expect(prompt).toContain('skills');
    expect(prompt).toContain('specialized_agents');
    expect(prompt).toContain('tool_manifests_mcp');
    expect(prompt).toContain('validation_reproducibility');
    expect(prompt).toContain('ci_pr_automation');
    expect(prompt).toContain('security_sandboxing_hooks');
    expect(prompt).toContain('domain_context');
    expect(prompt).toContain('governance_observability');
    expect(prompt).toContain('versioning_provenance');
    expect(prompt).toContain('onboarding_discoverability');
  });
});
