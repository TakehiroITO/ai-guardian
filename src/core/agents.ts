import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseFrontmatter } from '../utils/frontmatter';
import { matchGlobs } from '../utils/glob-matcher';
import { expandTemplate, buildTemplateContext } from './template-engine';
import { GuardianConfig } from './config';
import { getProvider } from '../providers/provider';
import { prependResponseStyle } from './response-style';
import { logger } from '../utils/logger';

export interface AgentDefinition {
  name: string;
  type: 'specialist' | 'reviewer' | 'orchestrator';
  description: string;
  model_preference: string;
  context: {
    paths: string[];
  };
  file_patterns: string[];
  tools: string[];
  rules: string[];
  content: string;
  source: 'global' | 'project';
}

interface AgentFrontmatter {
  name: string;
  type?: string;
  description?: string;
  model_preference?: string;
  context?: {
    paths?: string[];
  };
  file_patterns?: string[];
  tools?: string[];
  rules?: string[];
}

const VALID_AGENT_TYPES = ['specialist', 'reviewer', 'orchestrator'];

function getAgentDirs(projectDir: string): { global: string; project: string } {
  return {
    global: path.join(os.homedir(), '.ai-guardian', 'agents'),
    project: path.join(projectDir, '.ai', 'agents'),
  };
}

function parseAgentFile(filePath: string, source: 'global' | 'project'): AgentDefinition | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = parseFrontmatter<AgentFrontmatter>(raw);

    if (!data.name) {
      logger.debug(`Agent file missing name: ${filePath}`);
      return null;
    }

    const agentType = VALID_AGENT_TYPES.includes(data.type || '') ? data.type! : 'specialist';

    return {
      name: data.name,
      type: agentType as AgentDefinition['type'],
      description: data.description || '',
      model_preference: data.model_preference || 'high-reasoning',
      context: {
        paths: data.context?.paths || [],
      },
      file_patterns: data.file_patterns || [],
      tools: data.tools || [],
      rules: data.rules || [],
      content,
      source,
    };
  } catch (err) {
    logger.debug(`Failed to parse agent file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function loadAgent(name: string, projectDir: string): AgentDefinition | null {
  const dirs = getAgentDirs(projectDir);

  const projectFile = path.join(dirs.project, `${name}.md`);
  if (fs.existsSync(projectFile)) {
    return parseAgentFile(projectFile, 'project');
  }

  const globalFile = path.join(dirs.global, `${name}.md`);
  if (fs.existsSync(globalFile)) {
    return parseAgentFile(globalFile, 'global');
  }

  return null;
}

export function listAgents(projectDir: string): AgentDefinition[] {
  const dirs = getAgentDirs(projectDir);
  const agentsMap = new Map<string, AgentDefinition>();

  if (fs.existsSync(dirs.global)) {
    for (const file of fs.readdirSync(dirs.global).filter((f) => f.endsWith('.md'))) {
      const agent = parseAgentFile(path.join(dirs.global, file), 'global');
      if (agent) agentsMap.set(agent.name, agent);
    }
  }

  if (fs.existsSync(dirs.project)) {
    for (const file of fs.readdirSync(dirs.project).filter((f) => f.endsWith('.md'))) {
      const agent = parseAgentFile(path.join(dirs.project, file), 'project');
      if (agent) agentsMap.set(agent.name, agent);
    }
  }

  return Array.from(agentsMap.values());
}

function resolveModel(agent: AgentDefinition, config: GuardianConfig): { providerName: string; model: string } {
  switch (agent.model_preference) {
    case 'high-reasoning':
      return { providerName: 'anthropic', model: config.api.model };
    case 'fast':
      return { providerName: 'anthropic', model: 'claude-haiku-4-5-20251001' };
    default: {
      // Check if it's a specific provider:model format
      if (agent.model_preference.includes(':')) {
        const [providerName, model] = agent.model_preference.split(':');
        return { providerName, model };
      }
      return { providerName: 'anthropic', model: config.api.model };
    }
  }
}

function collectContextFiles(agent: AgentDefinition, projectDir: string): string {
  const parts: string[] = [];

  for (const contextPath of agent.context.paths) {
    const fullPath = path.resolve(projectDir, contextPath);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      parts.push(`--- ${contextPath} ---\n${content}`);
    } catch {
      logger.debug(`Agent context file not found: ${fullPath}`);
    }
  }

  return parts.join('\n\n');
}

export async function runAgent(
  agent: AgentDefinition,
  input: string,
  config: GuardianConfig,
  projectDir: string,
): Promise<string> {
  const { providerName, model } = resolveModel(agent, config);
  const provider = getProvider(providerName, config);

  // Build system prompt from agent content + rules
  const templateContext = buildTemplateContext(projectDir, config);
  const systemBase = expandTemplate(agent.content, templateContext, projectDir);

  let systemPrompt = systemBase;
  if (agent.rules.length > 0) {
    systemPrompt += '\n\n## Rules\n' + agent.rules.map((r) => `- ${r}`).join('\n');
  }

  // Prepend response style prompt
  systemPrompt = prependResponseStyle(systemPrompt, config);

  // Collect context files
  const contextContent = collectContextFiles(agent, projectDir);
  const userMessage = contextContent
    ? `${input}\n\n## Context Files\n${contextContent}`
    : input;

  logger.info(`Running agent "${agent.name}" (provider: ${providerName}, model: ${model})...`);

  return provider.chat({
    system: systemPrompt,
    userMessage,
    model,
    maxTokens: 4096,
  });
}

export function routeAgents(filePaths: string[], projectDir: string): AgentDefinition[] {
  const agents = listAgents(projectDir);
  const matched = new Map<string, AgentDefinition>();

  for (const agent of agents) {
    if (agent.file_patterns.length === 0) continue;
    for (const filePath of filePaths) {
      if (matchGlobs(agent.file_patterns, filePath)) {
        matched.set(agent.name, agent);
        break;
      }
    }
  }

  // If no file_patterns matched, fall back to context.paths heuristic
  if (matched.size === 0) {
    for (const agent of agents) {
      if (agent.context.paths.length > 0) {
        for (const filePath of filePaths) {
          for (const ctxPath of agent.context.paths) {
            if (filePath.includes(path.basename(ctxPath, '.md'))) {
              matched.set(agent.name, agent);
              break;
            }
          }
          if (matched.has(agent.name)) break;
        }
      }
    }
  }

  // If still nothing, return all reviewer/specialist agents as fallback
  if (matched.size === 0) {
    return agents.filter((a) => a.type === 'reviewer' || a.type === 'specialist');
  }

  return Array.from(matched.values());
}

export async function runMultiAgent(
  agents: AgentDefinition[],
  input: string,
  config: GuardianConfig,
  projectDir: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Run agents in parallel
  const promises = agents.map(async (agent) => {
    try {
      const result = await runAgent(agent, input, config, projectDir);
      results.set(agent.name, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Agent "${agent.name}" failed: ${msg}`);
      results.set(agent.name, `[ERROR: ${msg}]`);
    }
  });

  await Promise.all(promises);
  return results;
}
