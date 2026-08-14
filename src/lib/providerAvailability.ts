import type { AIProviderType, StudyConfig } from '@/types';
import type { ResearcherContext } from './researcherContext';
import { resolveProviderType } from './providers';
import {
  isGatewayAuthConfigured,
  isGatewayProvider,
  resolveAITransport,
} from './aiTransport';
import { isHostedMode } from './mode';

/** Return the selected provider when the active transport cannot serve it. */
export function missingProviderCredential(
  context: Pick<
    ResearcherContext,
    'geminiApiKey' | 'anthropicApiKey' | 'openaiApiKey' | 'openrouterApiKey'
  >,
  config: StudyConfig,
): AIProviderType | null {
  const provider = resolveProviderType(config);
  if (!isHostedMode() && resolveAITransport() === 'gateway') {
    return isGatewayProvider(provider) && isGatewayAuthConfigured() ? null : provider;
  }
  const credential = {
    gemini: context.geminiApiKey,
    claude: context.anthropicApiKey,
    openai: context.openaiApiKey,
    openrouter: context.openrouterApiKey,
  } satisfies Record<AIProviderType, string | null>;
  return credential[provider]?.trim() ? null : provider;
}
