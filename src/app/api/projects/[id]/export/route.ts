// GET /api/projects/[id]/export - Download all interview transcripts for every
// study in a project as a single Markdown knowledge-base file.
// Researcher auth required.

export const dynamic = 'force-dynamic';

import { getProject, getAllStudies, getStudyInterviews } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { buildProjectMarkdown, slugify } from '@/lib/exportMarkdown';
import { logRequestFailure } from '@/lib/requestLog';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await getRequestContext();
    const setupResponse = configurationRequiredResponse(access);
    if (setupResponse) return setupResponse;
    if (!access.authorized || !access.context) {
      return Response.json({ error: access.error || 'Unauthorized' }, { status: 401 });
    }

    const [project, allStudies] = await Promise.all([
      getProject(id, access.context.kvClient),
      getAllStudies(access.context.kvClient),
    ]);

    if (!project) {
      return Response.json({ error: 'Project not found.' }, { status: 404 });
    }

    const projectStudies = allStudies.filter(s => s.projectId === id);

    const studiesWithInterviews = await Promise.all(
      projectStudies.map(async study => ({
        study,
        interviews: await getStudyInterviews(study.id, access.context!.kvClient),
      }))
    );

    const markdown = buildProjectMarkdown(project.name, studiesWithInterviews);
    const filename = `${slugify(project.name)}-knowledge-base.md`;

    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/projects/[id]/export', method: 'GET', status: 500 }, error);
    return Response.json({ error: 'Failed to generate export.' }, { status: 500 });
  }
}
