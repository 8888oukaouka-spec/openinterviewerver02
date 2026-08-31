// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { getGeminiInteractionThinkingLevel } from '@/lib/providers/gemini';

describe('Gemini interaction thinking level', () => {
  it('leaves the provider default when enableReasoning is undefined', () => {
    expect(getGeminiInteractionThinkingLevel()).toBeUndefined();
    expect(getGeminiInteractionThinkingLevel(undefined)).toBeUndefined();
  });

  it('maps enableReasoning=true to high and false to low', () => {
    expect(getGeminiInteractionThinkingLevel(true)).toBe('high');
    expect(getGeminiInteractionThinkingLevel(false)).toBe('low');
  });
});
