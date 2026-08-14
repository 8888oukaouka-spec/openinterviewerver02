'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Database, Key, CheckCircle, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';
import type { AIProviderType, ResearcherProfile } from '@/types';
import { PROVIDER_OPTIONS } from '@/lib/providerRegistry';

type Step = 'welcome' | 'ai-keys' | 'redis' | 'done';
const STEPS: Step[] = ['welcome', 'ai-keys', 'redis', 'done'];

interface ValidationState {
  loading: boolean;
  valid: boolean | null;
  error: string | null;
}

type CredentialField = 'geminiApiKey' | 'anthropicApiKey' | 'openAiApiKey' | 'openRouterApiKey';
type ProviderProfileField = 'hasGeminiKey' | 'hasAnthropicKey' | 'hasOpenAiKey' | 'hasOpenRouterKey';

type OnboardingProfile = Partial<Pick<
  ResearcherProfile,
  'name' | 'hasGeminiKey' | 'hasAnthropicKey' | 'hasOpenAiKey' | 'hasOpenRouterKey'
>>;

type ProviderSetup = {
  id: AIProviderType;
  credentialField: CredentialField;
  profileField: ProviderProfileField;
  label: string;
  summaryLabel: string;
  article: 'a' | 'an';
  inputId: string;
  placeholder: string;
  keyUrl: string;
  keyUrlLabel: string;
  steps: string[];
  guidance: React.ReactNode;
};

const providerLabel = (provider: AIProviderType) =>
  PROVIDER_OPTIONS.find(option => option.id === provider)!.label;

const AI_PROVIDER_SETUP: ProviderSetup[] = [
  {
    id: 'gemini',
    credentialField: 'geminiApiKey',
    profileField: 'hasGeminiKey',
    label: providerLabel('gemini'),
    summaryLabel: 'Gemini',
    article: 'a',
    inputId: 'onboarding-gemini-key',
    placeholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'Google AI Studio',
    steps: ['Sign in with a Google account', 'Create an API key', 'Copy the new key'],
    guidance: (
      <>
        Pricing, free-tier availability, and rate limits vary by model and account. Check Google&apos;s current{' '}
        <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">pricing</a>
        {' '}and{' '}
        <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">rate-limit documentation</a>.
      </>
    ),
  },
  {
    id: 'claude',
    credentialField: 'anthropicApiKey',
    profileField: 'hasAnthropicKey',
    label: providerLabel('claude'),
    summaryLabel: 'Claude',
    article: 'a',
    inputId: 'onboarding-claude-key',
    placeholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'Anthropic Console',
    steps: ['Sign in or create an account', 'Create an API key', 'Copy the new key'],
    guidance: (
      <>
        Credits, billing requirements, pricing, and usage limits vary. Check the Anthropic console and{' '}
        <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">current pricing documentation</a>.
      </>
    ),
  },
  {
    id: 'openai',
    credentialField: 'openAiApiKey',
    profileField: 'hasOpenAiKey',
    label: providerLabel('openai'),
    summaryLabel: 'OpenAI',
    article: 'an',
    inputId: 'onboarding-openai-key',
    placeholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'OpenAI Platform',
    steps: ['Sign in or create an account', 'Create a new secret key', 'Copy the key before leaving the page'],
    guidance: (
      <>
        API billing, model access, and usage limits depend on your account. Check OpenAI&apos;s current{' '}
        <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">API pricing</a>.
      </>
    ),
  },
  {
    id: 'openrouter',
    credentialField: 'openRouterApiKey',
    profileField: 'hasOpenRouterKey',
    label: providerLabel('openrouter'),
    summaryLabel: 'OpenRouter',
    article: 'an',
    inputId: 'onboarding-openrouter-key',
    placeholder: 'sk-or-v1-...',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyUrlLabel: 'OpenRouter Keys',
    steps: ['Sign in or create an account', 'Create an API key', 'Copy the new key'],
    guidance: (
      <>
        OpenRouter routes requests to upstream inference providers. OpenInterviewer requires compatible
        zero-data-retention routes and denies provider data collection; a request fails if those restrictions
        cannot be met. Review OpenRouter&apos;s{' '}
        <a href="https://openrouter.ai/docs/guides/features/zdr" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">privacy and ZDR documentation</a>.
      </>
    ),
  },
];

const emptyValidationState = (): ValidationState => ({ loading: false, valid: null, error: null });

const initialProviderRecord = <T,>(create: () => T): Record<AIProviderType, T> => ({
  gemini: create(),
  claude: create(),
  openai: create(),
  openrouter: create(),
});

