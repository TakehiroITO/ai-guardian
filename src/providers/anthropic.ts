import axios from 'axios';
import { LLMProvider, LLMChatOptions } from './provider';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY or configure in ~/.ai-guardian/config.yaml');
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        system: options.system,
        messages: [{ role: 'user', content: options.userMessage }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
    );

    return response.data.content[0]?.text || '';
  }
}
