// POST /api/onboarding/save-credentials - Encrypt and store researcher credentials
// Only available in hosted mode

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/researcherContext';
import { updateResearcher } from '@/lib/platformDb';
import { encrypt } from '@/lib/crypto';
import { isHostedMode } from '@/lib/mode';
import { isValidUpstashUrl } from '@/lib/kvClient';

export async function POST(request: Request) {
  if (!isHostedMode()) {
    return NextResponse.json({ error: 'Only available in hosted mode' }, { status: 404 });
  }

  const { authorized, researcherId, error } = await getRequestContext();
  if (!authorized || !researcherId) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { redisUrl, redisToken, geminiApiKey, anthropicApiKey } = body as {
      redisUrl?: string;
      redisToken?: string;
      geminiApiKey?: string;
      anthropicApiKey?: string;
    };

    // Build updates — only encrypt and store non-empty values
    const updates: Record<string, string | number | null> = {};

    if (redisUrl && redisToken) {
      if (!isValidUpstashUrl(redisUrl)) {
        return NextResponse.json(
          { error: 'Only Upstash Redis URLs (https://*.upstash.io) are supported.' },
          { status: 400 }
        );
      }
      updates.encryptedRedisUrl = encrypt(redisUrl);
      updates.encryptedRedisToken = encrypt(redisToken);
      updates.redisConfiguredAt = Date.now();
    }

    if (geminiApiKey) {
      updates.encryptedGeminiApiKey = encrypt(geminiApiKey);
    }

    if (anthropicApiKey) {
      updates.encryptedAnthropicApiKey = encrypt(anthropicApiKey);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No credentials provided' }, { status: 400 });
    }

    const success = await updateResearcher(researcherId, updates);
    if (!success) {
      return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save credentials error:', error);
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    );
  }
}
