import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAiCredential, validateRedisCredentials } from '@/lib/credentialValidation';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('credential validation', () => {
  it('validates Redis through its bounded REST ping without exposing the token in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'PONG' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateRedisCredentials('https://owner.upstash.io', 'secret-token');
    expect(result).toEqual({ valid: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://owner.upstash.io/ping');
    expect(String(url)).not.toContain('secret-token');
    expect(options.headers.Authorization).toBe('Bearer secret-token');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('classifies provider authentication errors as invalid without returning provider bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret provider body', { status: 401 })));
    await expect(validateAiCredential('claude', 'sk-ant-secret')).resolves.toEqual({
      valid: false,
      reason: 'invalid',
    });
  });

  it.each([
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', 'x-goog-api-key'],
    ['claude', 'https://api.anthropic.com/v1/models?limit=1', 'x-api-key'],
    ['openai', 'https://api.openai.com/v1/models', 'Authorization'],
    ['openrouter', 'https://openrouter.ai/api/v1/key', 'Authorization'],
  ] as const)('uses the authenticated %s validation endpoint', async (provider, endpoint, header) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateAiCredential(provider, 'provider-secret')).resolves.toEqual({ valid: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(endpoint);
    expect(options.headers[header]).toBe(
      header === 'Authorization' ? 'Bearer provider-secret' : 'provider-secret'
    );
    expect(options.cache).toBe('no-store');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a provider validation that exceeds its bounded deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    )));

    const validation = validateAiCredential('openrouter', 'provider-secret', 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(validation).resolves.toEqual({ valid: false, reason: 'unavailable' });
  });
});
