import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { aiDirExists } from '../core/context';
import { loadConfig } from '../core/config';
import { getAdapter } from '../adapters/adapter';
import { detectProject } from '../core/detector';
import { generateContextFiles, generateGuardianYaml } from '../core/generator';

function getTemplatesDir(): string {
  return path.join(__dirname, '..', '..', 'templates');
}

function writeIfNeeded(filePath: string, content: string, force: boolean): boolean {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath) && !force) {
    return false;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

export async function initCommand(options: { force?: boolean; agent?: string }): Promise<void> {
  const projectDir = process.cwd();

  if (aiDirExists(projectDir) && !options.force) {
    logger.warn('.ai/ directory already exists. Use --force to overwrite.');
    return;
  }

  // Detect project information
  logger.info('Detecting project structure...');
  const info = detectProject(projectDir);

  logger.info(`Detected: ${info.name} (${info.stack.languages.join('/')}${info.frameworks.length > 0 ? ' + ' + info.frameworks.join('/') : ''})`);

  // Generate context files from detected info
  const contextFiles = generateContextFiles(info, projectDir);
  const guardianYaml = generateGuardianYaml(info);
  let created = 0;

  // Write .ai/ context files
  for (const [fileName, content] of Object.entries(contextFiles)) {
    const destPath = path.join(projectDir, '.ai', fileName);
    if (writeIfNeeded(destPath, content, !!options.force)) {
      logger.info(`Created: .ai/${fileName}`);
      created++;
    }
  }

  // Write .ai-guardian.yaml
  const yamlPath = path.join(projectDir, '.ai-guardian.yaml');
  if (writeIfNeeded(yamlPath, guardianYaml, !!options.force)) {
    logger.info('Created: .ai-guardian.yaml');
    created++;
  }

  // Create skills/agents/rules directories
  const extraDirs = ['.ai/skills', '.ai/agents', '.ai/rules'];
  for (const dir of extraDirs) {
    const dirPath = path.join(projectDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Copy skill/agent/rule templates
  const templatesDir = getTemplatesDir();
  const templateExtras = [
    { src: '.ai/skills/review-code.md', dest: '.ai/skills/review-code.md' },
    { src: '.ai/agents/architecture-reviewer.md', dest: '.ai/agents/architecture-reviewer.md' },
    { src: '.ai/rules/code-quality.md', dest: '.ai/rules/code-quality.md' },
  ];
  for (const file of templateExtras) {
    const srcPath = path.join(templatesDir, file.src);
    const destPath = path.join(projectDir, file.dest);
    if (fs.existsSync(srcPath) && (!fs.existsSync(destPath) || options.force)) {
      fs.copyFileSync(srcPath, destPath);
      logger.info(`Created: ${file.dest}`);
      created++;
    }
  }

  if (created > 0) {
    logger.info(`\nInitialized ai-guardian for "${info.name}" (${created} files created).`);
  } else {
    logger.info('All files already exist. No changes made.');
  }

  // Generate adapter files if --agent is specified
  if (options.agent) {
    const config = loadConfig(projectDir);
    const agents = options.agent === 'all' ? ['claude'] : [options.agent];

    for (const agentName of agents) {
      try {
        const adapter = getAdapter(agentName);
        const result = adapter.sync(config, projectDir);
        const totalFiles = result.created.length + result.updated.length;
        logger.info(`Generated ${totalFiles} ${agentName} adapter file(s).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to generate ${agentName} adapter files: ${msg}`);
      }
    }
  }
}
