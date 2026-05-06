import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GuardianConfig } from './config';
import { logger } from '../utils/logger';

const BUILT_IN_PROMPT_PATH = path.join(__dirname, '..', '..', 'prompts', 'response-style.md');

function resolvePromptPath(promptFile: string): string {
  return promptFile.replace(/^~/, os.homedir());
}

export function loadResponseStylePrompt(config: GuardianConfig): string {
  if (!config.response_style?.enabled) {
    return '';
  }

  const configuredPath = config.response_style?.prompt_file;

  // Try configured path first
  if (configuredPath) {
    const resolved = resolvePromptPath(configuredPath);
    try {
      return fs.readFileSync(resolved, 'utf-8');
    } catch {
      logger.debug(`Response style prompt not found at configured path: ${resolved}`);
    }
  }

  // Fall back to built-in prompt
  try {
    return fs.readFileSync(BUILT_IN_PROMPT_PATH, 'utf-8');
  } catch {
    logger.debug(`Built-in response style prompt not found: ${BUILT_IN_PROMPT_PATH}`);
    return '';
  }
}

export function prependResponseStyle(systemPrompt: string, config: GuardianConfig): string {
  const stylePrompt = loadResponseStylePrompt(config);
  if (!stylePrompt) {
    return systemPrompt;
  }
  return `${stylePrompt}\n\n${systemPrompt}`;
}
