import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { GuardianConfig, HookConfig, RuleConfig } from './config';
import { matchGlobs } from '../utils/glob-matcher';
import { logger } from '../utils/logger';

export interface HookEvent {
  type: string;
  file?: string;
  event_type?: string;
  data?: Record<string, unknown>;
}

export interface HookResult {
  hookName: string;
  fired: boolean;
  actionResult?: unknown;
  error?: string;
}

export class HooksEngine {
  private config: GuardianConfig;
  private projectDir: string;
  private hooks: HookConfig[];
  private throttleMap: Map<string, number> = new Map();
  private stateMap: Map<string, unknown> = new Map();
  private completedHooks: Set<string> = new Set();

  constructor(config: GuardianConfig, projectDir: string) {
    this.config = config;
    this.projectDir = projectDir;

    // Merge configured hooks with converted legacy rules
    const configuredHooks = config.hooks || [];
    const legacyHooks = HooksEngine.convertLegacyRules(config.rules || []);
    this.hooks = [...configuredHooks, ...legacyHooks];
  }

  static convertLegacyRules(rules: RuleConfig[]): HookConfig[] {
    return rules.map((rule) => ({
      name: `legacy-rule-${rule.trigger}`,
      event: 'file_change',
      matcher: {
        paths: [`**/${rule.trigger}`],
      },
      action: {
        type: 'review' as const,
        review_type: rule.reviewer,
      },
    }));
  }

  async fire(event: HookEvent): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const hook of this.hooks) {
      if (!this.matchHook(hook, event)) {
        continue;
      }

      if (this.checkThrottle(hook.name)) {
        logger.debug(`Hook ${hook.name} throttled`);
        results.push({ hookName: hook.name, fired: false });
        continue;
      }

      if (hook.compose?.require) {
        const allRequired = hook.compose.require.every((name) => this.completedHooks.has(name));
        if (!allRequired) {
          logger.debug(`Hook ${hook.name} waiting for compose requirements`);
          results.push({ hookName: hook.name, fired: false });
          continue;
        }
      }

      const result = await this.executeHook(hook, event);
      results.push(result);

      if (result.fired) {
        this.completedHooks.add(hook.name);
        this.throttleMap.set(hook.name, Date.now());
      }
    }

    return results;
  }

  getState(key: string): unknown {
    return this.stateMap.get(key);
  }

  setState(key: string, value: unknown): void {
    this.stateMap.set(key, value);
  }

  private matchHook(hook: HookConfig, event: HookEvent): boolean {
    if (hook.event !== event.type) {
      return false;
    }

    if (hook.matcher && event.file) {
      if (hook.matcher.paths && !matchGlobs(hook.matcher.paths, event.file)) {
        return false;
      }
      if (hook.matcher.exclude && matchGlobs(hook.matcher.exclude, event.file)) {
        return false;
      }
      if (hook.matcher.content_pattern) {
        try {
          const content = fs.readFileSync(path.resolve(this.projectDir, event.file), 'utf-8');
          const regex = new RegExp(hook.matcher.content_pattern);
          if (!regex.test(content)) {
            return false;
          }
        } catch {
          return false;
        }
      }
    }

    return true;
  }

  private checkThrottle(hookName: string): boolean {
    const hook = this.hooks.find((h) => h.name === hookName);
    if (!hook?.throttle_ms) {
      return false;
    }
    const lastFired = this.throttleMap.get(hookName);
    if (!lastFired) {
      return false;
    }
    return Date.now() - lastFired < hook.throttle_ms;
  }

  private async executeHook(hook: HookConfig, event: HookEvent): Promise<HookResult> {
    try {
      logger.info(`Firing hook: ${hook.name} (event: ${event.type})`);
      const actionResult = await this.executeAction(hook, event);

      if (hook.state?.track && hook.state.key) {
        this.stateMap.set(hook.state.key, { event, result: actionResult, timestamp: Date.now() });
      }

      this.logExecution(hook.name, { hookName: hook.name, fired: true, actionResult });
      return { hookName: hook.name, fired: true, actionResult };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`Hook ${hook.name} failed: ${error}`);
      this.logExecution(hook.name, { hookName: hook.name, fired: true, error });
      return { hookName: hook.name, fired: true, error };
    }
  }

  private async executeAction(hook: HookConfig, event: HookEvent): Promise<unknown> {
    const action = hook.action;

    switch (action.type) {
      case 'command': {
        if (!action.command) throw new Error('Hook action "command" requires a command string');
        const cmd = this.interpolateEventVars(action.command, event);
        return execSync(cmd, { cwd: this.projectDir, encoding: 'utf-8', timeout: 30000 });
      }

      case 'http': {
        if (!action.url) throw new Error('Hook action "http" requires a url');
        const method = (action.method || 'POST').toLowerCase();
        const response = await axios({ method, url: action.url, data: { event } });
        return response.data;
      }

      case 'review': {
        const reviewType = action.review_type || 'code';
        const target = event.file || '';
        logger.info(`Hook triggering review: type=${reviewType}, target=${target}`);
        return { triggered: 'review', reviewType, target };
      }

      case 'notify': {
        const level = action.level || 'info';
        const message = this.interpolateEventVars(action.message || `Hook ${hook.name} fired`, event);
        logger.info(`Hook notify [${level}]: ${message}`);
        return { triggered: 'notify', level, message };
      }

      case 'block': {
        const message = this.interpolateEventVars(action.message || `Blocked by hook: ${hook.name}`, event);
        logger.warn(`Hook BLOCK: ${message}`);
        return { blocked: true, message };
      }

      default:
        throw new Error(`Unknown hook action type: ${action.type}`);
    }
  }

  private interpolateEventVars(template: string, event: HookEvent): string {
    return template
      .replace(/\{\{file\}\}/g, event.file || '')
      .replace(/\{\{event_type\}\}/g, event.event_type || event.type)
      .replace(/\{\{timeout_minutes\}\}/g, String(this.config.watch.timeout_minutes));
  }

  private logExecution(hookName: string, result: HookResult): void {
    try {
      const logDir = path.join(this.projectDir, '.ai', 'hooks-log');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, 'execution.log');
      const entry = `${new Date().toISOString()} | ${hookName} | fired=${result.fired} | ${result.error ? `error=${result.error}` : 'ok'}\n`;
      fs.appendFileSync(logFile, entry, 'utf-8');
    } catch {
      logger.debug(`Failed to write hook execution log for ${hookName}`);
    }
  }
}
