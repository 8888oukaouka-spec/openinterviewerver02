'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Database, Key, CheckCircle, XCircle, Loader2,
  AlertCircle, ArrowLeft, ChevronDown, ChevronUp, Trash2, RotateCw
} from 'lucide-react';
import type { AIProviderType, ResearcherProfile } from '@/types';
import { PROVIDER_OPTIONS } from '@/lib/providerRegistry';

interface ValidationState {
  loading: boolean;
  valid: boolean | null;
  error: string | null;
}

type ProviderProfileField = 'hasGeminiKey' | 'hasAnthropicKey' | 'hasOpenAiKey' | 'hasOpenRouterKey';
type CredentialField = 'geminiApiKey' | 'anthropicApiKey' | 'openAiApiKey' | 'openRouterApiKey';
type CredentialTarget = 'gemini' | 'anthropic' | 'openai' | 'openrouter';

type ProviderSetup = {
  id: AIProviderType;
  label: string;
  statusLabel: string;
  inputId: string;
  placeholder: string;
  profileField: ProviderProfileField;
  credentialField: CredentialField;
  clearTarget: CredentialTarget;
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
    label: providerLabel('gemini'),
    statusLabel: 'Gemini Key',
    inputId: 'settings-gemini-key',
    placeholder: 'AIza...',
    profileField: 'hasGeminiKey',
    credentialField: 'geminiApiKey',
    clearTarget: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'Google AI Studio',
    steps: ['Sign in and create an API key', 'Copy the new key'],
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
    label: providerLabel('claude'),
    statusLabel: 'Claude Key',
    inputId: 'settings-claude-key',
    placeholder: 'sk-ant-...',
    profileField: 'hasAnthropicKey',
    credentialField: 'anthropicApiKey',
    clearTarget: 'anthropic',
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
    label: providerLabel('openai'),
    statusLabel: 'OpenAI Key',
    inputId: 'settings-openai-key',
    placeholder: 'sk-...',
    profileField: 'hasOpenAiKey',
    credentialField: 'openAiApiKey',
    clearTarget: 'openai',
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
    label: providerLabel('openrouter'),
    statusLabel: 'OpenRouter Key',
    inputId: 'settings-openrouter-key',
    placeholder: 'sk-or-v1-...',
    profileField: 'hasOpenRouterKey',
    credentialField: 'openRouterApiKey',
    clearTarget: 'openrouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyUrlLabel: 'OpenRouter Keys',
    steps: ['Sign in or create an account', 'Create an API key', 'Copy the new key'],
    guidance: (
      <>
        OpenRouter routes requests to upstream inference providers. OpenInterviewer requires compatible
        zero-data-retention routes and denies provider data collection; requests fail if those restrictions cannot
        be met. Review OpenRouter&apos;s{' '}
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

const StatusIcon: React.FC<{ configured: boolean }> = ({ configured }) =>
  configured
    ? <CheckCircle size={16} aria-hidden="true" className="text-green-400" />
    : <XCircle size={16} aria-hidden="true" className="text-stone-500" />;

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

const Settings: React.FC = () => {
  const router = useRouter();
  const [profile, setProfile] = useState<ResearcherProfile | null>(null);
  const [mode, setMode] = useState<'hosted' | 'standalone' | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [providerKeys, setProviderKeys] = useState<Record<AIProviderType, string>>(() => initialProviderRecord(() => ''));
  const [redisUrl, setRedisUrl] = useState('');
  const [redisToken, setRedisToken] = useState('');

  // Validation state
  const [providerValidation, setProviderValidation] = useState<Record<AIProviderType, ValidationState>>(
    () => initialProviderRecord(emptyValidationState)
  );
  const [redisValidation, setRedisValidation] = useState<ValidationState>({ loading: false, valid: null, error: null });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Expandable guide state
  const [providerGuideOpen, setProviderGuideOpen] = useState<Record<AIProviderType, boolean>>(
    () => initialProviderRecord(() => false)
  );
  const [redisGuideOpen, setRedisGuideOpen] = useState(false);

  useEffect(() => {
    fetch('/api/config/readiness')
      .then(res => res.json())
      .then(async data => {
        const deploymentMode = data.mode === 'hosted' ? 'hosted' : 'standalone';
        setMode(deploymentMode);
        if (deploymentMode === 'hosted') {
          const profileResponse = await fetch('/api/auth/me');
          const profileData = await profileResponse.json();
          if (profileData.profile) setProfile(profileData.profile);
        }
      })
      .catch(() => setMode(null))
      .finally(() => setLoading(false));
  }, []);

  const refreshProfile = async () => {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    const data = await response.json();
    if (data.profile) setProfile(data.profile);
  };

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

  const hasChanges = Object.values(providerKeys).some(Boolean) || Boolean(redisUrl && redisToken);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const body: Record<string, string> = {};
      for (const provider of AI_PROVIDER_SETUP) {
        const apiKey = providerKeys[provider.id];
        if (apiKey) body[provider.credentialField] = apiKey;
      }
      if (redisUrl && redisToken) {
        body.redisUrl = redisUrl;
        body.redisToken = redisToken;
      }

      if (Object.keys(body).length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch('/api/onboarding/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaveSuccess(true);
        // Refresh profile
        await refreshProfile();
        // Clear form fields
        setProviderKeys(initialProviderRecord(() => ''));
        setProviderValidation(initialProviderRecord(emptyValidationState));
        setRedisUrl('');
        setRedisToken('');
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save changes. Please try again.');
      }
    } catch {
      setSaveError('Connection error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clearCredential = async (
    target: CredentialTarget | 'redis' | 'all',
    label: string
  ) => {
    if (!window.confirm(`Clear ${label}? Active studies that depend on it may stop working.`)) return;
    setLifecycleBusy(target);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const response = await fetch('/api/account/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to clear credential');
      const provider = AI_PROVIDER_SETUP.find(option => option.clearTarget === target);
      if (provider) {
        setProviderKeys(current => ({ ...current, [provider.id]: '' }));
        setProviderValidation(current => ({ ...current, [provider.id]: emptyValidationState() }));
      } else if (target === 'redis') {
        setRedisUrl('');
        setRedisToken('');
        setRedisValidation(emptyValidationState());
      } else if (target === 'all') {
        setProviderKeys(initialProviderRecord(() => ''));
        setProviderValidation(initialProviderRecord(emptyValidationState));
        setRedisUrl('');
        setRedisToken('');
        setRedisValidation(emptyValidationState());
      }
      await refreshProfile();
      setSaveSuccess(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to clear credential');
    } finally {
      setLifecycleBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (!profile || deleteConfirmation.trim().toLowerCase() !== profile.email.toLowerCase()) return;
    setLifecycleBusy('account');
    setSaveError(null);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to delete account');
      router.replace('/');
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to delete account');
      setLifecycleBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-stone-400" />
      </div>
    );
  }

  if (mode === 'standalone') {
    return (
      <div className="min-h-screen bg-stone-900 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={() => router.push('/studies')}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
              aria-label="Back to studies"
            >
              <ArrowLeft size={20} className="text-stone-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Self-hosted settings</h1>
              <p className="text-stone-400 text-sm">This instance is configured by its operator.</p>
            </div>
          </div>
          <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 space-y-4">
            <p className="text-stone-300 leading-relaxed">
              API keys, Redis credentials, and signing secrets are read from this deployment&apos;s
              environment. They cannot be viewed or changed in the browser.
            </p>
            <p className="text-stone-400 text-sm">
              Run <code className="text-stone-200">npm run setup:check</code> from the project directory,
              then update the named variables in your hosting environment and redeploy.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push('/self-host')}
                className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg"
              >
                Open self-host guide
              </button>
              <a
                href="/api/health/ready"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 border border-stone-600 text-stone-300 rounded-lg hover:bg-stone-800"
              >
                View readiness status
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/studies')}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
            aria-label="Back to studies"
          >
            <ArrowLeft size={20} className="text-stone-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            {profile && (
              <p className="text-stone-400 text-sm">{profile.email}</p>
            )}
          </div>
        </div>

        {/* Current Status */}
        {profile && (
          <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Current Status</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {AI_PROVIDER_SETUP.map(provider => (
                <div key={provider.id} className="flex items-center gap-2">
                  <StatusIcon configured={Boolean(profile[provider.profileField])} />
                  <span className="text-stone-300 text-sm">
                    {provider.statusLabel}
                    <span className="sr-only">
                      {profile[provider.profileField] ? ': configured' : ': not configured'}
                    </span>
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <StatusIcon configured={profile.hasRedisConfigured} />
                <span className="text-stone-300 text-sm">
                  Redis Storage
                  <span className="sr-only">
                    {profile.hasRedisConfigured ? ': configured' : ': not configured'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {profile && !profile.onboardingComplete && (
          <div className="flex flex-col items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl sm:flex-row sm:items-center">
            <AlertCircle size={18} className="text-amber-300 flex-shrink-0" />
            <p className="text-amber-100/80 text-sm flex-1">
              Storage and at least one valid AI key are required before studies can run.
            </p>
            <button
              type="button"
              onClick={() => router.push('/onboarding')}
              className="text-sm text-amber-100 underline underline-offset-2"
            >Finish setup</button>
          </div>
        )}

        <div className="bg-blue-500/5 rounded-xl border border-blue-400/20 p-5 mb-6 text-sm text-stone-300 leading-relaxed">
          <p className="font-medium text-stone-100 mb-2">How hosted BYOS credentials are handled</p>
          <p>
            OpenInterviewer stores your Redis and AI credentials encrypted in the platform database.
            The hosted server decrypts them in memory when connecting on your behalf, and the app operator
            controls the encryption keys and therefore can technically decrypt stored values. The service can
            read and write your supplied Redis database; participant interview content is sent to the AI provider
            selected for a study. OpenRouter also routes that content to an upstream inference provider and is
            constrained to compatible zero-data-retention, no-data-collection routes. Secrets are never returned
            to this page. Rotate a credential by entering its replacement below, clear it here to disconnect the
            app, and rotate it at the provider to revoke access completely.
          </p>
        </div>

        {/* AI API Keys */}
        <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Key size={18} className="text-stone-400" />
            <h2 className="text-lg font-semibold text-white">AI API Keys</h2>
          </div>
          <p className="text-stone-400 text-sm mb-4">
            Update your API keys. Leave blank to keep the current key.
          </p>

          <div className="space-y-4">
            {AI_PROVIDER_SETUP.map(provider => {
              const validation = providerValidation[provider.id];
              const configured = Boolean(profile?.[provider.profileField]);
              const guideOpen = providerGuideOpen[provider.id];
              const errorId = `${provider.inputId}-error`;
              return (
                <div key={provider.id}>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={provider.inputId} className="text-sm font-medium text-stone-300">
                      {provider.label} API Key
                    </label>
                    <div className="flex items-center gap-2">
                      <ValidationBadge state={validation} label={provider.label} />
                      {configured ? (
                        <button
                          type="button"
                          onClick={() => clearCredential(provider.clearTarget, `the ${provider.label} key`)}
                          disabled={Boolean(lifecycleBusy)}
                          className="text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                        >
                          {lifecycleBusy === provider.clearTarget ? 'Clearing…' : 'Clear'}
                        </button>
                      ) : null}
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
                      {provider.label} setup guide
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
        </div>

        {/* Redis Storage */}
        <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-stone-400" />
            <h2 className="text-lg font-semibold text-white">Upstash Redis Storage</h2>
            {profile?.hasRedisConfigured && (
              <button
                type="button"
                onClick={() => clearCredential('redis', 'the Redis connection')}
                disabled={!!lifecycleBusy}
                className="ml-auto text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
              >Clear connection</button>
            )}
          </div>
          <p className="text-stone-400 text-sm mb-4">
            Update your Redis credentials. Leave blank to keep the current connection.
            <span className="text-amber-400"> Warning: changing your Redis URL will disconnect from your current data.</span>
            <span className="block mt-1">Clearing this connection never deletes data from the external Redis database.</span>
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="settings-redis-url" className="text-sm font-medium text-stone-300 mb-1 block">REST API URL</label>
              <input
                id="settings-redis-url"
                type="text"
                value={redisUrl}
                onChange={(e) => { setRedisUrl(e.target.value); setRedisValidation({ loading: false, valid: null, error: null }); }}
                placeholder={profile?.hasRedisConfigured ? '(currently set)' : 'https://your-db.upstash.io'}
                aria-describedby={redisValidation.error ? 'settings-redis-error' : undefined}
                className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
              />
            </div>
            <div>
              <label htmlFor="settings-redis-token" className="text-sm font-medium text-stone-300 mb-1 block">REST API Token</label>
              <input
                id="settings-redis-token"
                type="password"
                value={redisToken}
                onChange={(e) => { setRedisToken(e.target.value); setRedisValidation({ loading: false, valid: null, error: null }); }}
                placeholder={profile?.hasRedisConfigured ? '(currently set)' : 'AXxx...'}
                aria-describedby={redisValidation.error ? 'settings-redis-error' : undefined}
                className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
              />
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ValidationBadge state={redisValidation} label="Redis connection" />
                {redisValidation.valid && <span className="text-green-400 text-sm">Connected</span>}
                {redisValidation.error && (
                  <span id="settings-redis-error" role="alert" className="text-red-400 text-sm">
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
                Setup guide
              </button>

              {redisGuideOpen && (
                <div className="mt-2 p-3 bg-stone-800/30 border border-stone-600 rounded-lg text-xs space-y-2">
                  <ol className="list-decimal list-inside space-y-1 text-stone-300">
                    <li>Go to <a href="https://console.upstash.com" target="_blank" rel="noopener noreferrer" className="text-stone-400 hover:text-stone-300 underline">console.upstash.com</a> and sign in</li>
                    <li>Click &quot;+ Create Database&quot; and choose the plan that fits your expected usage</li>
                    <li>After creation, go to database details → REST API section</li>
                    <li>Copy REST URL (https://*.upstash.io) and REST Token</li>
                  </ol>
                  <div className="flex items-start gap-1.5 text-amber-400 mt-2">
                    <span>⚠</span>
                    <span>Use REST URL (https://), not regular URL (redis://)</span>
                  </div>
                  <p className="text-stone-400">
                    Plan availability, pricing, and limits vary. Check Upstash&apos;s current{' '}
                    <a href="https://upstash.com/pricing/redis" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white underline">Redis pricing</a>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        {/* Partial Redis warning */}
        {((redisUrl && !redisToken) || (!redisUrl && redisToken)) && (
          <div className="flex items-center gap-2 p-3 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            Both Redis URL and token are required to update storage credentials.
          </div>
        )}

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {saveSuccess && (
              <span role="status" aria-live="polite" className="text-green-400 text-sm flex items-center gap-1">
                <CheckCircle size={14} /> Saved successfully
              </span>
            )}
            {saveError && (
              <span role="alert" className="text-red-400 text-sm flex items-center gap-1">
                <AlertCircle size={14} /> {saveError}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-6 py-3 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <RotateCw size={18} />
                Validate &amp; rotate
              </>
            )}
          </button>
        </div>

        {profile && (
          <div id="account" className="mt-8 bg-red-500/5 rounded-xl border border-red-500/30 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-300" />
              <h2 className="text-lg font-semibold text-white">Delete platform account</h2>
            </div>
            <p className="text-stone-400 text-sm leading-relaxed mb-4">
              This removes your hosted account, encrypted credentials, and platform routing metadata.
              It does not delete studies, interviews, or any other data in your external Upstash Redis database.
              Manage or delete that external data directly in Upstash.
            </p>
            <label htmlFor="delete-account-confirmation" className="block text-xs text-stone-400 mb-1">
              Enter {profile.email} to confirm
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="delete-account-confirmation"
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-stone-800 border border-red-500/30 text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <button
                type="button"
                onClick={deleteAccount}
                disabled={
                  lifecycleBusy === 'account'
                  || deleteConfirmation.trim().toLowerCase() !== profile.email.toLowerCase()
                }
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm"
              >
                {lifecycleBusy === 'account' ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Settings;
