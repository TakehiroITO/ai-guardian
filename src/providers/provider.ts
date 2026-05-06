import { GuardianConfig } from '../core/config';

export interface LLMChatOptions {
  system: string;
  userMessage: string;
  model: string;
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  chat(options: LLMChatOptions): Promise<string>;
}

export function getProvider(name: string, config: GuardianConfig): LLMProvider {
  // Lazy imports to avoid circular dependencies
  switch (name) {
    case 'anthropic':
    case 'claude': {
      const { AnthropicProvider } = require('./anthropic');
      const apiKey = config.agents.available?.claude?.api_key
        || config.api.anthropic_api_key
        || process.env.ANTHROPIC_API_KEY
        || '';
      return new AnthropicProvider(apiKey);
    }
    case 'openai':
    case 'gpt': {
      const { OpenAIProvider } = require('./openai');
      const apiKey = config.agents.available?.gpt?.api_key
        || process.env.OPENAI_API_KEY
        || '';
      return new OpenAIProvider(apiKey);
    }
    case 'gemini':
    case 'google': {
      const { GeminiProvider } = require('./gemini');
      const apiKey = config.agents.available?.gemini?.api_key
        || process.env.GOOGLE_API_KEY
        || '';
      return new GeminiProvider(apiKey);
    }
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}
