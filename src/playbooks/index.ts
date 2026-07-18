// Load skill files as raw text for injection into the agent system prompt.
// Skills live in .devin/skills/ and define the agent's capabilities.
import propertyLookup from '../../.devin/skills/property-lookup/SKILL.md?raw';
import deckDesign from '../../.devin/skills/deck-design/SKILL.md?raw';
import complianceCheck from '../../.devin/skills/compliance-check/SKILL.md?raw';
import permitResearch from '../../.devin/skills/permit-research/SKILL.md?raw';
import planGeneration from '../../.devin/skills/plan-generation/SKILL.md?raw';
import submissionGuidance from '../../.devin/skills/submission-guidance/SKILL.md?raw';

export const SKILLS = {
  'property-lookup': propertyLookup,
  'deck-design': deckDesign,
  'compliance-check': complianceCheck,
  'permit-research': permitResearch,
  'plan-generation': planGeneration,
  'submission-guidance': submissionGuidance,
};

export function allSkills(): string {
  return Object.entries(SKILLS)
    .map(([name, content]) => `## Skill: ${name}\n${content}`)
    .join('\n\n---\n\n');
}
