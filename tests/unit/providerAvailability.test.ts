import { describe, expect, it } from 'vitest';
import { missingProviderCredential } from '@/lib/providerAvailability';
import { makeStudyConfig } from '../fixtures/models';

const context = {
  geminiApiKey: 'gemini-key',
  anthropicApiKey: null,
  openaiApiKey: 'openai-key',
  openrouterApiKey: null,
};

describe('provider credential availability', () => {
  it('matches the canonical study provider to its request-scoped key', () => {
    expect(missingProviderCredential(
      context,
      makeStudyConfig({ aiProvider: 'openai', aiModel: 'gpt-5.6-terra' }),
    )).toBeNull();
    expect(missingProviderCredential(
      context,
      makeStudyConfig({ aiProvider: 'openrouter', aiModel: 'openai/gpt-5.6-terra' }),
    )).toBe('openrouter');
  });
});
