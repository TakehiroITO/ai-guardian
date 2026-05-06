import * as fs from 'fs';
import * as crypto from 'crypto';
import { logger } from './logger';

function getProjectHash(projectDir: string): string {
  return crypto.createHash('md5').update(projectDir).digest('hex').substring(0, 12);
}

export function getPidFilePath(projectDir: string): string {
  const hash = getProjectHash(projectDir);
  return `/tmp/ai-guardian-${hash}.pid`;
}

export function getLastActiveFilePath(projectDir: string): string {
  const hash = getProjectHash(projectDir);
  return `/tmp/ai-guardian-${hash}.lastactive`;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPidFile(projectDir: string): number | null {
  const pidFile = getPidFilePath(projectDir);
  try {
    const content = fs.readFileSync(pidFile, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function writePidFile(projectDir: string, pid: number): void {
  const pidFile = getPidFilePath(projectDir);
  fs.writeFileSync(pidFile, String(pid), 'utf-8');
}

export function removePidFile(projectDir: string): void {
  const pidFile = getPidFilePath(projectDir);
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // ignore if already removed
  }
}

export function updateLastActive(projectDir: string): void {
  const lastActiveFile = getLastActiveFilePath(projectDir);
  fs.writeFileSync(lastActiveFile, new Date().toISOString(), 'utf-8');
}

export function getLastActive(projectDir: string): Date | null {
  const lastActiveFile = getLastActiveFilePath(projectDir);
  try {
    const content = fs.readFileSync(lastActiveFile, 'utf-8').trim();
    const date = new Date(content);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function removeLastActiveFile(projectDir: string): void {
  const lastActiveFile = getLastActiveFilePath(projectDir);
  try {
    fs.unlinkSync(lastActiveFile);
  } catch {
    // ignore if already removed
  }
}

/**
 * Check if another instance is already running for this project.
 * Returns the PID if running, null otherwise.
 * Cleans up stale PID files.
 */
export function checkExistingProcess(projectDir: string): number | null {
  const existingPid = readPidFile(projectDir);
  if (existingPid === null) return null;

  if (isProcessRunning(existingPid)) {
    return existingPid;
  }

  // Stale PID file - process is not running
  logger.warn(`Stale PID file found (PID: ${existingPid}). Previous process may have terminated abnormally.`);
  removePidFile(projectDir);
  removeLastActiveFile(projectDir);
  return null;
}
