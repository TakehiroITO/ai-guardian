import { loadConfig, getProjectDir, GuardianConfig } from '../core/config';
import { sendMacOSNotification } from '../notifications/macos';
import { sendSlackNotification } from '../notifications/slack';
import { logger } from '../utils/logger';

export type NotifyLevel = 'info' | 'warning' | 'critical';
export type NotifyEvent = 'timeout' | 'deploy_complete' | 'deploy_failed' | 'review_complete';

export interface NotifyOptions {
  level: NotifyLevel;
  event: NotifyEvent;
  message: string;
  channel?: string;
}

export async function notify(config: GuardianConfig, options: NotifyOptions): Promise<void> {
  const title = `ai-guardian [${options.level.toUpperCase()}]`;
  const body = `${options.event}: ${options.message}`;

  // macOS notification
  if (config.notifications.os) {
    sendMacOSNotification(title, body);
  }

  // Slack notification
  if (config.notifications.slack.enabled) {
    const channel = options.channel || config.notifications.slack.default_channel;
    await sendSlackNotification(config.notifications.slack.webhook_url, {
      channel,
      text: `*${title}*\n${body}`,
    });
  }
}

export async function notifyCommand(options: NotifyOptions): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  await notify(config, options);
  logger.info(`Notification sent: [${options.level}] ${options.event} - ${options.message}`);
}
