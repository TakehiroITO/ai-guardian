import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  startSession,
  startTask,
  completeEntry,
  getStatus,
  runDiagnostics,
  detectVerifyCommand,
  findUnclosed,
} from '../src/core/session';
import { GuardianConfig } from '../src/core/config';

function makeConfig(overrides: Partial<GuardianConfig> = {}): GuardianConfig {
  return {
    api: { anthropic_api_key: '', model: 'claude-opus-4-6' },
    response_style: { enabled: false, prompt_file: '' },
    session: { enabled: true, log_file: '.ai/.session.log', verify_command: '', check_on_start: true },
    watch: { timeout_minutes: 120, debounce_ms: 1000 },
    notifications: { os: false, slack: { enabled: false, webhook_url: '', default_channel: '#dev' } },
    agents: { default: ['claude'], available: {} },
    conductor: { enabled: false, endpoint: '', api_key: '' },
    rules: [],
    hooks: [],
    reviewers: {},
    ...overrides,
  };
}

describe('core/session', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-session-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('startSession appends a session_start entry', () => {
    const config = makeConfig();
    const id = startSession(tmpDir, config);
    expect(id).toBeTruthy();

    const logPath = path.join(tmpDir, '.ai/.session.log');
    expect(fs.existsSync(logPath)).toBe(true);
    const line = fs.readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(line);
    expect(entry.type).toBe('session_start');
    expect(entry.id).toBe(id);
  });

  it('startTask appends a task_start entry with description', () => {
    const config = makeConfig();
    const id = startTask(tmpDir, config, 'implement feature X');
    const logPath = path.join(tmpDir, '.ai/.session.log');
    const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim());
    expect(entry.type).toBe('task_start');
    expect(entry.task).toBe('implement feature X');
    expect(entry.id).toBe(id);
  });

  it('completeEntry (LIFO) closes the most recent unclosed entry', () => {
    const config = makeConfig();
    const sessionId = startSession(tmpDir, config);
    const taskId = startTask(tmpDir, config, 'work');

    const closed = completeEntry(tmpDir, config);
    expect(closed).not.toBeNull();
    expect(closed!.id).toBe(taskId);

    const status = getStatus(tmpDir, config);
    expect(status.unclosed).toHaveLength(1);
    expect(status.unclosed[0].id).toBe(sessionId);
  });

  it('completeEntry with filter=session closes session even when task is open', () => {
    const config = makeConfig();
    const sessionId = startSession(tmpDir, config);
    startTask(tmpDir, config, 'work');

    const closed = completeEntry(tmpDir, config, 'session');
    expect(closed).not.toBeNull();
    expect(closed!.id).toBe(sessionId);

    const unclosed = getStatus(tmpDir, config).unclosed;
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0].type).toBe('task_start');
  });

  it('completeEntry returns null when nothing is open', () => {
    const config = makeConfig();
    expect(completeEntry(tmpDir, config)).toBeNull();
  });

  it('findUnclosed detects crash (start with no matching complete)', () => {
    const config = makeConfig();
    startSession(tmpDir, config);
    startTask(tmpDir, config, 'A');
    completeEntry(tmpDir, config, 'task');
    startTask(tmpDir, config, 'B'); // simulate crash: never completed

    const status = getStatus(tmpDir, config);
    // session + task B = 2 unclosed
    expect(status.unclosed).toHaveLength(2);
    const taskB = status.unclosed.find((u) => u.task === 'B');
    expect(taskB).toBeTruthy();
  });

  it('findUnclosed returns empty when entries are empty', () => {
    expect(findUnclosed([])).toEqual([]);
  });

  it('runDiagnostics flags crashSuspected and starts new session', () => {
    const config = makeConfig({
      session: { enabled: true, log_file: '.ai/.session.log', verify_command: '', check_on_start: true },
    });
    startSession(tmpDir, config);
    startTask(tmpDir, config, 'unfinished'); // not completed

    const result = runDiagnostics(tmpDir, config, { skipVerify: true });
    expect(result.crashSuspected).toBe(true);
    expect(result.unclosed.length).toBeGreaterThanOrEqual(2);
    expect(result.newSessionId).toBeTruthy();

    // After diagnostics, a new session_start is logged
    const status = getStatus(tmpDir, config);
    const newSessionUnclosed = status.unclosed.find((u) => u.id === result.newSessionId);
    expect(newSessionUnclosed).toBeTruthy();
  });

  it('runDiagnostics reports clean when no unclosed entries', () => {
    const config = makeConfig();
    startSession(tmpDir, config);
    completeEntry(tmpDir, config, 'session');

    const result = runDiagnostics(tmpDir, config, { skipVerify: true });
    expect(result.crashSuspected).toBe(false);
    expect(result.unclosed).toHaveLength(0);
  });

  it('detectVerifyCommand finds npm build from package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc' } })
    );
    expect(detectVerifyCommand(tmpDir)).toBe('npm run build');
  });

  it('detectVerifyCommand finds cargo from Cargo.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "x"\n');
    expect(detectVerifyCommand(tmpDir)).toBe('cargo build');
  });

  it('detectVerifyCommand finds go from go.mod', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module x\n');
    expect(detectVerifyCommand(tmpDir)).toBe('go build ./...');
  });

  it('detectVerifyCommand returns null when nothing recognized', () => {
    expect(detectVerifyCommand(tmpDir)).toBeNull();
  });
});
