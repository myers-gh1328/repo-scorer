import { describe, it, expect } from 'vitest';
import { buildCategoryPrompt } from './promptBuilder';
import type { ScanResult } from './scanner';
import type { RubricDefinition } from './rubricSchema';

describe('buildCategoryPrompt', () => {
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

  it('builds bounded category prompts with included and omitted evidence', () => {
    const scan: ScanResult = {
      files: [],
      evidence: { ...emptyEvidence, hasRootGuidance: true, guidanceFiles: ['AGENTS.md'] }
    };
    const rubricDefinition: RubricDefinition = {
      version: 'test',
      totalScore: 5,
      categories: [
        { key: 'guidance', label: 'Guidance', weight: 5, evaluate: 'Evaluate guidance' }
      ],
      bands: [{ label: 'Any', min: 0, max: 5 }],
      totalWeight: 5,
      categoryMax: { guidance: 5 },
      categoryLabels: { guidance: 'Guidance' },
      bandForScore: () => 'Any'
    };

    const prompt = buildCategoryPrompt(rubric, rubricDefinition, rubricDefinition.categories[0], scan, {
      includedFiles: [{ relativePath: 'AGENTS.md', content: '# Agent Guide' }],
      omittedFiles: ['docs/agent/large.md'],
      evidenceInventory: { hasRootGuidance: true, guidanceFiles: ['AGENTS.md'] },
      totalIncludedChars: 13,
      truncated: true
    });

    expect(prompt).toContain('Key: guidance');
    expect(prompt).toContain('Maximum score: 5');
    expect(prompt).toContain('Evaluate guidance');
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('# Agent Guide');
    expect(prompt).toContain('docs/agent/large.md');
    expect(prompt).toContain('"score": <integer 0-5>');
    expect(prompt).toContain('Return raw JSON only');
    expect(prompt).not.toContain('## GLOBAL RUBRIC');
    expect(prompt).not.toContain('Scoring rubric content goes here.');
  });

  it('includes category-specific deterministic cap guidance in bounded prompts', () => {
    const scan: ScanResult = {
      files: [],
      evidence: { ...emptyEvidence }
    };
    const rubricDefinition: RubricDefinition = {
      version: 'test',
      totalScore: 10,
      categories: [
        { key: 'skills', label: 'Skills', weight: 10, evaluate: 'Evaluate skills' }
      ],
      bands: [{ label: 'Any', min: 0, max: 10 }],
      caps: [
        {
          category: 'skills',
          maxScore: 4,
          reason: 'No formal SKILL.md files found; adjacent workflow docs can earn only partial Skills credit',
          when: { evidenceField: 'hasFormalSkills', equals: false }
        }
      ],
      totalWeight: 10,
      categoryMax: { skills: 10 },
      categoryLabels: { skills: 'Skills' },
      bandForScore: () => 'Any'
    };

    const prompt = buildCategoryPrompt(rubric, rubricDefinition, rubricDefinition.categories[0], scan, {
      includedFiles: [{ relativePath: 'AGENTS.md', content: '# Agent Guide' }],
      omittedFiles: [],
      evidenceInventory: { hasFormalSkills: false, skillFiles: [] },
      totalIncludedChars: 13,
      truncated: false
    });

    expect(prompt).toContain('DETERMINISTIC SCORING CONSTRAINTS');
    expect(prompt).toContain('evidenceInventory.hasFormalSkills is false');
    expect(prompt).toContain('cannot exceed 4');
    expect(prompt).toContain('adjacent documentation may earn partial credit only');
    expect(prompt).toContain('the score cannot be the category maximum');
  });

  it('names maintainability category prompts when maintainability mode is selected', () => {
    const scan: ScanResult = {
      files: [],
      evidence: { ...emptyEvidence }
    };
    const rubricDefinition: RubricDefinition = {
      version: 'test',
      totalScore: 10,
      categories: [
        { key: 'verification_coverage', label: 'Verification coverage', weight: 10, evaluate: 'Evaluate tests' }
      ],
      bands: [{ label: 'Any', min: 0, max: 10 }],
      totalWeight: 10,
      categoryMax: { verification_coverage: 10 },
      categoryLabels: { verification_coverage: 'Verification coverage' },
      bandForScore: () => 'Any'
    };

    const prompt = buildCategoryPrompt(rubric, rubricDefinition, rubricDefinition.categories[0], scan, {
      includedFiles: [],
      omittedFiles: [],
      evidenceInventory: {},
      totalIncludedChars: 0,
      truncated: false
    }, 'maintainability');

    expect(prompt).toContain('one maintainability category');
  });
});
