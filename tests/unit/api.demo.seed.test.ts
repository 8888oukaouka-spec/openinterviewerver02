// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const contextMock = vi.hoisted(() => ({ getRequestContext: vi.fn() }));
vi.mock('@/lib/researcherContext', () => contextMock);

const kvMock = vi.hoisted(() => ({
  getAllStudies: vi.fn(),
  isKVAvailable: vi.fn(),
  saveInterview: vi.fn(),
  saveStudy: vi.fn(),
}));
vi.mock('@/lib/kv', () => kvMock);

import { POST } from '@/app/api/demo/seed/route';
import { DEMO_INTERVIEWS, DEMO_STORED_STUDY, DEMO_STUDIES } from '@/lib/demoData';

const kvClient = {};

function authorizeWithKeys(options: {
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  openaiApiKey?: string | null;
  openrouterApiKey?: string | null;
}) {
  contextMock.getRequestContext.mockResolvedValue({
    authorized: true,
    context: {
      ...options,
      openaiApiKey: options.openaiApiKey ?? null,
      openrouterApiKey: options.openrouterApiKey ?? null,
      kvClient,
      onboardingComplete: true,
      researcherId: 'researcher-a',
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeWithKeys({ geminiApiKey: 'gemini-key', anthropicApiKey: null });
  kvMock.isKVAvailable.mockResolvedValue(true);
  kvMock.getAllStudies.mockResolvedValue([]);
  kvMock.saveStudy.mockResolvedValue(true);
  kvMock.saveInterview.mockResolvedValue(true);
});

describe('authenticated sample-workspace seed', () => {
  it('keeps every synthetic interview eligible for its study revision', () => {
    expect(DEMO_INTERVIEWS).toHaveLength(3);
    expect(DEMO_INTERVIEWS.every(
      interview => interview.studyRevision === DEMO_STORED_STUDY.revision
    )).toBe(true);
  });

  it('prefers a configured Gemini key without mutating module fixtures', async () => {
    authorizeWithKeys({ geminiApiKey: 'gemini-key', anthropicApiKey: 'claude-key' });

    const response = await POST();

    expect(response.status).toBe(200);
    const seededStudy = kvMock.saveStudy.mock.calls[0][0];
    expect(seededStudy).not.toBe(DEMO_STUDIES[0]);
    expect(seededStudy.config).not.toBe(DEMO_STUDIES[0].config);
    expect(seededStudy.config.aiProvider).toBe('gemini');
    expect(seededStudy.config.enableReasoning).toBe(true);
    expect(DEMO_STUDIES[0].config.aiProvider).toBe('gemini');
    expect(DEMO_STUDIES[0].config.enableReasoning).toBe(true);
  });

  it('selects Claude when it is the only configured provider', async () => {
    authorizeWithKeys({ geminiApiKey: null, anthropicApiKey: 'claude-key' });

    const response = await POST();

    expect(response.status).toBe(200);
    const seededStudy = kvMock.saveStudy.mock.calls[0][0];
    expect(seededStudy.config.aiProvider).toBe('claude');
    expect(seededStudy.config).not.toHaveProperty('enableReasoning');
    expect(kvMock.saveInterview).toHaveBeenCalledTimes(3);
    for (const [interview, client] of kvMock.saveInterview.mock.calls) {
      expect(interview.studyRevision).toBe(seededStudy.revision);
      expect(client).toBe(kvClient);
    }

    // A later warm-function request must still start from untouched fixtures.
    expect(DEMO_STUDIES[0].config.aiProvider).toBe('gemini');
    expect(DEMO_STUDIES[0].config.enableReasoning).toBe(true);
  });

  it.each([
    ['openai', { openaiApiKey: 'openai-key' }],
    ['openrouter', { openrouterApiKey: 'openrouter-key' }],
  ] as const)('selects %s after the existing providers and removes Gemini-only reasoning', async (provider, keys) => {
    authorizeWithKeys({
      geminiApiKey: null,
      anthropicApiKey: null,
      ...keys,
    });

    const response = await POST();

    expect(response.status).toBe(200);
    const seededStudy = kvMock.saveStudy.mock.calls[0][0];
    expect(seededStudy.config.aiProvider).toBe(provider);
    expect(seededStudy.config).not.toHaveProperty('enableReasoning');
  });

  it('fails before writing when no AI provider is configured', async () => {
    authorizeWithKeys({ geminiApiKey: null, anthropicApiKey: null });

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'AI provider not configured. Add an AI provider key before loading sample workspace data.',
    });
    expect(kvMock.saveStudy).not.toHaveBeenCalled();
    expect(kvMock.saveInterview).not.toHaveBeenCalled();
  });
});
