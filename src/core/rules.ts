import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseFrontmatter } from '../utils/frontmatter';
import { matchGlobs } from '../utils/glob-matcher';
import { logger } from '../utils/logger';

export interface RuleDefinition {
  name: string;
  paths: string[];
  severity: 'critical' | 'warning' | 'info';
  type: 'review' | 'pattern' | 'command';
  content: string;
  source: 'global' | 'project';
}

interface RuleFrontmatter {
  name: string;
  paths: string[];
  severity: string;
  type: string;
}

const VALID_SEVERITIES = ['critical', 'warning', 'info'];
const VALID_TYPES = ['review', 'pattern', 'command'];

function scanRuleFiles(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function parseRuleFile(filePath: string, source: 'global' | 'project'): RuleDefinition | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = parseFrontmatter<RuleFrontmatter>(raw);

    if (!data.name) {
      logger.debug(`Rule file missing name: ${filePath}`);
      return null;
    }

    return {
      name: data.name,
      paths: data.paths || ['**/*'],
      severity: (VALID_SEVERITIES.includes(data.severity) ? data.severity : 'info') as RuleDefinition['severity'],
      type: (VALID_TYPES.includes(data.type) ? data.type : 'review') as RuleDefinition['type'],
      content,
      source,
    };
  } catch (err) {
    logger.debug(`Failed to parse rule file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function loadRules(projectDir: string): RuleDefinition[] {
  const globalDir = path.join(os.homedir(), '.ai-guardian', 'rules');
  const projectRulesDir = path.join(projectDir, '.ai', 'rules');

  const globalFiles = scanRuleFiles(globalDir);
  const projectFiles = scanRuleFiles(projectRulesDir);

  const rulesMap = new Map<string, RuleDefinition>();

  // Global rules first (lower priority)
  for (const file of globalFiles) {
    const rule = parseRuleFile(file, 'global');
    if (rule) {
      rulesMap.set(rule.name, rule);
    }
  }

  // Project rules override global by name
  for (const file of projectFiles) {
    const rule = parseRuleFile(file, 'project');
    if (rule) {
      rulesMap.set(rule.name, rule);
    }
  }

  return Array.from(rulesMap.values());
}

export function matchRulesForFile(rules: RuleDefinition[], filePath: string): RuleDefinition[] {
  return rules.filter((rule) => matchGlobs(rule.paths, filePath));
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRule(rule: RuleDefinition): RuleValidationResult {
  const errors: string[] = [];

  if (!rule.name) {
    errors.push('Rule must have a name');
  }
  if (!rule.paths || rule.paths.length === 0) {
    errors.push('Rule must have at least one path pattern');
  }
  if (!VALID_SEVERITIES.includes(rule.severity)) {
    errors.push(`Invalid severity: ${rule.severity} (must be ${VALID_SEVERITIES.join(' | ')})`);
  }
  if (!VALID_TYPES.includes(rule.type)) {
    errors.push(`Invalid type: ${rule.type} (must be ${VALID_TYPES.join(' | ')})`);
  }
  if (!rule.content.trim()) {
    errors.push('Rule content is empty');
  }

  return { valid: errors.length === 0, errors };
}

export interface RuleExecutionResult {
  rule: string;
  passed: boolean;
  violations: RuleViolation[];
}

export interface RuleViolation {
  file: string;
  line?: number;
  message: string;
  severity: string;
}

function extractPatterns(content: string): string[] {
  // Each line starting with - that looks like a pattern check
  // Lines formatted as: - `/pattern/` description
  // Or just raw regex patterns, one per line
  const patterns: string[] = [];
  for (const line of content.split('\n')) {
    const regexMatch = line.match(/`\/(.+)\/`/);
    if (regexMatch) {
      patterns.push(regexMatch[1]);
    }
  }
  return patterns;
}

function executePatternRule(rule: RuleDefinition, filePath: string, projectDir: string): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const patterns = extractPatterns(rule.content);

  if (patterns.length === 0) {
    logger.debug(`Rule "${rule.name}": no regex patterns found in content. Use \`/pattern/\` syntax.`);
    return violations;
  }

  const fullPath = path.resolve(projectDir, filePath);
  if (!fs.existsSync(fullPath)) return violations;

  const fileContent = fs.readFileSync(fullPath, 'utf-8');
  const lines = fileContent.split('\n');

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'g');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          violations.push({
            file: filePath,
            line: i + 1,
            message: `Pattern match: /${pattern}/ (rule: ${rule.name})`,
            severity: rule.severity,
          });
          regex.lastIndex = 0;
        }
      }
    } catch {
      logger.debug(`Invalid regex in rule "${rule.name}": ${pattern}`);
    }
  }

  return violations;
}

function executeCommandRule(rule: RuleDefinition, filePath: string, projectDir: string): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Each line starting with $ is a command to execute
  const commands: string[] = [];
  for (const line of rule.content.split('\n')) {
    const cmdMatch = line.match(/^\$\s+(.+)$/);
    if (cmdMatch) {
      commands.push(cmdMatch[1]);
    }
  }

  if (commands.length === 0) {
    logger.debug(`Rule "${rule.name}": no commands found. Use "$ command" syntax.`);
    return violations;
  }

  for (const cmd of commands) {
    const interpolated = cmd.replace(/\{\{file\}\}/g, filePath);
    try {
      execSync(interpolated, { cwd: projectDir, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      // Exit code 0 = passed
    } catch {
      violations.push({
        file: filePath,
        message: `Command failed: ${interpolated} (rule: ${rule.name})`,
        severity: rule.severity,
      });
    }
  }

  return violations;
}

export function executeRule(rule: RuleDefinition, filePath: string, projectDir: string): RuleExecutionResult {
  let violations: RuleViolation[] = [];

  switch (rule.type) {
    case 'pattern':
      violations = executePatternRule(rule, filePath, projectDir);
      break;
    case 'command':
      violations = executeCommandRule(rule, filePath, projectDir);
      break;
    case 'review':
      // review型はLLMレビュー時に注入されるだけなので、ここでは実行しない
      break;
  }

  return {
    rule: rule.name,
    passed: violations.length === 0,
    violations,
  };
}
