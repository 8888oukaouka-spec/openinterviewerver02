// GET /api/interviews/[id] - Get single interview
// Protected: Requires authenticated session

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getInterview } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, context, error } = await getRequestContext();
    if (!authorized || !context) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing interview ID' },
        { status: 400 }
      );
    }

    const interview = await getInterview(id, context.kvClient);

    if (!interview) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ interview });
  } catch (error) {
    console.error('Get interview API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview' },
      { status: 500 }
    );
  }
}
