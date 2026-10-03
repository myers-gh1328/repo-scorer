import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildCategoryPrompt } from './promptBuilder';
import { loadRubricDefinition } from './rubricSchema';
import { plainRubricGuidance, resolveRubricGuidance } from './rubricGuidance';
import type { ScanResult } from './scanner';
import type { RubricDefinition } from './rubricSchema';

describe('buildCategoryPrompt', () => {
  const rubric = plainRubricGuidance('Scoring rubric content goes here.');
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

    const prompt = buildCategoryPrompt(rubric, 'minimal', rubricDefinition, rubricDefinition.categories[0], scan, {
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
    expect(prompt).not.toContain('## RUBRIC');
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

    const prompt = buildCategoryPrompt(rubric, 'minimal', rubricDefinition, rubricDefinition.categories[0], scan, {
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

    const prompt = buildCategoryPrompt(rubric, 'minimal', rubricDefinition, rubricDefinition.categories[0], scan, {
      includedFiles: [],
      omittedFiles: [],
      evidenceInventory: {},
      totalIncludedChars: 0,
      truncated: false
    }, 'maintainability');

    expect(prompt).toContain('one maintainability category');
  });

  describe('rubric levels', () => {
    const emptyBundle = { includedFiles: [], omittedFiles: [], evidenceInventory: {}, totalIncludedChars: 0, truncated: false };

    async function realRubric() {
      const definition = loadRubricDefinition(await readFile('rubric.schema.json', 'utf-8'));
      const guidance = resolveRubricGuidance(await readFile('rubric.md', 'utf-8'), definition);
      const category = definition.categories.find(item => item.key === 'ci_pr_automation')!;
      return { definition, guidance, category };
    }

    it('sends the whole rubric at the full level and names the relevant sections', async () => {
      const { definition, guidance, category } = await realRubric();
      const prompt = buildCategoryPrompt(guidance, 'full', definition, category, { files: [], evidence: emptyEvidence }, emptyBundle);

      expect(prompt).toContain('The complete rubric follows');
      expect(prompt).toContain('"CI and PR automation", "3.8 Validation, reproducibility, and CI"');
      expect(prompt).toContain('## 11. Common anti-patterns');
      expect(prompt.indexOf('----- END RUBRIC -----')).toBeLessThan(prompt.indexOf('## TASK'));
    });

    it('sends the scoring anchors, shared standards and category sections at the category level', async () => {
      const { definition, guidance, category } = await realRubric();
      const prompt = buildCategoryPrompt(guidance, 'category', definition, category, { files: [], evidence: emptyEvidence }, emptyBundle);

      expect(prompt).toContain('### 0-5 scoring guidance per category');
      expect(prompt).toContain('## 5. Required standards by repo class');
      expect(prompt).toContain('#### CI and PR automation');
      expect(prompt).toContain('### 3.8 Validation, reproducibility, and CI');
      expect(prompt).not.toContain('### 3.9 Governance');
      expect(prompt).not.toContain('## 11. Common anti-patterns');
    });

    it('sends only the scoring anchors and pass/risk signals at the compact level', async () => {
      const { definition, guidance, category } = await realRubric();
      const prompt = buildCategoryPrompt(guidance, 'compact', definition, category, { files: [], evidence: emptyEvidence }, emptyBundle);

      expect(prompt).toContain('### 0-5 scoring guidance per category');
      expect(prompt).toContain('Manual-only CI');
      expect(prompt).not.toContain('### 3.8 Validation');
      expect(prompt).not.toContain('## 5. Required standards');
    });
  });
});
