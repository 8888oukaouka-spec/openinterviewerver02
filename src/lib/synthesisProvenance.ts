import type { AIProviderType } from '@/types';
import type { SynthesisProvenance } from './synthesisReceipt';

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set<AIProviderType>([
  'gemini',
  'claude',
  'openai',
  'openrouter',
]);

export function validateProvenance(input: {
  aiProvider: string;
  aiModel: string;
  requestedAiModel: string;
  routedProvider?: string;
}): SynthesisProvenance | null {
  if (!KNOWN_PROVIDERS.has(input.aiProvider)) return null;
  if (!input.aiModel) return null;
  if (!input.requestedAiModel) return null;
  return {
    aiProvider: input.aiProvider as AIProviderType,
    aiModel: input.aiModel,
    requestedAiModel: input.requestedAiModel,
    ...(input.routedProvider !== undefined ? { routedProvider: input.routedProvider } : {}),
  };
}
