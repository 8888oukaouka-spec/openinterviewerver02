// POST /api/projects/[id]/studies - Assign or remove a study from this project
// Body: { studyId: string, action: 'assign' | 'remove' }
// Researcher auth required.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { assignStudyToProject } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { readBoundedJsonObject } from '@/lib/requestBody';
import { logRequestFailure } from '@/lib/requestLog';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return NextResponse.json({ error: access.error || 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readBoundedJsonObject(request, 512);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const studyId = typeof parsedBody.value.studyId === 'string' ? parsedBody.value.studyId : '';
    if (!studyId) {
      return NextResponse.json({ error: 'studyId is required.' }, { status: 400 });
    }

    const action = parsedBody.value.action;
    if (action !== 'assign' && action !== 'remove') {
      return NextResponse.json({ error: 'action must be "assign" or "remove".' }, { status: 400 });
    }

    const targetProjectId = action === 'assign' ? projectId : null;
    const result = await assignStudyToProject(studyId, targetProjectId, access.context.kvClient);

    if (result.status === 'not-found') {
      return NextResponse.json({ error: 'Study not found.' }, { status: 404 });
    }
    if (result.status === 'unavailable') {
      return NextResponse.json({ error: 'Storage temporarily unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, studyId, projectId: targetProjectId });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects/[id]/studies', method: 'POST', status: 500 }, error);
    return NextResponse.json({ error: 'Failed to update project assignment' }, { status: 500 });
  }
}
