import { loadConfig, getProjectDir } from '../core/config';
import { getAdapter, getActiveAdapters } from '../adapters/adapter';
import { logger } from '../utils/logger';

export async function syncCommand(options: { agent?: string }): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  if (options.agent) {
    // Sync specific adapter
    try {
      const adapter = getAdapter(options.agent);
      const result = adapter.sync(config, projectDir);
      const total = result.created.length + result.updated.length;
      if (total > 0) {
        logger.info(`Synced ${options.agent}: ${result.created.length} created, ${result.updated.length} updated.`);
      } else {
        logger.info(`${options.agent}: already up to date.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Sync failed for ${options.agent}: ${msg}`);
      process.exit(1);
    }
  } else {
    // Sync all active adapters
    const adapters = getActiveAdapters(config);
    if (adapters.length === 0) {
      logger.info('No active adapters configured. Use --agent <llm> or set adapters.active in config.');
      return;
    }

    for (const adapter of adapters) {
      try {
        const result = adapter.sync(config, projectDir);
        const total = result.created.length + result.updated.length;
        logger.info(`Synced ${adapter.name}: ${result.created.length} created, ${result.updated.length} updated.`);
        if (total === 0) {
          logger.info(`  ${adapter.name}: already up to date.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Sync failed for ${adapter.name}: ${msg}`);
      }
    }
  }
}
