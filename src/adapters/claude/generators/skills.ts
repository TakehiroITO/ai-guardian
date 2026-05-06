import { listSkills } from '../../../core/skills';
import { GeneratedFile } from '../../adapter';

export function generateSkillFiles(projectDir: string): GeneratedFile[] {
  const skills = listSkills(projectDir);
  const files: GeneratedFile[] = [];

  for (const skill of skills) {
    const claudeSkillContent = `---
description: ${skill.description || skill.name}
---

# guardian-${skill.name}

${skill.content}

> This skill is managed by ai-guardian. Edit the source at .ai/skills/${skill.name}.md
`;

    files.push({
      path: `.claude/skills/guardian-${skill.name}.md`,
      content: claudeSkillContent,
    });
  }

  return files;
}
