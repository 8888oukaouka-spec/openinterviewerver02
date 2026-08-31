// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_SYNTHESIS_MODEL,
  GEMINI_SYNTHESIS_MODEL,
  OPENAI_SYNTHESIS_MODEL,
  OPENROUTER_SYNTHESIS_MODEL,
} from '@/types';
import {
  resolveProviderType,
  resolveSynthesisModel,
} from '@/lib/providers';
import { makeStudyConfig } from '../fixtures/models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('synthesis provenance resolution', () => {
  it('resolves Gemini studies to the Gemini synthesis model', () => {
    const provider = resolveProviderType(makeStudyConfig({ aiProvider: 'gemini' }));

    expect(provider).toBe('gemini');
    expect(resolveSynthesisModel(provider)).toBe(GEMINI_SYNTHESIS_MODEL);
  });

  it('resolves Claude studies to the Claude synthesis model', () => {
    const provider = resolveProviderType(makeStudyConfig({ aiProvider: 'claude' }));

    expect(provider).toBe('claude');
    expect(resolveSynthesisModel(provider)).toBe(CLAUDE_SYNTHESIS_MODEL);
  });

  it('resolves OpenAI studies to the OpenAI synthesis model', () => {
    const provider = resolveProviderType(makeStudyConfig({ aiProvider: 'openai' }));

    expect(provider).toBe('openai');
    expect(resolveSynthesisModel(provider)).toBe(OPENAI_SYNTHESIS_MODEL);
  });

  it('resolves OpenRouter studies to the OpenRouter synthesis model', () => {
    const provider = resolveProviderType(makeStudyConfig({ aiProvider: 'openrouter' }));

    expect(provider).toBe('openrouter');
    expect(resolveSynthesisModel(provider)).toBe(OPENROUTER_SYNTHESIS_MODEL);
  });

  it('fails closed when a canonical study omits its provider', () => {
    vi.stubEnv('AI_PROVIDER', 'not-a-provider');
    const config = makeStudyConfig();
    delete config.aiProvider;

    expect(() => resolveProviderType(config)).toThrow('Canonical study is missing an explicit AI provider');
  });

  it('uses the deployment default only when no study is being resolved', () => {
    const provider = resolveProviderType();

    expect(provider).toBe('gemini');
    expect(resolveSynthesisModel(provider)).toBe(GEMINI_SYNTHESIS_MODEL);
  });
});
