// AI Provider Factory
// Returns the appropriate provider based on study or environment configuration
import { AIProvider } from '../ai';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { StudyConfig } from '@/types';
import { isHostedMode } from '../mode';

export type ProviderType = 'gemini' | 'claude' | 'openai';

// Optional per-request API keys (for hosted/BYOK mode)
export interface AIProviderKeys {
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
}

// Get the interview AI provider based on configuration
export function getInterviewProvider(studyConfig?: StudyConfig, keys?: AIProviderKeys): AIProvider {
  const providerType = (
    studyConfig?.aiProvider ||
    process.env.AI_PROVIDER ||
    'gemini'
  ) as ProviderType;

  const model = studyConfig?.aiModel;
  const hosted = isHostedMode();

  switch (providerType) {
    case 'claude': {
      const key = hosted ? (keys?.anthropicApiKey || '') : (keys?.anthropicApiKey ?? undefined);
      return new ClaudeProvider(model, key);
    }
    case 'openai': {
      const key = hosted ? (keys?.openaiApiKey || '') : (keys?.openaiApiKey ?? undefined);
      return new OpenAIProvider(model, key);
    }
    case 'gemini':
    default: {
      const key = hosted ? (keys?.geminiApiKey || '') : (keys?.geminiApiKey ?? undefined);
      return new GeminiProvider(model, key);
    }
  }
}

export { GeminiProvider } from './gemini';
export { ClaudeProvider } from './claude';
export { OpenAIProvider } from './openai';
