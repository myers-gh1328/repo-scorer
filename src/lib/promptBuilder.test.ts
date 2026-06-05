import { describe, it, expect } from 'vitest';
import { buildPrompt } from './promptBuilder';
import type { ScanResult } from './scanner';

describe('buildPrompt', () => {
  const rubric = 'Scoring rubric content goes here.';
  const emptyEvidence = {
    guidanceFiles: [],
    nestedGuidanceFiles: [],
    skillFiles: [],
    recipeLikeDocs: [],
    specializedAgentFiles: [],
    workflowFiles: [],
    workflowTriggers: [],
    mcpManifestFiles: [],
    hookFiles: [],
    lockfiles: [],
    agentDocs: [],
    hasRootGuidance: false,
    hasFormalSkills: false,
    hasSpecializedAgents: false,
    hasCiWorkflow: false,
    hasPushOrPrCi: false,
    hasManualOnlyCi: false,
    hasMcpManifest: false,
    hasHooks: false,
    hasExternalUnversionedHookReference: false
  };

  it('includes the rubric in the prompt', () => {
    const scan: ScanResult = { files: [], evidence: emptyEvidence };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('Scoring rubric content goes here.');
  });

  it('includes file paths and content for scanned files', () => {
    const scan: ScanResult = {
      files: [{ relativePath: 'AGENTS.md', content: '# Agent Guide' }],
      evidence: { ...emptyEvidence, hasRootGuidance: true, guidanceFiles: ['AGENTS.md'] }
    };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('Agent Guide');
  });

  it('notes when no files were found', () => {
    const scan: ScanResult = { files: [], evidence: emptyEvidence };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('No agent-related files found');
  });

  it('instructs the model to return only JSON', () => {
    const scan: ScanResult = { files: [], evidence: emptyEvidence };
    const prompt = buildPrompt(rubric, scan);
    expect(prompt).toContain('return ONLY a JSON object');
  });

  it('includes all 12 category keys in the expected JSON schema', () => {
    const scan: ScanResult = { files: [], evidence: emptyEvidence };
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

  it('includes authoritative evidence inventory and cap guidance', () => {
    const scan: ScanResult = { files: [], evidence: emptyEvidence };
    const prompt = buildPrompt(rubric, scan);

    expect(prompt).toContain('AUTHORITATIVE EVIDENCE INVENTORY');
    expect(prompt).toContain('Treat it as authoritative');
    expect(prompt).toContain('Do not infer missing artifacts');
    expect(prompt).toContain('"hasFormalSkills": false');
    expect(prompt).toContain('"skills" cannot exceed 4');
    expect(prompt).toContain('"ci_pr_automation" cannot exceed 3');
    expect(prompt).toContain('"ci_pr_automation" cannot exceed 6');
    expect(prompt).toContain('"tool_manifests_mcp" cannot exceed 5');
  });
});
