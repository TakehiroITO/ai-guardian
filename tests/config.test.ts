import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/core/config';
import * as path from 'path';

describe('loadConfig', () => {
  it('returns default config for non-existent project dir', () => {
    const config = loadConfig('/tmp/non-existent-project-dir');
    expect(config.api.model).toBe('claude-opus-4-6');
    expect(config.watch.timeout_minutes).toBe(120);
    expect(config.watch.debounce_ms).toBe(1000);
    expect(config.notifications.os).toBe(true);
    expect(config.notifications.slack.enabled).toBe(false);
    expect(config.agents.default).toEqual(['claude']);
    expect(config.conductor.enabled).toBe(false);
    expect(config.rules).toEqual([]);
    expect(config.hooks).toEqual([]);
  });

  it('includes reviewer configurations', () => {
    const config = loadConfig('/tmp/non-existent-project-dir');
    expect(config.reviewers.architecture).toBeDefined();
    expect(config.reviewers.task).toBeDefined();
    expect(config.reviewers.code).toBeDefined();
  });

  it('includes adapters and context_config defaults', () => {
    const config = loadConfig('/tmp/non-existent-project-dir');
    expect(config.adapters).toBeDefined();
    expect(config.adapters!.active).toEqual([]);
    expect(config.context_config).toBeDefined();
    expect(config.context_config!.auto_update).toBe(false);
  });
});
