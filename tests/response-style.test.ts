import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadResponseStylePrompt, prependResponseStyle } from '../src/core/response-style';
import { GuardianConfig } from '../src/core/config';

function makeConfig(overrides: Partial<GuardianConfig['response_style']> = {}): GuardianConfig {
  return {
    api: { anthropic_api_key: '', model: 'claude-opus-4-6' },
    response_style: {
      enabled: true,
      prompt_file: '~/.ai-guardian/prompts/response-style.md',
      ...overrides,
    },
    watch: { timeout_minutes: 120, debounce_ms: 1000 },
    notifications: { os: false, slack: { enabled: false, webhook_url: '', default_channel: '' } },
    agents: { default: [], available: {} },
    conductor: { enabled: false, endpoint: '', api_key: '' },
    rules: [],
    hooks: [],
    reviewers: {},
  } as GuardianConfig;
}

describe('response-style', () => {
  describe('loadResponseStylePrompt', () => {
    it('returns empty string when disabled', () => {
      const config = makeConfig({ enabled: false });
      const result = loadResponseStylePrompt(config);
      expect(result).toBe('');
    });

    it('loads built-in prompt when configured path does not exist', () => {
      const config = makeConfig({ prompt_file: '/nonexistent/path.md' });
      const result = loadResponseStylePrompt(config);
      // Should fall back to built-in prompt
      const builtInPath = path.join(__dirname, '..', 'prompts', 'response-style.md');
      if (fs.existsSync(builtInPath)) {
        expect(result).toContain('応答の基本姿勢');
      } else {
        expect(result).toBe('');
      }
    });

    it('loads from configured path when file exists', () => {
      const tmpFile = path.join(__dirname, '__test-response-style.md');
      fs.writeFileSync(tmpFile, '## Test Prompt\nBe honest.');
      try {
        const config = makeConfig({ prompt_file: tmpFile });
        const result = loadResponseStylePrompt(config);
        expect(result).toBe('## Test Prompt\nBe honest.');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('prependResponseStyle', () => {
    it('prepends style prompt to system prompt', () => {
      const tmpFile = path.join(__dirname, '__test-response-style2.md');
      fs.writeFileSync(tmpFile, 'STYLE');
      try {
        const config = makeConfig({ prompt_file: tmpFile });
        const result = prependResponseStyle('SYSTEM', config);
        expect(result).toBe('STYLE\n\nSYSTEM');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('returns original prompt when disabled', () => {
      const config = makeConfig({ enabled: false });
      const result = prependResponseStyle('SYSTEM', config);
      expect(result).toBe('SYSTEM');
    });
  });
});
