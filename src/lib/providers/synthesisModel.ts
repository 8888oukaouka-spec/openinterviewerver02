import type { AIProviderType } from '@/types';
import { SYNTHESIS_MODEL_BY_PROVIDER } from '../providerRegistry';

export type ProviderType = AIProviderType;

export const PROVIDER_TYPES: readonly ProviderType[] = [
  'gemini',
  'claude',
  'openai',
  'openrouter',
];

export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (PROVIDER_TYPES as readonly string[]).includes(value);
}

/** Return the fixed higher-capability model used by every synthesis operation. */
export function resolveSynthesisModel(providerType: ProviderType): string {
  return SYNTHESIS_MODEL_BY_PROVIDER[providerType];
}
