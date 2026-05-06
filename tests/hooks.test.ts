import { describe, it, expect } from 'vitest';
import { HooksEngine } from '../src/core/hooks';
import { GuardianConfig } from '../src/core/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function makeConfig(overrides: Partial<GuardianConfig> = {}): GuardianConfig {
  return {
    api: { anthropic_api_key: '', model: 'claude-opus-4-6' },
    watch: { timeout_minutes: 120, debounce_ms: 1000 },
    notifications: { os: true, slack: { enabled: false, webhook_url: '', default_channel: '#dev' } },
    agents: { default: ['claude'], available: {} },
    conductor: { enabled: false, endpoint: '', api_key: '' },
    rules: [],
    hooks: [],
    reviewers: {},
    ...overrides,
  };
}

describe('HooksEngine', () => {
  it('fires matching hook for file_change event', async () => {
    const config = makeConfig({
      hooks: [
        {
          name: 'test-hook',
          event: 'file_change',
          matcher: { paths: ['src/**/*.ts'] },
          action: { type: 'notify', message: 'File changed: {{file}}' },
        },
      ],
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-hooks-'));
    const engine = new HooksEngine(config, tmpDir);

    const results = await engine.fire({ type: 'file_change', file: 'src/index.ts' });
    expect(results).toHaveLength(1);
    expect(results[0].fired).toBe(true);
    expect(results[0].hookName).toBe('test-hook');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not fire hook for non-matching file', async () => {
    const config = makeConfig({
      hooks: [
        {
          name: 'ts-only',
          event: 'file_change',
          matcher: { paths: ['src/**/*.ts'] },
          action: { type: 'notify', message: 'TS changed' },
        },
      ],
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-hooks-'));
    const engine = new HooksEngine(config, tmpDir);

    const results = await engine.fire({ type: 'file_change', file: 'docs/readme.md' });
    expect(results).toHaveLength(0);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not fire hook for wrong event type', async () => {
    const config = makeConfig({
      hooks: [
        {
          name: 'timeout-hook',
          event: 'timeout',
          action: { type: 'notify', message: 'Timed out' },
        },
      ],
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-hooks-'));
    const engine = new HooksEngine(config, tmpDir);

    const results = await engine.fire({ type: 'file_change', file: 'src/index.ts' });
    expect(results).toHaveLength(0);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throttles rapid duplicate fires', async () => {
    const config = makeConfig({
      hooks: [
        {
          name: 'throttled',
          event: 'file_change',
          action: { type: 'notify', message: 'changed' },
          throttle_ms: 5000,
        },
      ],
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-hooks-'));
    const engine = new HooksEngine(config, tmpDir);

    const first = await engine.fire({ type: 'file_change', file: 'test.ts' });
    expect(first[0].fired).toBe(true);

    const second = await engine.fire({ type: 'file_change', file: 'test.ts' });
    expect(second[0].fired).toBe(false);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('converts legacy rules to hooks', () => {
    const hooks = HooksEngine.convertLegacyRules([
      { trigger: 'CURRENT_CONTEXT.md', reviewer: 'architecture' },
    ]);

    expect(hooks).toHaveLength(1);
    expect(hooks[0].event).toBe('file_change');
    expect(hooks[0].action.type).toBe('review');
    expect(hooks[0].action.review_type).toBe('architecture');
  });
});
