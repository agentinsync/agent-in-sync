import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getInstructionContent } from '@agent-in-sync/shared';

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  return match ? content.slice(match[0].length) : content;
}

function stripPrerequisiteNote(content: string): string {
  return content.replace(/^> \*\*Prerequisite\*\*:.*\n\n/m, '');
}

describe('SKILL.md sync', () => {
  it('SKILL.md body matches getInstructionContent()', () => {
    // Given
    const skillPath = resolve(
      __dirname,
      '../../../../packages/cli/content/skills/agent-in-sync/SKILL.md'
    );
    const skillRaw = readFileSync(skillPath, 'utf-8');

    // When
    const skillBody = stripPrerequisiteNote(stripFrontmatter(skillRaw));
    const instructionContent = getInstructionContent();

    // Then
    expect(skillBody.trim()).toBe(instructionContent.trim());
  });

  it('SKILL.md has valid frontmatter with name and description', () => {
    // Given
    const skillPath = resolve(
      __dirname,
      '../../../../packages/cli/content/skills/agent-in-sync/SKILL.md'
    );
    const skillRaw = readFileSync(skillPath, 'utf-8');

    // Then
    expect(skillRaw).toMatch(/^---\n/);
    expect(skillRaw).toContain('name: agent-in-sync');
    expect(skillRaw).toContain('description:');
  });
});
