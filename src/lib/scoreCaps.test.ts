import { describe, expect, it } from 'vitest';
import { applyEvidenceCaps } from './scoreCaps';
import type { CategoryScores, ScoreResult } from './types';
import type { EvidenceInventory } from './scanner';
import type { RubricDefinition } from './rubricSchema';

const categories: CategoryScores = {
  persistent_guidance: 15,
  scoped_rules: 10,
  skills: 10,
  specialized_agents: 10,
  tool_manifests_mcp: 10,
  validation_reproducibility: 10,
  ci_pr_automation: 10,
  security_sandboxing_hooks: 10,
  domain_context: 5,
  governance_observability: 5,
  versioning_provenance: 3,
  onboarding_discoverability: 2
};

const evidence: EvidenceInventory = {
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

function result(overrides: Record<string, number> = {}): ScoreResult {
  const nextCategories: CategoryScores = { ...categories, ...overrides };
  const total = Object.values(nextCategories).reduce((sum, value) => sum + value, 0);
  return {
    scoredAt: '',
    score: total,
    rawScore: total,
    band: 'Mature',
    primaryLanguage: 'TypeScript',
    rawCategories: { ...nextCategories },
    categories: nextCategories,
    appliedCaps: [],
    qualityFlags: [],
    riskFlags: [],
    recommendations: []
  };
}

describe('applyEvidenceCaps', () => {
  it('caps skills at 4 when no SKILL.md exists', () => {
    const adjusted = applyEvidenceCaps(result(), evidence);

    expect(adjusted.categories.skills).toBe(4);
    expect(adjusted.appliedCaps).toContainEqual(expect.objectContaining({
      category: 'skills',
      originalScore: 10,
      cappedScore: 4
    }));
  });

  it('does not record a cap when a score is already below the cap', () => {
    const adjusted = applyEvidenceCaps(result({ skills: 3 }), evidence);

    expect(adjusted.categories.skills).toBe(3);
    expect(adjusted.appliedCaps?.some(cap => cap.category === 'skills')).toBe(false);
  });

  it('caps ci_pr_automation at 3 when no CI exists', () => {
    const adjusted = applyEvidenceCaps(result(), evidence);

    expect(adjusted.categories.ci_pr_automation).toBe(3);
  });

  it('caps ci_pr_automation at 6 for workflow_dispatch-only CI', () => {
    const adjusted = applyEvidenceCaps(result(), {
      ...evidence,
      workflowFiles: ['.github/workflows/ci.yml'],
      workflowTriggers: ['workflow_dispatch'],
      hasCiWorkflow: true,
      hasManualOnlyCi: true
    });

    expect(adjusted.categories.ci_pr_automation).toBe(6);
    expect(adjusted.appliedCaps?.some(cap => cap.category === 'ci_pr_automation' && cap.cappedScore === 3)).toBe(false);
  });

  it('does not cap push or PR CI as manual-only', () => {
    const adjusted = applyEvidenceCaps(result(), {
      ...evidence,
      workflowFiles: ['.github/workflows/ci.yml'],
      workflowTriggers: ['push'],
      hasCiWorkflow: true,
      hasPushOrPrCi: true
    });

    expect(adjusted.categories.ci_pr_automation).toBe(10);
  });

  it('caps tool_manifests_mcp at 5 when no MCP manifest exists', () => {
    const adjusted = applyEvidenceCaps(result(), evidence);

    expect(adjusted.categories.tool_manifests_mcp).toBe(5);
  });

  it('recomputes score and band from adjusted categories', () => {
    const adjusted = applyEvidenceCaps(result(), evidence);
    const sum = Object.values(adjusted.categories).reduce((total, value) => total + value, 0);

    expect(adjusted.score).toBe(sum);
    expect(adjusted.band).toBe('Managed');
  });

  it('applies cap rules from the rubric schema when provided', () => {
    const rubric: RubricDefinition = {
      version: 'test',
      totalScore: 10,
      categories: [
        { key: 'custom_category', label: 'Custom', weight: 10, evaluate: 'Custom category' }
      ],
      bands: [
        { label: 'Low', min: 0, max: 4 },
        { label: 'High', min: 5, max: 10 }
      ],
      caps: [
        {
          category: 'custom_category',
          maxScore: 4,
          reason: 'Custom evidence is missing',
          when: { evidenceField: 'hasRootGuidance', equals: false }
        }
      ],
      totalWeight: 10,
      categoryMax: { custom_category: 10 },
      categoryLabels: { custom_category: 'Custom' },
      bandForScore: score => score >= 5 ? 'High' : 'Low'
    };

    const adjusted = applyEvidenceCaps({
      scoredAt: '',
      score: 10,
      rawScore: 10,
      band: 'High',
      primaryLanguage: 'Unknown',
      rawCategories: { custom_category: 10 } as unknown as CategoryScores,
      categories: { custom_category: 10 } as unknown as CategoryScores,
      appliedCaps: [],
      qualityFlags: [],
      riskFlags: [],
      recommendations: []
    }, evidence, rubric);

    expect(adjusted.categories.custom_category).toBe(4);
    expect(adjusted.band).toBe('Low');
    expect(adjusted.appliedCaps).toContainEqual(expect.objectContaining({
      category: 'custom_category',
      reason: 'Custom evidence is missing'
    }));
  });
});
