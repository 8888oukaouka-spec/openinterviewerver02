// PUT /api/projects/[id] - Rename/update a project
// DELETE /api/projects/[id] - Delete project (studies become uncategorized)
// Researcher auth required.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { deleteProject, getProject, updateProject } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { readBoundedJsonObject } from '@/lib/requestBody';
import { logRequestFailure } from '@/lib/requestLog';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return NextResponse.json({ error: access.error || 'Unauthorized' }, { status: 401 });
    }

    const project = await getProject(id, access.context.kvClient);
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const parsedBody = await readBoundedJsonObject(request, 2_048);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const name = typeof parsedBody.value.name === 'string' ? parsedBody.value.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Project name is required.' }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'Project name must be 200 characters or fewer.' }, { status: 400 });
    }
    const description = typeof parsedBody.value.description === 'string'
      ? parsedBody.value.description.trim() || undefined
      : project.description;

    const updated = {
      ...project,
      name,
      description,
      updatedAt: Date.now(),
    };
    const saved = await updateProject(updated, access.context.kvClient);
    if (!saved) {
      return NextResponse.json({ error: 'Failed to update project.' }, { status: 503 });
    }
    return NextResponse.json({ project: updated });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects/[id]', method: 'PUT', status: 500 }, error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return NextResponse.json({ error: access.error || 'Unauthorized' }, { status: 401 });
    }

    const result = await deleteProject(id, access.context.kvClient);
    if (result.status === 'unavailable') {
      return NextResponse.json({ error: 'Storage temporarily unavailable.' }, { status: 503 });
    }
    if (result.status === 'not-found') {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, projectId: id });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects/[id]', method: 'DELETE', status: 500 }, error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
