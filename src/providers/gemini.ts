import axios from 'axios';
import { LLMProvider, LLMChatOptions } from './provider';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Google API key not configured. Set GOOGLE_API_KEY or configure in ~/.ai-guardian/config.yaml');
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${this.apiKey}`,
      {
        system_instruction: {
          parts: [{ text: options.system }],
        },
        contents: [
          {
            parts: [{ text: options.userMessage }],
          },
        ],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4096,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}
