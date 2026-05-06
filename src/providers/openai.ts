import axios from 'axios';
import { LLMProvider, LLMChatOptions } from './provider';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY or configure in ~/.ai-guardian/config.yaml');
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.userMessage },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      },
    );

    return response.data.choices[0]?.message?.content || '';
  }
}
