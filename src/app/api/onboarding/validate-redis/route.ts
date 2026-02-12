// POST /api/onboarding/validate-redis - Test Redis credentials with ping
// Only available in hosted mode

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getRequestContext } from '@/lib/researcherContext';
import { isHostedMode } from '@/lib/mode';

export async function POST(request: Request) {
  if (!isHostedMode()) {
    return NextResponse.json({ error: 'Only available in hosted mode' }, { status: 404 });
  }

  const { authorized, error } = await getRequestContext();
  if (!authorized) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { redisUrl, redisToken } = body as { redisUrl: string; redisToken: string };

    if (!redisUrl || !redisToken) {
      return NextResponse.json({ error: 'Missing redisUrl or redisToken' }, { status: 400 });
    }

    // Try to connect and ping
    const testClient = new Redis({ url: redisUrl, token: redisToken });
    const result = await testClient.ping();

    if (result === 'PONG') {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ valid: false, error: 'Unexpected ping response' });
  } catch (error) {
    console.error('Redis validation error:', error);
    return NextResponse.json({
      valid: false,
      error: 'Failed to connect. Check your URL and token.',
    });
  }
}
