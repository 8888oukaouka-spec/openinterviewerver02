// POST /api/studies/[id]/force-delete
// Deletes a study and ALL its interview data. Requires explicit confirmation
// in the request body. Researcher auth required.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthorizedResearcherStudyContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { forceDeleteStudy } from '@/lib/kv';
import { readBoundedJsonObject } from '@/lib/requestBody';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parsedBody = await readBoundedJsonObject(request, 512);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (parsedBody.value.confirm !== true) {
      return NextResponse.json(
        { error: 'Missing confirmation. Pass { "confirm": true } to proceed.' },
        { status: 400 }
      );
    }

    const gated = await getAuthorizedResearcherStudyContext(id, 'read');
    const denied = configurationRequiredResponse(gated);
    if (denied) return denied;
    if (!gated.authorized || !gated.context) {
      return NextResponse.json(
        { error: gated.error || 'Unauthorized' },
        { status: gated.statusCode ?? 401 }
      );
    }

    const result = await forceDeleteStudy(id, gated.context.kvClient);

    if (result.status === 'unavailable') {
      return NextResponse.json(
        { error: 'Storage temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ deleted: true, studyId: id });
  } catch (error) {
    console.error('Force delete error:', error);
    return NextResponse.json({ error: 'Failed to delete study.' }, { status: 500 });
  }
}
