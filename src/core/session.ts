import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { GuardianConfig } from './config';

export type SessionEntryType =
  | 'session_start'
  | 'session_complete'
  | 'task_start'
  | 'task_complete';

export interface SessionEntry {
  type: SessionEntryType;
  id: string;
  at: string;
  task?: string;
  refId?: string;
}

export interface UnclosedEntry {
  type: 'session_start' | 'task_start';
  id: string;
  at: string;
  task?: string;
}

export interface DiagnosticsResult {
  currentContext: string | null;
  unclosed: UnclosedEntry[];
  crashSuspected: boolean;
  gitStatus: string;
  verifyCommand: string | null;
  verifyOk: boolean | null;
  verifyOutput: string | null;
  newSessionId: string;
}

export interface StatusResult {
  unclosed: UnclosedEntry[];
  totalEntries: number;
}

function resolveLogPath(projectDir: string, config: GuardianConfig): string {
  const logFile = config.session?.log_file || '.ai/.session.log';
  return path.isAbsolute(logFile) ? logFile : path.join(projectDir, logFile);
}

function readEntries(logPath: string): SessionEntry[] {
  if (!fs.existsSync(logPath)) return [];
  const raw = fs.readFileSync(logPath, 'utf-8');
  const entries: SessionEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as SessionEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function appendEntry(logPath: string, entry: SessionEntry): void {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}

export function findUnclosed(entries: SessionEntry[]): UnclosedEntry[] {
  const closedIds = new Set<string>();
  for (const e of entries) {
    if ((e.type === 'session_complete' || e.type === 'task_complete') && e.refId) {
      closedIds.add(e.refId);
    }
  }
  const unclosed: UnclosedEntry[] = [];
  for (const e of entries) {
    if ((e.type === 'session_start' || e.type === 'task_start') && !closedIds.has(e.id)) {
      unclosed.push({ type: e.type, id: e.id, at: e.at, task: e.task });
    }
  }
  return unclosed;
}

export function startSession(projectDir: string, config: GuardianConfig): string {
  const id = uuidv4();
  appendEntry(resolveLogPath(projectDir, config), {
    type: 'session_start',
    id,
    at: new Date().toISOString(),
  });
  return id;
}

export function startTask(projectDir: string, config: GuardianConfig, task: string): string {
  const id = uuidv4();
  appendEntry(resolveLogPath(projectDir, config), {
    type: 'task_start',
    id,
    at: new Date().toISOString(),
    task,
  });
  return id;
}

export function completeEntry(
  projectDir: string,
  config: GuardianConfig,
  filter?: 'session' | 'task'
): UnclosedEntry | null {
  const logPath = resolveLogPath(projectDir, config);
  const entries = readEntries(logPath);
  const unclosed = findUnclosed(entries);

  let target: UnclosedEntry | undefined;
  if (filter === 'session') {
    target = [...unclosed].reverse().find((u) => u.type === 'session_start');
  } else if (filter === 'task') {
    target = [...unclosed].reverse().find((u) => u.type === 'task_start');
  } else {
    target = unclosed[unclosed.length - 1];
  }

  if (!target) return null;

  const completeType: SessionEntryType =
    target.type === 'session_start' ? 'session_complete' : 'task_complete';
  appendEntry(logPath, {
    type: completeType,
    id: uuidv4(),
    at: new Date().toISOString(),
    refId: target.id,
  });
  return target;
}

export function detectVerifyCommand(projectDir: string): string | null {
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
      if (pkg.scripts?.build) {
        return 'npm run build';
      }
    } catch {
      // fall through
    }
  }
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
    return 'cargo build';
  }
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
    return 'go build ./...';
  }
  return null;
}

function readCurrentContext(projectDir: string): string | null {
  const p = path.join(projectDir, '.ai/CURRENT_CONTEXT.md');
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function runGitStatus(projectDir: string): string {
  try {
    return execSync('git status --short', { cwd: projectDir, encoding: 'utf-8' }).toString();
  } catch {
    return '(git not available or not a git repository)';
  }
}

function runVerify(projectDir: string, cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    return { ok: true, output: output.slice(-2000) };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    return { ok: false, output: (stdout + stderr).slice(-2000) };
  }
}

