import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseFrontmatter } from '../utils/frontmatter';
import { expandTemplate, buildTemplateContext } from './template-engine';
import { GuardianConfig } from './config';
import { logger } from '../utils/logger';

export interface SkillDefinition {
  name: string;
  description: string;
  tools: string[];
  context: {
    paths: string[];
    dynamic: boolean;
  };
  content: string;
  rawContent: string;
  source: 'global' | 'project';
}

interface SkillFrontmatter {
  name: string;
  description?: string;
  tools?: string[];
  context?: {
    paths?: string[];
    dynamic?: boolean;
  };
}

function getSkillDirs(projectDir: string): { global: string; project: string } {
  return {
    global: path.join(os.homedir(), '.ai-guardian', 'skills'),
    project: path.join(projectDir, '.ai', 'skills'),
  };
}

function parseSkillFile(filePath: string, source: 'global' | 'project'): SkillDefinition | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = parseFrontmatter<SkillFrontmatter>(raw);

    if (!data.name) {
      logger.debug(`Skill file missing name: ${filePath}`);
      return null;
    }

    return {
      name: data.name,
      description: data.description || '',
      tools: data.tools || [],
      context: {
        paths: data.context?.paths || [],
        dynamic: data.context?.dynamic || false,
      },
      content,
      rawContent: content,
      source,
    };
  } catch (err) {
    logger.debug(`Failed to parse skill file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function loadSkill(name: string, projectDir: string): SkillDefinition | null {
  const dirs = getSkillDirs(projectDir);

  // Project first (higher priority)
  const projectFile = path.join(dirs.project, `${name}.md`);
  if (fs.existsSync(projectFile)) {
    return parseSkillFile(projectFile, 'project');
  }

  // Global fallback
  const globalFile = path.join(dirs.global, `${name}.md`);
  if (fs.existsSync(globalFile)) {
    return parseSkillFile(globalFile, 'global');
  }

  return null;
}

export function listSkills(projectDir: string): SkillDefinition[] {
  const dirs = getSkillDirs(projectDir);
  const skillsMap = new Map<string, SkillDefinition>();

  // Global first (lower priority)
  if (fs.existsSync(dirs.global)) {
    for (const file of fs.readdirSync(dirs.global).filter((f) => f.endsWith('.md'))) {
      const skill = parseSkillFile(path.join(dirs.global, file), 'global');
      if (skill) skillsMap.set(skill.name, skill);
    }
  }

  // Project overrides global
  if (fs.existsSync(dirs.project)) {
    for (const file of fs.readdirSync(dirs.project).filter((f) => f.endsWith('.md'))) {
      const skill = parseSkillFile(path.join(dirs.project, file), 'project');
      if (skill) skillsMap.set(skill.name, skill);
    }
  }

  return Array.from(skillsMap.values());
}

export function expandSkill(skill: SkillDefinition, projectDir: string, config: GuardianConfig, stdinInput?: string): string {
  const context = buildTemplateContext(projectDir, config);
  if (stdinInput) {
    context.stdin = stdinInput;
  }
  return expandTemplate(skill.rawContent, context, projectDir);
}
