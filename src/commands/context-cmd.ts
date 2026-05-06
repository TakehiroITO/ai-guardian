import { loadConfig, getProjectDir } from '../core/config';
import { syncContext, diffContext, snapshotContext, compressContext } from '../core/context';
import { logger } from '../utils/logger';

export async function contextCommand(subcommand: string, options: { label?: string }): Promise<void> {
  const projectDir = getProjectDir();

  switch (subcommand) {
    case 'sync':
      syncContext(projectDir);
      break;
    case 'diff': {
      const diff = diffContext(projectDir);
      console.log(diff);
      break;
    }
    case 'snapshot': {
      const label = snapshotContext(projectDir, options.label);
      logger.info(`Snapshot created: ${label}`);
      break;
    }
    case 'compress': {
      const config = loadConfig(projectDir);
      await compressContext(projectDir, config);
      break;
    }
    default:
      logger.error(`Unknown subcommand: ${subcommand}. Use sync, diff, snapshot, or compress.`);
      process.exit(1);
  }
}
