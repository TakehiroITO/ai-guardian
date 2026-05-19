import { GuardianConfig } from '../../../core/config';

interface ClaudeHook {
  type: string;
  matcher?: string;
  hooks: Array<{
    command: string;
    description?: string;
  }>;
}

export function generateHooksConfig(config: GuardianConfig, _projectDir: string): Record<string, ClaudeHook[]> {
  const claudeHooks: Record<string, ClaudeHook[]> = {};

  // Session lifecycle hooks (LLM-independent session tracking)
  const sessionEnabled = config.session?.enabled !== false;
  if (sessionEnabled) {
    claudeHooks['SessionStart'] = [
      {
        type: 'command',
        hooks: [
          {
            command: 'ai-guardian session check',
            description: 'Run session diagnostics (crash detection + context sync + verify)',
          },
        ],
      },
    ];
    claudeHooks['SessionEnd'] = [
      {
        type: 'command',
        hooks: [
          {
            command: 'ai-guardian session complete --type session',
            description: 'Mark the current session as completed cleanly',
          },
        ],
      },
    ];
  }

  // Generate hooks from ai-guardian hook configs
  const guardianHooks = config.hooks || [];
  const fileChangeHooks = guardianHooks.filter((h) => h.event === 'file_change');

  if (fileChangeHooks.length > 0) {
    claudeHooks['PostToolUse'] = [
      {
        type: 'command',
        matcher: 'write|edit',
        hooks: [
          {
            command: 'ai-guardian watch start --background 2>/dev/null || true',
            description: 'Ensure ai-guardian watch is running after file edits',
          },
        ],
      },
    ];
  }

  return claudeHooks;
}
