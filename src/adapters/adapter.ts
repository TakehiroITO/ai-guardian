import { GuardianConfig } from '../core/config';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  deleted: string[];
}

export interface LLMAdapter {
  name: string;
  detect(projectDir: string): boolean;
  generate(config: GuardianConfig, projectDir: string): GeneratedFile[];
  sync(config: GuardianConfig, projectDir: string): SyncResult;
}

export function getAdapter(name: string): LLMAdapter {
  switch (name) {
    case 'claude': {
      const { ClaudeAdapter } = require('./claude/index');
      return new ClaudeAdapter();
    }
    default:
      throw new Error(`Unknown adapter: ${name}. Available adapters: claude`);
  }
}

export function getActiveAdapters(config: GuardianConfig): LLMAdapter[] {
  const active = config.adapters?.active || [];
  return active.map((name) => getAdapter(name));
}
