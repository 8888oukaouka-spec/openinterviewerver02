// AI Provider Factory
// Returns the appropriate provider based on study or environment configuration

import { AIProvider } from '../ai';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { StudyConfig } from '@/types';
import { isHostedMode } from '../mode';

export type ProviderType = 'gemini' | 'claude';

// Optional per-request API keys (for hosted/BYOK mode)
export interface AIProviderKeys {
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
}

// Get the interview AI provider based on configuration
// Provider priority: studyConfig.aiProvider > env.AI_PROVIDER > 'gemini'
// Model priority: studyConfig.aiModel > env.GEMINI_MODEL/CLAUDE_MODEL > env.AI_MODEL > default
// In hosted mode, pass keys from ResearcherContext; in standalone, keys are null and env vars are used
export function getInterviewProvider(studyConfig?: StudyConfig, keys?: AIProviderKeys): AIProvider {
  const providerType = (
    studyConfig?.aiProvider ||          // Study-level preference
    process.env.AI_PROVIDER ||          // Environment fallback
    'gemini'                            // Ultimate default
  ) as ProviderType;

  // Pass model from studyConfig (if set) to provider constructor
  const model = studyConfig?.aiModel;

  // In hosted mode, use ONLY researcher-provided keys (no env var fallback)
  // Pass a special sentinel ('') to prevent providers from falling back to env vars
  const hosted = isHostedMode();

  switch (providerType) {
    case 'claude': {
      const key = hosted ? (keys?.anthropicApiKey || '') : (keys?.anthropicApiKey ?? undefined);
      return new ClaudeProvider(model, key);
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
