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

  // NOTE: Session start sync is handled via CLAUDE.md instructions
  // (PreSession is not a valid Claude Code hook event)
  // See generateClaudeMd() in rules.ts for the instruction approach

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
