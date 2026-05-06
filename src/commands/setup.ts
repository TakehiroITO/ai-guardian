import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { logger } from '../utils/logger';

const GLOBAL_DIR = path.join(os.homedir(), '.ai-guardian');

const DEFAULT_GLOBAL_CONFIG = {
  api: {
    anthropic_api_key: '',
    model: 'claude-opus-4-6',
  },
  watch: {
    timeout_minutes: 120,
    debounce_ms: 1000,
  },
  notifications: {
    os: true,
    slack: {
      enabled: false,
      webhook_url: '',
      default_channel: '#dev',
    },
  },
  agents: {
    default: ['claude'],
    available: {
      claude: { model: 'claude-opus-4-6' },
      gpt: { model: 'gpt-4o' },
      gemini: { model: 'gemini-1.5-pro' },
    },
  },
  conductor: {
    enabled: false,
    endpoint: '',
    api_key: '',
  },
  hooks: [],
  adapters: {
    active: [],
  },
  reviewers: {
    architecture: {
      system_file: '~/.ai-guardian/prompts/architecture_review.md',
      model: 'claude-opus-4-6',
    },
    task: {
      system_file: '~/.ai-guardian/prompts/task_review.md',
      model: 'claude-haiku-4-5-20251001',
    },
    code: {
      system_file: '~/.ai-guardian/prompts/code_review.md',
      model: 'claude-opus-4-6',
    },
  },
};

const DEFAULT_PROMPTS: Record<string, string> = {
  'architecture_review.md': `You are an architecture reviewer. Review the provided content for:
- Adherence to documented architecture patterns
- Separation of concerns
- Dependency management
- Breaking changes

Return your review as JSON:
{
  "summary": "Brief summary",
  "issues": [{ "severity": "critical|warning|info", "message": "...", "line": 0 }]
}
Only return valid JSON.`,

  'task_review.md': `You are a task reviewer. Review the provided task/context for:
- Clarity of requirements
- Completeness of acceptance criteria
- Feasibility assessment
- Missing edge cases

Return your review as JSON:
{
  "summary": "Brief summary",
  "issues": [{ "severity": "critical|warning|info", "message": "...", "line": 0 }]
}
Only return valid JSON.`,

  'code_review.md': `You are a code reviewer. Review the provided code for:
- Correctness and potential bugs
- Security vulnerabilities (OWASP top 10)
- Performance concerns
- Code style and readability
- Error handling

Return your review as JSON:
{
  "summary": "Brief summary",
  "issues": [{ "severity": "critical|warning|info", "message": "...", "line": 0 }]
}
Only return valid JSON.`,
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function setupCommand(options: { force?: boolean }): Promise<void> {
  if (fs.existsSync(GLOBAL_DIR) && !options.force) {
    logger.info('~/.ai-guardian/ already exists. Use --force to reinitialize.');
    showStatus();
    return;
  }

  let created = 0;

  // Create directory structure
  const dirs = ['', 'skills', 'agents', 'rules', 'prompts'];
  for (const dir of dirs) {
    ensureDir(path.join(GLOBAL_DIR, dir));
  }

  // Write config.yaml
  const configPath = path.join(GLOBAL_DIR, 'config.yaml');
  if (!fs.existsSync(configPath) || options.force) {
    const configContent = '# ai-guardian global configuration\n# API keys can also be set via environment variables:\n#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY\n\n'
      + yaml.dump(DEFAULT_GLOBAL_CONFIG, { lineWidth: 120 });
    fs.writeFileSync(configPath, configContent, 'utf-8');
    logger.info('Created: ~/.ai-guardian/config.yaml');
    created++;
  }

  // Write default prompt files
  for (const [fileName, content] of Object.entries(DEFAULT_PROMPTS)) {
    const promptPath = path.join(GLOBAL_DIR, 'prompts', fileName);
    if (!fs.existsSync(promptPath) || options.force) {
      fs.writeFileSync(promptPath, content, 'utf-8');
      logger.info(`Created: ~/.ai-guardian/prompts/${fileName}`);
      created++;
    }
  }

  if (created > 0) {
    logger.info(`\nSetup complete (${created} files created).`);
  } else {
    logger.info('All files already exist.');
  }

  showStatus();
}

function showStatus(): void {
  console.log('');
  console.log('Global configuration: ~/.ai-guardian/config.yaml');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set your API key:');
  console.log('     export ANTHROPIC_API_KEY="sk-..."');
  console.log('     # or edit ~/.ai-guardian/config.yaml');
  console.log('');
  console.log('  2. Initialize a project:');
  console.log('     cd your-project');
  console.log('     ai-guardian init');
  console.log('     ai-guardian init --agent claude  # with Claude Code integration');
  console.log('');
  console.log('  3. Start using:');
  console.log('     ai-guardian skill --list');
  console.log('     ai-guardian rules list');
  console.log('     ai-guardian watch start');
}
