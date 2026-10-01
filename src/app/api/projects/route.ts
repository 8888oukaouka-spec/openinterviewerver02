// GET /api/projects - List all projects
// POST /api/projects - Create a new project
// Researcher auth required.

export const dynamic = 'force-dynamic';

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createProject, listProjectsChecked } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { mapCollectionLoad } from '@/lib/ownedStudies';
import { readBoundedJsonObject } from '@/lib/requestBody';
import { logRequestFailure } from '@/lib/requestLog';
import type { StoredProject } from '@/types';

export async function GET() {
  try {
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return NextResponse.json({ error: access.error || 'Unauthorized' }, { status: 401 });
    }

    const loaded = await listProjectsChecked(access.context.kvClient, 500);
    const mapped = mapCollectionLoad(loaded, {
      unavailable: 'Project storage is temporarily unavailable.',
      tooLarge: 'Too many projects to load at once.',
    });
    if (!mapped.ok) return NextResponse.json(mapped.body, { status: mapped.status });
    return NextResponse.json({ projects: mapped.items });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects', method: 'GET', status: 500 }, error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return NextResponse.json({ error: access.error || 'Unauthorized' }, { status: 401 });
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
      ? parsedBody.value.description.trim()
      : undefined;

    const now = Date.now();
    const project: StoredProject = {
      id: randomUUID(),
      name,
      ...(description ? { description } : {}),
      createdAt: now,
      updatedAt: now,
      studyCount: 0,
    };

    const saved = await createProject(project, access.context.kvClient);
    if (!saved) {
      return NextResponse.json({ error: 'Failed to save project. Storage may be unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects', method: 'POST', status: 500 }, error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
