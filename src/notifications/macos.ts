import { execFile } from 'child_process';
import { logger } from '../utils/logger';

export function sendMacOSNotification(title: string, message: string): void {
  const script = `display notification "${message}" with title "${title}"`;

  execFile('osascript', ['-e', script], (error) => {
    if (error) {
      logger.debug(`macOS notification failed: ${error.message}`);
    }
  });
}
