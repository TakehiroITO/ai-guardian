import * as fs from 'fs';
import * as path from 'path';
import { GuardianConfig } from '../../core/config';
import { detectProject } from '../../core/detector';
import { LLMAdapter, GeneratedFile, SyncResult } from '../adapter';
import { generateHooksConfig } from './generators/hooks';
import { generateSkillFiles } from './generators/skills';
import { generateAgentFiles } from './generators/agents';
import { generateRuleFiles, generateClaudeMd } from './generators/rules';
import { logger } from '../../utils/logger';

export class ClaudeAdapter implements LLMAdapter {
  readonly name = 'claude';

  detect(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, '.claude'));
  }

  generate(config: GuardianConfig, projectDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate settings.local.json with hooks (merge with existing)
    const hooksConfig = generateHooksConfig(config, projectDir);
    const settingsPath = path.join(projectDir, '.claude/settings.local.json');
    let settingsObj: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settingsObj = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        // If parse fails, start fresh
      }
    }
    settingsObj.hooks = hooksConfig;
    files.push({
      path: '.claude/settings.local.json',
      content: JSON.stringify(settingsObj, null, 2) + '\n',
    });

    // Generate skill files
    files.push(...generateSkillFiles(projectDir));

    // Generate agent files
    files.push(...generateAgentFiles(projectDir));

    // Generate rule files
    files.push(...generateRuleFiles(projectDir));

    // Generate CLAUDE.md with project info
    const projectInfo = detectProject(projectDir);
    const claudeMdContent = generateClaudeMd(projectInfo);
    files.push({
      path: 'CLAUDE.md',
      content: claudeMdContent,
    });

    return files;
  }

  sync(config: GuardianConfig, projectDir: string): SyncResult {
    const result: SyncResult = { created: [], updated: [], deleted: [] };
    const generatedFiles = this.generate(config, projectDir);

    for (const file of generatedFiles) {
      const fullPath = path.join(projectDir, file.path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, 'utf-8');
        if (existing !== file.content) {
          fs.writeFileSync(fullPath, file.content, 'utf-8');
          result.updated.push(file.path);
          logger.info(`Updated: ${file.path}`);
        }
      } else {
        fs.writeFileSync(fullPath, file.content, 'utf-8');
        result.created.push(file.path);
        logger.info(`Created: ${file.path}`);
      }
    }

    return result;
  }
}
