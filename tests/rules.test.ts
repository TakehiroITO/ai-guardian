import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRules, matchRulesForFile, validateRule, executeRule, RuleDefinition } from '../src/core/rules';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-rules-test-'));
  const rulesDir = path.join(tmpDir, '.ai', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeRule(name: string, content: string): void {
  fs.writeFileSync(path.join(tmpDir, '.ai', 'rules', `${name}.md`), content);
}

describe('loadRules', () => {
  it('loads rules from project directory', () => {
    writeRule('security', `---
name: security
paths: ["src/api/**"]
severity: critical
type: review
---

Check for SQL injection.`);

    const rules = loadRules(tmpDir);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('security');
    expect(rules[0].severity).toBe('critical');
    expect(rules[0].type).toBe('review');
  });

  it('returns empty array when no rules', () => {
    fs.rmSync(path.join(tmpDir, '.ai', 'rules'), { recursive: true });
    const rules = loadRules(tmpDir);
    expect(rules).toEqual([]);
  });

  it('skips files without name', () => {
    writeRule('bad', `---
severity: info
---

No name.`);

    const rules = loadRules(tmpDir);
    expect(rules).toHaveLength(0);
  });
});

describe('matchRulesForFile', () => {
  it('matches rules by glob pattern', () => {
    const rules: RuleDefinition[] = [
      { name: 'api', paths: ['src/api/**'], severity: 'critical', type: 'review', content: '', source: 'project' },
      { name: 'test', paths: ['tests/**'], severity: 'info', type: 'review', content: '', source: 'project' },
    ];

    expect(matchRulesForFile(rules, 'src/api/routes.ts')).toHaveLength(1);
    expect(matchRulesForFile(rules, 'src/api/routes.ts')[0].name).toBe('api');
    expect(matchRulesForFile(rules, 'tests/api.test.ts')).toHaveLength(1);
    expect(matchRulesForFile(rules, 'src/utils/logger.ts')).toHaveLength(0);
  });
});

describe('validateRule', () => {
  it('validates a correct rule', () => {
    const rule: RuleDefinition = {
      name: 'test', paths: ['**/*.ts'], severity: 'warning', type: 'review', content: 'Check stuff.', source: 'project',
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches empty content', () => {
    const rule: RuleDefinition = {
      name: 'test', paths: ['**/*.ts'], severity: 'warning', type: 'review', content: '  ', source: 'project',
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule content is empty');
  });
});

describe('executeRule', () => {
  it('executes pattern rule and finds violations', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'test.ts'), 'const x: any = 5;\nconst y = 10;');

    const rule: RuleDefinition = {
      name: 'no-any',
      paths: ['src/**'],
      severity: 'warning',
      type: 'pattern',
      content: '- Do not use any type: `/: any/`',
      source: 'project',
    };

    const result = executeRule(rule, 'src/test.ts', tmpDir);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].line).toBe(1);
  });

  it('executes command rule', () => {
    const rule: RuleDefinition = {
      name: 'check-true',
      paths: ['**/*'],
      severity: 'info',
      type: 'command',
      content: '$ true',
      source: 'project',
    };

    const result = executeRule(rule, 'any-file.ts', tmpDir);
    expect(result.passed).toBe(true);
  });

  it('command rule fails when command exits non-zero', () => {
    const rule: RuleDefinition = {
      name: 'check-false',
      paths: ['**/*'],
      severity: 'warning',
      type: 'command',
      content: '$ false',
      source: 'project',
    };

    const result = executeRule(rule, 'any-file.ts', tmpDir);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('skips review-type rules', () => {
    const rule: RuleDefinition = {
      name: 'review-only',
      paths: ['**/*'],
      severity: 'info',
      type: 'review',
      content: 'Check stuff.',
      source: 'project',
    };

    const result = executeRule(rule, 'any-file.ts', tmpDir);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
