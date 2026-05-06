import * as chokidar from 'chokidar';
import * as path from 'path';
import { loadConfig, getProjectDir, GuardianConfig } from '../core/config';
import {
  checkExistingProcess,
  writePidFile,
  removePidFile,
  updateLastActive,
  getLastActive,
  removeLastActiveFile,
  readPidFile,
  isProcessRunning,
  getPidFilePath,
} from '../utils/pid';
import { HooksEngine } from '../core/hooks';
import { notify } from './notify';
import { logger } from '../utils/logger';

let watcher: chokidar.FSWatcher | null = null;
let timeoutTimer: NodeJS.Timeout | null = null;

function getWatchPaths(projectDir: string, config: GuardianConfig): string[] {
  const paths: string[] = [];

  // Watch .ai/ directory
  paths.push(path.join(projectDir, '.ai', '**', '*.md'));

  // Watch paths from hooks matchers
  for (const hook of (config.hooks || [])) {
    if (hook.matcher?.paths) {
      for (const p of hook.matcher.paths) {
        const hookPath = path.join(projectDir, p);
        if (!paths.includes(hookPath)) {
          paths.push(hookPath);
        }
      }
    }
  }

  // Watch trigger files from legacy rules
  for (const rule of config.rules) {
    const triggerPath = path.join(projectDir, '.ai', rule.trigger);
    if (!paths.includes(triggerPath)) {
      paths.push(triggerPath);
    }
  }

  return paths;
}

function resetTimeoutTimer(projectDir: string, config: GuardianConfig): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }

  const timeoutMs = config.watch.timeout_minutes * 60 * 1000;
  timeoutTimer = setTimeout(async () => {
    logger.warn(`Watch timed out after ${config.watch.timeout_minutes} minutes of inactivity.`);
    await notify(config, {
      level: 'warning',
      event: 'timeout',
      message: `ai-guardian watch timed out after ${config.watch.timeout_minutes} minutes of inactivity.`,
    });
    await stopWatch(projectDir);
  }, timeoutMs);
}

async function startWatch(projectDir: string): Promise<void> {
  const config = loadConfig(projectDir);

  // Check for existing process
  const existingPid = checkExistingProcess(projectDir);
  if (existingPid !== null) {
    logger.error(`Watch is already running (PID: ${existingPid}). Use 'ai-guardian watch stop' first.`);
    process.exit(1);
  }

  // Write PID file
  writePidFile(projectDir, process.pid);
  updateLastActive(projectDir);
  logger.info(`Watch started (PID: ${process.pid})`);
  logger.info(`PID file: ${getPidFilePath(projectDir)}`);

  // Set up file watcher
  const watchPaths = getWatchPaths(projectDir, config);
  logger.info(`Watching: ${watchPaths.join(', ')}`);

  const hooksEngine = new HooksEngine(config, projectDir);
  let debounceTimer: NodeJS.Timeout | null = null;

  watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: config.watch.debounce_ms,
      pollInterval: 100,
    },
  });

  watcher.on('change', (filePath: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      logger.info(`File changed: ${filePath}`);
      updateLastActive(projectDir);
      resetTimeoutTimer(projectDir, config);

      // Fire hooks for file_change event
      const relativePath = path.relative(projectDir, filePath);
      const results = await hooksEngine.fire({ type: 'file_change', file: relativePath });
      for (const result of results) {
        if (result.fired) {
          logger.info(`Hook fired: ${result.hookName}${result.error ? ` (error: ${result.error})` : ''}`);
        }
      }
    }, config.watch.debounce_ms);
  });

  watcher.on('error', (error: Error) => {
    logger.error(`Watcher error: ${error.message}`);
  });

  // Set up timeout timer
  resetTimeoutTimer(projectDir, config);

  // Handle graceful shutdown
  const shutdown = async () => {
    await stopWatch(projectDir);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Watch is running. Press Ctrl+C to stop.');
}

async function stopWatch(projectDir: string): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }

  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }

  removePidFile(projectDir);
  removeLastActiveFile(projectDir);
  logger.info('Watch stopped.');
}

function stopWatchExternal(projectDir: string): void {
  const existingPid = readPidFile(projectDir);
  if (existingPid === null) {
    logger.info('No watch process is running.');
    return;
  }

  if (!isProcessRunning(existingPid)) {
    logger.warn(`Watch process (PID: ${existingPid}) is not running. Cleaning up stale PID file.`);
    removePidFile(projectDir);
    removeLastActiveFile(projectDir);
    return;
  }

  try {
    process.kill(existingPid, 'SIGTERM');
    logger.info(`Sent SIGTERM to watch process (PID: ${existingPid}).`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to stop watch process: ${msg}`);
  }
}

function showStatus(projectDir: string): void {
  const existingPid = readPidFile(projectDir);

  if (existingPid === null) {
    logger.info('Watch is not running.');
    return;
  }

  if (!isProcessRunning(existingPid)) {
    logger.warn(`PID file exists (PID: ${existingPid}) but process is not running.`);
    return;
  }

  logger.info(`Watch is running (PID: ${existingPid}).`);
  const lastActive = getLastActive(projectDir);
  if (lastActive) {
    logger.info(`Last active: ${lastActive.toISOString()}`);
  }
}

export async function watchCommand(subcommand: string): Promise<void> {
  const projectDir = getProjectDir();

  switch (subcommand) {
    case 'start':
      await startWatch(projectDir);
      break;
    case 'stop':
      stopWatchExternal(projectDir);
      break;
    case 'status':
      showStatus(projectDir);
      break;
    default:
      logger.error(`Unknown subcommand: ${subcommand}. Use start, stop, or status.`);
      process.exit(1);
  }
}