export interface CheckOptions {
  skipVerify?: boolean;
}

export function runDiagnostics(
  projectDir: string,
  config: GuardianConfig,
  options: CheckOptions = {}
): DiagnosticsResult {
  const logPath = resolveLogPath(projectDir, config);
  const entries = readEntries(logPath);
  const unclosed = findUnclosed(entries);

  const currentContext = readCurrentContext(projectDir);
  const gitStatus = runGitStatus(projectDir);

  let verifyCommand: string | null = null;
  let verifyOk: boolean | null = null;
  let verifyOutput: string | null = null;

  if (!options.skipVerify) {
    verifyCommand = config.session?.verify_command || detectVerifyCommand(projectDir);
    if (verifyCommand) {
      const result = runVerify(projectDir, verifyCommand);
      verifyOk = result.ok;
      verifyOutput = result.output;
    }
  }

  const newSessionId = uuidv4();
  appendEntry(logPath, {
    type: 'session_start',
    id: newSessionId,
    at: new Date().toISOString(),
  });

  return {
    currentContext,
    unclosed,
    crashSuspected: unclosed.length > 0,
    gitStatus,
    verifyCommand,
    verifyOk,
    verifyOutput,
    newSessionId,
  };
}

export function getStatus(projectDir: string, config: GuardianConfig): StatusResult {
  const entries = readEntries(resolveLogPath(projectDir, config));
  return {
    unclosed: findUnclosed(entries),
    totalEntries: entries.length,
  };
}

export function formatDiagnostics(d: DiagnosticsResult): string {
  const lines: string[] = [];
  lines.push('=== ai-guardian session check ===');
  lines.push('');

  if (d.crashSuspected) {
    lines.push(`[WARN] CRASH SUSPECTED: ${d.unclosed.length} unclosed entry/entries from previous session(s)`);
    for (const u of d.unclosed) {
      const label = u.task ? `task "${u.task}"` : 'session';
      lines.push(`   - ${u.type} (${label}) started at ${u.at}, no completion recorded`);
    }
    lines.push('   -> Code may be in an inconsistent state. Review git status and verify output below.');
    lines.push('');
  } else {
    lines.push('[OK] No unclosed sessions/tasks. Previous session completed cleanly.');
    lines.push('');
  }

  lines.push('--- git status ---');
  lines.push(d.gitStatus.trim() || '(clean)');
  lines.push('');

  if (d.verifyCommand) {
    lines.push(`--- verify: ${d.verifyCommand} ---`);
    lines.push(d.verifyOk ? '[OK] verify passed' : '[FAIL] verify FAILED');
    if (d.verifyOutput) {
      lines.push(d.verifyOutput.trim());
    }
    lines.push('');
  } else {
    lines.push('--- verify: skipped (no verify_command configured or detected) ---');
    lines.push('');
  }

  if (d.currentContext) {
    lines.push('--- .ai/CURRENT_CONTEXT.md ---');
    lines.push(d.currentContext.trim());
    lines.push('');
  } else {
    lines.push('(no .ai/CURRENT_CONTEXT.md found)');
    lines.push('');
  }

  lines.push(`New session started: ${d.newSessionId}`);
  return lines.join('\n');
}

export function formatStatus(s: StatusResult): string {
  if (s.unclosed.length === 0) {
    return `No unclosed entries (${s.totalEntries} total entries in log).`;
  }
  const lines = [`${s.unclosed.length} unclosed entry/entries:`];
  for (const u of s.unclosed) {
    const label = u.task ? `task "${u.task}"` : 'session';
    lines.push(`  - ${u.type} (${label}) at ${u.at} [id=${u.id}]`);
  }
  return lines.join('\n');
}
