import { getProjectDir } from '../core/config';
import { loadRules, matchRulesForFile, validateRule, executeRule } from '../core/rules';
import { logger } from '../utils/logger';

export async function rulesCommand(subcommand: string, options: { file?: string }): Promise<void> {
  const projectDir = getProjectDir();

  switch (subcommand) {
    case 'list':
      listRules(projectDir);
      break;
    case 'test':
      testRules(projectDir, options.file);
      break;
    case 'validate':
      validateRules(projectDir);
      break;
    default:
      logger.error(`Unknown subcommand: ${subcommand}. Use list, test, or validate.`);
      process.exit(1);
  }
}

function listRules(projectDir: string): void {
  const rules = loadRules(projectDir);

  if (rules.length === 0) {
    logger.info('No rules found.');
    return;
  }

  logger.info(`Found ${rules.length} rule(s):\n`);
  for (const rule of rules) {
    const paths = rule.paths.join(', ');
    console.log(`  ${rule.name}`);
    console.log(`    severity: ${rule.severity} | type: ${rule.type} | source: ${rule.source}`);
    console.log(`    paths: ${paths}`);
    console.log('');
  }
}

function testRules(projectDir: string, file?: string): void {
  if (!file) {
    logger.error('--file option is required for rules test');
    process.exit(1);
  }

  const rules = loadRules(projectDir);
  const matched = matchRulesForFile(rules, file);

  if (matched.length === 0) {
    logger.info(`No rules match file: ${file}`);
    return;
  }

  logger.info(`${matched.length} rule(s) match file: ${file}\n`);

  let totalViolations = 0;

  for (const rule of matched) {
    if (rule.type === 'review') {
      console.log(`  ${rule.name} [${rule.severity}] (review) — LLMレビュー時に適用`);
    } else {
      const result = executeRule(rule, file, projectDir);
      if (result.passed) {
        console.log(`  ${rule.name} [${rule.severity}] (${rule.type}) — PASS`);
      } else {
        console.log(`  ${rule.name} [${rule.severity}] (${rule.type}) — FAIL (${result.violations.length} violation(s))`);
        for (const v of result.violations) {
          const loc = v.line ? `:${v.line}` : '';
          console.log(`    ${v.file}${loc}: ${v.message}`);
        }
        totalViolations += result.violations.length;
      }
    }
  }

  if (totalViolations > 0) {
    logger.warn(`\n${totalViolations} total violation(s) found.`);
  }
}

function validateRules(projectDir: string): void {
  const rules = loadRules(projectDir);

  if (rules.length === 0) {
    logger.info('No rules to validate.');
    return;
  }

  let hasErrors = false;

  for (const rule of rules) {
    const result = validateRule(rule);
    if (!result.valid) {
      hasErrors = true;
      logger.error(`Rule "${rule.name}" has errors:`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  if (!hasErrors) {
    logger.info(`All ${rules.length} rule(s) are valid.`);
  }
}
