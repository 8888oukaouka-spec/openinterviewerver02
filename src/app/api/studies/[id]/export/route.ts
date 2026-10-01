// GET /api/studies/[id]/export - Download all interview transcripts as Markdown
// Researcher auth required.

export const dynamic = 'force-dynamic';

import { getStudy, getStudyInterviews } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import { configurationRequiredResponse } from '@/lib/researcherAccess';
import { buildStudyMarkdown, slugify } from '@/lib/exportMarkdown';
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

    const [study, interviews] = await Promise.all([
      getStudy(id, access.context.kvClient),
      getStudyInterviews(id, access.context.kvClient),
    ]);

    if (!study) {
      return Response.json({ error: 'Study not found.' }, { status: 404 });
    }

    const markdown = buildStudyMarkdown(study, interviews);
    const filename = `${slugify(study.config.name)}-interviews.md`;

    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logRequestFailure({ event: 'route.failure', route: '/api/studies/[id]/export', method: 'GET', status: 500 }, error);
    return Response.json({ error: 'Failed to generate export.' }, { status: 500 });
  }
}
