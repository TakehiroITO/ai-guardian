import axios from 'axios';
import { logger } from '../utils/logger';

export interface SlackMessage {
  channel?: string;
  text: string;
}

export async function sendSlackNotification(
  webhookUrl: string,
  message: SlackMessage,
): Promise<boolean> {
  if (!webhookUrl) {
    logger.debug('Slack webhook URL not configured, skipping notification.');
    return false;
  }

  try {
    await axios.post(webhookUrl, {
      channel: message.channel,
      text: message.text,
    });
    logger.debug('Slack notification sent.');
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send Slack notification: ${msg}`);
    return false;
  }
}
