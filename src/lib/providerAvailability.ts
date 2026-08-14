import type { AIProviderType, StudyConfig } from '@/types';
import type { ResearcherContext } from './researcherContext';
import { resolveProviderType } from './providers';

/** Return the selected provider when its request-scoped credential is absent. */
export function missingProviderCredential(
  context: Pick<
    ResearcherContext,
    'geminiApiKey' | 'anthropicApiKey' | 'openaiApiKey' | 'openrouterApiKey'
  >,
  config: StudyConfig,
): AIProviderType | null {
  const provider = resolveProviderType(config);
  const credential = {
    gemini: context.geminiApiKey,
    claude: context.anthropicApiKey,
    openai: context.openaiApiKey,
    openrouter: context.openrouterApiKey,
  } satisfies Record<AIProviderType, string | null>;
  return credential[provider]?.trim() ? null : provider;
}