const ValidationBadge: React.FC<{ state: ValidationState; label: string }> = ({ state, label }) => {
  if (state.loading) return (
    <span role="status" aria-live="polite">
      <Loader2 size={16} aria-hidden="true" className="animate-spin text-stone-400" />
      <span className="sr-only">Testing {label} key</span>
    </span>
  );
  if (state.valid === true) return (
    <span role="status" aria-live="polite">
      <CheckCircle size={16} aria-hidden="true" className="text-green-400" />
      <span className="sr-only">{label} key validated</span>
    </span>
  );
  if (state.valid === false) return <AlertCircle size={16} aria-hidden="true" className="text-red-400" />;
  return null;
};

const Onboarding: React.FC = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);

  // AI keys state
  const [providerKeys, setProviderKeys] = useState<Record<AIProviderType, string>>(() => initialProviderRecord(() => ''));
  const [providerValidation, setProviderValidation] = useState<Record<AIProviderType, ValidationState>>(
    () => initialProviderRecord(emptyValidationState)
  );

  // Redis state
  const [redisUrl, setRedisUrl] = useState('');
  const [redisToken, setRedisToken] = useState('');
  const [redisValidation, setRedisValidation] = useState<ValidationState>({ loading: false, valid: null, error: null });

  const [saving, setSaving] = useState(false);

  // Expandable guide state
  const [providerGuideOpen, setProviderGuideOpen] = useState<Record<AIProviderType, boolean>>(
    () => initialProviderRecord(() => false)
  );
  const [redisGuideOpen, setRedisGuideOpen] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  const step = STEPS[currentStep];

  const validateAiKey = async (provider: AIProviderType, apiKey: string) => {
    setProviderValidation(current => ({
      ...current,
      [provider]: { loading: true, valid: null, error: null },
    }));

    try {
      const res = await fetch('/api/onboarding/validate-ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      setProviderValidation(current => ({
        ...current,
        [provider]: { loading: false, valid: data.valid === true, error: data.error || null },
      }));
    } catch {
      setProviderValidation(current => ({
        ...current,
        [provider]: { loading: false, valid: false, error: 'Validation failed' },
      }));
    }
  };

  const validateRedis = async () => {
    setRedisValidation({ loading: true, valid: null, error: null });

    try {
      const res = await fetch('/api/onboarding/validate-redis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redisUrl, redisToken }),
      });
      const data = await res.json();
      setRedisValidation({ loading: false, valid: data.valid, error: data.error || null });
    } catch {
      setRedisValidation({ loading: false, valid: false, error: 'Validation failed' });
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveAndComplete = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Save credentials
      const saveRes = await fetch('/api/onboarding/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redisUrl: redisUrl || undefined,
          redisToken: redisToken || undefined,
          ...Object.fromEntries(AI_PROVIDER_SETUP.map(provider => [
            provider.credentialField,
            providerKeys[provider.id] || undefined,
          ])),
        }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save credentials. Please try again.');
        setSaving(false);
        return;
      }

      // Mark onboarding complete
      const completeRes = await fetch('/api/onboarding/complete', { method: 'POST' });
      const completeData = await completeRes.json().catch(() => ({})) as {
        error?: string;
        redirectPath?: string;
      };
      if (!completeRes.ok) {
        setSaveError(completeData.error || 'Failed to complete onboarding. Please try again.');
        setSaving(false);
        return;
      }

      router.push(completeData.redirectPath || '/studies');
    } catch {
      setSaveError('Connection error. Please try again.');
      setSaving(false);
    }
  };

  const availableProviders = AI_PROVIDER_SETUP.filter(provider =>
    providerValidation[provider.id].valid === true || Boolean(profile?.[provider.profileField])
  );
  const canProceedFromAiKeys = availableProviders.length > 0;
  const canProceedFromRedis = redisValidation.valid;

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full"
      >
        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStep ? 'bg-stone-400' : 'bg-stone-700'
              }`}
            />
          ))}
        </div>

        <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-5 sm:p-8">
          <AnimatePresence mode="wait">
            {step === 'welcome' && (
              <motion.div key="welcome" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-stone-700 flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={28} className="text-stone-300" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">
                    Welcome{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!
                  </h1>
                  <p className="text-stone-400 mt-3 leading-relaxed">
                    Let&apos;s get you set up. OpenInterviewer uses a <strong className="text-stone-300">Bring Your Own Storage</strong> model &mdash;
                    your data stays in your own infrastructure, giving you full control over your research data.
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-3 p-3 bg-stone-800 rounded-lg">
                    <Key size={18} className="text-stone-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-stone-200 text-sm font-medium">AI API Key</p>
                      <p className="text-stone-400 text-xs">A Gemini, Claude, OpenAI, or OpenRouter key</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-stone-800 rounded-lg">
                    <Database size={18} className="text-stone-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-stone-200 text-sm font-medium">Upstash Redis</p>
                      <p className="text-stone-400 text-xs">Your database for studies and interview records</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-blue-400/20 bg-blue-500/5 text-xs text-stone-400 leading-relaxed">
                  The hosted server receives these credentials over its encrypted connection, stores them
                  encrypted, and decrypts them in memory when it connects on your behalf. The app operator
                  controls the encryption keys and can technically decrypt the stored values. The service can
                  read and write the supplied Redis database, and participant interview content is sent to the
                  AI provider you select. When you select OpenRouter, it also routes that content to an upstream
                  inference provider. You can clear the connection here later; rotate the keys or tokens at their
                  providers to revoke access completely.
                </div>
              </motion.div>
            )}

            {step === 'ai-keys' && (
              <motion.div key="ai-keys" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-bold text-white mb-1">AI API Key</h2>
                <p className="text-stone-400 text-sm mb-6">
                  Add and test at least one AI provider key. You can connect more providers for flexibility.
                </p>

                <div className="space-y-5">
                  {AI_PROVIDER_SETUP.map(provider => {
                    const validation = providerValidation[provider.id];
                    const guideOpen = providerGuideOpen[provider.id];
                    const configured = Boolean(profile?.[provider.profileField]);
                    const errorId = `${provider.inputId}-error`;
                    return (
                      <div key={provider.id}>
                        <div className="flex items-center justify-between mb-1">
                          <label htmlFor={provider.inputId} className="text-sm font-medium text-stone-300">
                            {provider.label} API Key
                          </label>
                          <div className="flex items-center gap-2">
                            {configured && validation.valid !== true ? (
                              <span className="text-xs text-green-400">Connected</span>
                            ) : null}
                            <ValidationBadge state={validation} label={provider.label} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            id={provider.inputId}
                            type="password"
                            value={providerKeys[provider.id]}
                            onChange={(event) => {
                              setProviderKeys(current => ({ ...current, [provider.id]: event.target.value }));
                              setProviderValidation(current => ({ ...current, [provider.id]: emptyValidationState() }));
                            }}
                            placeholder={configured ? '(currently set)' : provider.placeholder}
                            autoComplete="new-password"
                            aria-describedby={validation.error ? errorId : undefined}
                            className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
                          />
                          <button
                            type="button"
                            onClick={() => validateAiKey(provider.id, providerKeys[provider.id])}
                            disabled={!providerKeys[provider.id] || validation.loading}
                            className="px-3 py-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-stone-300 text-sm rounded-lg transition-colors"
                          >
                            {validation.loading ? 'Testing…' : 'Test'}
                          </button>
                        </div>
                        {validation.error ? (
                          <p id={errorId} role="alert" className="text-red-400 text-xs mt-1">
                            {validation.error}
                          </p>
                        ) : null}

                        <div className="mt-2">
                          <button
                            type="button"
                            aria-expanded={guideOpen}
                            onClick={() => setProviderGuideOpen(current => ({
                              ...current,
                              [provider.id]: !current[provider.id],
                            }))}
                            className="text-xs text-stone-500 hover:text-stone-400 inline-flex items-center gap-1"
                          >
                            {guideOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            How to get {provider.article} {provider.summaryLabel} API key
                          </button>

                          {guideOpen ? (
                            <div className="mt-2 p-3 bg-stone-800/30 border border-stone-600 rounded-lg text-xs space-y-2">
                              <ol className="list-decimal list-inside space-y-1 text-stone-300">
                                <li>
                                  Open{' '}
                                  <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className="text-stone-400 hover:text-stone-300 underline">
                                    {provider.keyUrlLabel}
                                  </a>
                                </li>
                                {provider.steps.map(instruction => <li key={instruction}>{instruction}</li>)}
                              </ol>
                              <p className="text-stone-400 mt-2">{provider.guidance}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 'redis' && (
              <motion.div key="redis" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-bold text-white mb-1">Upstash Redis</h2>
                <p className="text-stone-400 text-sm mb-6">
                  Your studies and interview data will be stored in your own Upstash Redis database.
                  Choose a plan that fits your expected usage.
                </p>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="onboarding-redis-url" className="text-sm font-medium text-stone-300">REST API URL</label>
                    </div>
                    <input
                      id="onboarding-redis-url"
                      type="text"
                      value={redisUrl}
                      onChange={(e) => { setRedisUrl(e.target.value); setRedisValidation({ loading: false, valid: null, error: null }); }}
                      placeholder="https://your-db.upstash.io"
                      aria-describedby={redisValidation.error ? 'onboarding-redis-error' : undefined}
                      className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="onboarding-redis-token" className="text-sm font-medium text-stone-300 mb-1 block">REST API Token</label>
                    <input
                      id="onboarding-redis-token"
                      type="password"
                      value={redisToken}
                      onChange={(e) => { setRedisToken(e.target.value); setRedisValidation({ loading: false, valid: null, error: null }); }}
                      placeholder="AXxx..."
                      aria-describedby={redisValidation.error ? 'onboarding-redis-error' : undefined}
                      className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ValidationBadge state={redisValidation} label="Redis connection" />
                      {redisValidation.valid && <span className="text-green-400 text-sm">Connected</span>}
                      {redisValidation.error && (
                        <span id="onboarding-redis-error" role="alert" className="text-red-400 text-sm">
                          {redisValidation.error}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={validateRedis}
                      disabled={!redisUrl || !redisToken || redisValidation.loading}
                      className="px-4 py-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-stone-300 text-sm rounded-lg transition-colors"
                    >
                      {redisValidation.loading ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>

                  {/* Expandable setup guide */}
                  <div>
                    <button
                      onClick={() => setRedisGuideOpen(!redisGuideOpen)}
                      className="text-xs text-stone-500 hover:text-stone-400 inline-flex items-center gap-1"
                    >
                      {redisGuideOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      How to set up Upstash Redis
                    </button>

                    {redisGuideOpen && (
                      <div className="mt-2 p-3 bg-stone-800/30 border border-stone-600 rounded-lg text-xs space-y-2">
                        <ol className="list-decimal list-inside space-y-1 text-stone-300">
                          <li>Go to <a href="https://console.upstash.com" target="_blank" rel="noopener noreferrer" className="text-stone-400 hover:text-stone-300 underline">console.upstash.com</a> and sign up with Google/GitHub</li>
                          <li>Click &quot;+ Create Database&quot;</li>
                          <li>Choose Regional (recommended), select nearest region</li>
                          <li>Select the plan that fits your expected usage</li>
                          <li>After creation, go to database details → REST API section</li>
                          <li>Copy REST URL (https://*.upstash.io) and REST Token</li>
                        </ol>
                        <div className="flex items-start gap-1.5 text-amber-400 mt-2">
                          <span>⚠</span>
                          <span>Use the REST URL (https://), not the regular Redis URL (redis://)</span>
                        </div>
                        <p className="text-stone-400">
                          Plan availability, pricing, and limits vary. Check Upstash&apos;s current{' '}
                          <a href="https://upstash.com/pricing/redis" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">Redis pricing</a>.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={28} className="text-green-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">You&apos;re all set!</h2>
                  <p className="text-stone-400 text-sm mb-6">
                    Your credentials have been encrypted and stored by the hosted platform.
                    You&apos;re ready to create your first study.
                  </p>

                  <div className="space-y-2 mb-6 text-left">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle size={14} className="text-green-400" />
                      <span className="text-stone-300">
                        AI: {availableProviders.map(provider => provider.summaryLabel).join(' + ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle size={14} className="text-green-400" />
                      <span className="text-stone-300">Storage: Upstash Redis connected</span>
                    </div>
                  </div>

                  {saveError && (
                    <div role="alert" className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      <AlertCircle size={16} className="flex-shrink-0" />
                      {saveError}
                    </div>
                  )}

                  <button
                    onClick={saveAndComplete}
                    disabled={saving}
                    className="w-full py-3 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Create Your First Study
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          {step !== 'done' && (
            <div className="flex justify-between mt-8 pt-6 border-t border-stone-700">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-300 disabled:opacity-30 transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={
                  (step === 'ai-keys' && !canProceedFromAiKeys) ||
                  (step === 'redis' && !canProceedFromRedis)
                }
                className="flex items-center gap-1 text-sm text-stone-200 hover:text-white disabled:opacity-30 transition-colors"
              >
                {step === 'welcome' ? 'Get Started' : 'Next'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Onboarding;
