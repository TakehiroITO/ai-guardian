import { loadConfig, getProjectDir } from '../core/config';
import { loadSkill, listSkills, expandSkill } from '../core/skills';
import { logger } from '../utils/logger';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks: Buffer[] = [];
    let resolved = false;
    const done = (value: string) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };
    // Timeout to avoid hanging when stdin is not piped but not TTY (e.g. background execution)
    const timer = setTimeout(() => done(''), 100);
    process.stdin.on('data', (chunk) => {
      clearTimeout(timer);
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      done(Buffer.concat(chunks).toString('utf-8'));
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      done('');
    });
  });
}

export async function skillCommand(name: string, options: { list?: boolean }): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  if (options.list || name === '--list') {
    showSkillList(projectDir);
    return;
  }

  const skill = loadSkill(name, projectDir);
  if (!skill) {
    logger.error(`Skill not found: ${name}`);
    logger.info('Use "ai-guardian skill --list" to see available skills.');
    process.exit(1);
  }

  // Read stdin for skill chaining: ai-guardian skill A | ai-guardian skill B
  const stdinInput = await readStdin();

  const expanded = expandSkill(skill, projectDir, config, stdinInput || undefined);
  process.stdout.write(expanded);
}

function showSkillList(projectDir: string): void {
  const skills = listSkills(projectDir);

  if (skills.length === 0) {
    logger.info('No skills found.');
    logger.info('Add skill files to .ai/skills/ or ~/.ai-guardian/skills/');
    return;
  }

  logger.info(`Available skills (${skills.length}):\n`);
  for (const skill of skills) {
    console.log(`  ${skill.name} [${skill.source}]`);
    if (skill.description) {
      console.log(`    ${skill.description}`);
    }
    console.log('');
  }
}
