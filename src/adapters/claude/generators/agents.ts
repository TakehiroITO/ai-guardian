import { listAgents } from '../../../core/agents';
import { GeneratedFile } from '../../adapter';

export function generateAgentFiles(projectDir: string): GeneratedFile[] {
  const agents = listAgents(projectDir);
  const files: GeneratedFile[] = [];

  for (const agent of agents) {
    const claudeAgentContent = `---
description: ${agent.description || agent.name}
---

# guardian-${agent.name}

Type: ${agent.type}

${agent.content}

${agent.rules.length > 0 ? '## Rules\n' + agent.rules.map((r) => `- ${r}`).join('\n') + '\n' : ''}
> This agent is managed by ai-guardian. Edit the source at .ai/agents/${agent.name}.md
`;

    files.push({
      path: `.claude/agents/guardian-${agent.name}.md`,
      content: claudeAgentContent,
    });
  }

  return files;
}
