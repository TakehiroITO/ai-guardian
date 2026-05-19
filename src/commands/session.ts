import { loadConfig, getProjectDir } from '../core/config';
import {
  startSession,
  startTask,
  completeEntry,
  runDiagnostics,
  getStatus,
  formatDiagnostics,
  formatStatus,
} from '../core/session';
import { syncContext } from '../core/context';
import { logger } from '../utils/logger';

export interface SessionCommandOptions {
  task?: string;
  type?: 'session' | 'task';
  json?: boolean;
  skipVerify?: boolean;
  skipSync?: boolean;
}

export async function sessionCommand(
  subcommand: string,
  options: SessionCommandOptions
): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  if (config.session && config.session.enabled === false) {
    logger.warn('session is disabled in configuration (session.enabled = false)');
    return;
  }

  switch (subcommand) {
    case 'start': {
      if (options.task) {
        const id = startTask(projectDir, config, options.task);
        logger.info(`Task started: "${options.task}" [id=${id}]`);
      } else {
        const id = startSession(projectDir, config);
        logger.info(`Session started [id=${id}]`);
      }
      break;
    }
    case 'complete': {
      const target = completeEntry(projectDir, config, options.type);
      if (!target) {
        logger.warn('No matching unclosed entry to complete.');
        return;
      }
      const label = target.task ? `task "${target.task}"` : 'session';
      logger.info(`Completed: ${target.type} (${label}) [id=${target.id}]`);
      break;
    }
    case 'check': {
      if (!options.skipSync) {
        try {
          syncContext(projectDir);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`context sync skipped: ${msg}`);
        }
      }
      const result = runDiagnostics(projectDir, config, { skipVerify: options.skipVerify });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatDiagnostics(result));
      }
      break;
    }
    case 'status': {
      const status = getStatus(projectDir, config);
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(formatStatus(status));
      }
      break;
    }
    default:
      logger.error(`Unknown subcommand: ${subcommand}. Use start, complete, check, or status.`);
      process.exit(1);
  }
}
