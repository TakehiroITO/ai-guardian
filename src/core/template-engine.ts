import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GuardianConfig } from './config';
import { readContextFile } from './context';
import { logger } from '../utils/logger';

export interface TemplateContext {
  project: {
    name: string;
    stack: string;
  };
  git: {
    branch: string;
    diff_stats: string;
  };
  context: Record<string, string>;
  [key: string]: unknown;
}

function execCommand(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000 }).trim();
  } catch {
    return `[ERROR: command failed: ${cmd}]`;
  }
}

function resolveVariable(context: TemplateContext, dotPath: string): string {
  const parts = dotPath.trim().split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current != null ? String(current) : '';
}

export function expandTemplate(template: string, context: TemplateContext, projectDir: string): string {
  let result = template;

  // Pass 1: Shell command execution — !`command`!
  result = result.replace(/!`([^`]+)`!/g, (_match, cmd: string) => {
    logger.debug(`Template: executing command: ${cmd}`);
    return execCommand(cmd, projectDir);
  });

  // Pass 2: File embedding — @path (must be at line start)
  result = result.replace(/^@(.+)$/gm, (_match, filePath: string) => {
    const resolvedPath = path.resolve(projectDir, filePath.trim());
    try {
      return fs.readFileSync(resolvedPath, 'utf-8');
    } catch {
      logger.debug(`Template: file not found: ${resolvedPath}`);
      return `[FILE NOT FOUND: ${filePath.trim()}]`;
    }
  });

  // Pass 3: Variable substitution — {{var}}
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match, varName: string) => {
    return resolveVariable(context, varName);
  });

  return result;
}

export function buildTemplateContext(projectDir: string, config: GuardianConfig): TemplateContext {
  const gitBranch = execCommand('git rev-parse --abbrev-ref HEAD', projectDir);
  const gitDiffStats = execCommand('git diff --stat', projectDir);

  const context: TemplateContext = {
    project: {
      name: config.project?.name || path.basename(projectDir),
      stack: config.project?.stack || '',
    },
    git: {
      branch: gitBranch,
      diff_stats: gitDiffStats,
    },
    context: {},
  };

  // Load .ai/ context files
  const contextFiles = ['PROJECT.md', 'REQUIREMENTS.md', 'ARCHITECTURE.md', 'DECISIONS.md', 'CURRENT_CONTEXT.md'] as const;
  const contextKeys = ['project_md', 'requirements', 'architecture', 'decisions', 'current'];
  for (let i = 0; i < contextFiles.length; i++) {
    const content = readContextFile(projectDir, contextFiles[i]);
    if (content) {
      context.context[contextKeys[i]] = content;
    }
  }

  return context;
}
