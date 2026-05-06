import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { logger } from '../utils/logger';

export interface ReviewerConfig {
  system_file: string;
  model: string;
}

export interface RuleConfig {
  trigger: string;
  reviewer: string;
}

export interface SlackConfig {
  enabled: boolean;
  webhook_url: string;
  default_channel: string;
}

export interface ConductorConfig {
  enabled: boolean;
  endpoint: string;
  api_key: string;
}

export interface AgentConfig {
  model?: string;
  api_key?: string;
}

export interface HookMatcherConfig {
  paths?: string[];
  exclude?: string[];
  content_pattern?: string;
}

export interface HookActionConfig {
  type: 'command' | 'http' | 'review' | 'notify' | 'block';
  command?: string;
  url?: string;
  method?: string;
  review_type?: string;
  level?: string;
  message?: string;
}

export interface HookComposeConfig {
  require?: string[];
  within_ms?: number;
}

export interface HookStateConfig {
  track?: boolean;
  key?: string;
}

export interface HookConfig {
  name: string;
  event: string;
  matcher?: HookMatcherConfig;
  action: HookActionConfig;
  throttle_ms?: number;
  state?: HookStateConfig;
  compose?: HookComposeConfig;
}

export interface AdaptersConfig {
  active: string[];
  claude?: { auto_sync: boolean };
  cursor?: { auto_sync: boolean };
}

export interface ContextConfig {
  auto_update: boolean;
  snapshot_on_branch: boolean;
}

export interface ResponseStyleConfig {
  enabled: boolean;
  prompt_file: string;
}

export interface GuardianConfig {
  api: {
    anthropic_api_key: string;
    model: string;
  };
  response_style: ResponseStyleConfig;
  watch: {
    timeout_minutes: number;
    debounce_ms: number;
  };
  notifications: {
    os: boolean;
    slack: SlackConfig;
  };
  agents: {
    default: string[];
    available: Record<string, AgentConfig>;
  };
  conductor: ConductorConfig;
  rules: RuleConfig[];
  rules_legacy?: RuleConfig[];
  hooks?: HookConfig[];
  adapters?: AdaptersConfig;
  context_config?: ContextConfig;
  reviewers: Record<string, ReviewerConfig>;
  project?: {
    name: string;
    stack: string;
  };
}

const DEFAULT_CONFIG: GuardianConfig = {
  api: {
    anthropic_api_key: '',
    model: 'claude-opus-4-6',
  },
  response_style: {
    enabled: true,
    prompt_file: '~/.ai-guardian/prompts/response-style.md',
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
    },
  },
  conductor: {
    enabled: false,
    endpoint: '',
    api_key: '',
  },
  rules: [],
  hooks: [],
  adapters: {
    active: [],
  },
  context_config: {
    auto_update: false,
    snapshot_on_branch: false,
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

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.ai-guardian', 'config.yaml');
}

function getProjectConfigPath(projectDir: string): string {
  return path.join(projectDir, '.ai-guardian.yaml');
}

function loadYamlFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(content) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function loadConfig(projectDir: string): GuardianConfig {
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Record<string, unknown>;

  // Load global config
  const globalConfigPath = getGlobalConfigPath();
  const globalConfig = loadYamlFile(globalConfigPath);
  if (globalConfig) {
    logger.debug(`Loaded global config from ${globalConfigPath}`);
    config = deepMerge(config, globalConfig);
  }

  // Load project config and merge
  const projectConfigPath = getProjectConfigPath(projectDir);
  const projectConfig = loadYamlFile(projectConfigPath);
  if (projectConfig) {
    logger.debug(`Loaded project config from ${projectConfigPath}`);
    config = deepMerge(config, projectConfig);
  }

  // Fallback to environment variable for API key
  const result = config as unknown as GuardianConfig;
  if (!result.api.anthropic_api_key) {
    result.api.anthropic_api_key = process.env.ANTHROPIC_API_KEY || '';
  }

  return result;
}

export function getProjectDir(): string {
  return process.cwd();
}
