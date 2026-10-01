import type { StoredInterview } from '@/types';
import type { StoredStudy } from '@/types';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function sanitize(text: string): string {
  return text.trim();
}

function formatInterview(interview: StoredInterview, index: number, studySchema: StoredStudy['config']['profileSchema']): string {
  const lines: string[] = [];

  lines.push(`## Interview ${index + 1} — ${formatDate(interview.createdAt)}`);
  lines.push('');

  // Participant background
  const filledFields = studySchema
    .map(field => {
      const val = interview.participantProfile.fields.find(f => f.fieldId === field.id);
      if (!val || val.status === 'pending' || val.value === null) return null;
      const display = val.status === 'refused' ? '(declined to answer)' : sanitize(val.value);
      return `- **${field.label}:** ${display}`;
    })
    .filter((l): l is string => l !== null);

  if (filledFields.length > 0) {
    lines.push('### Participant Background');
    lines.push('');
    lines.push(...filledFields);
    lines.push('');
  }

  // Conversation — skip system messages
  const turns = interview.transcript.filter(m => m.role !== 'system');
  if (turns.length > 0) {
    lines.push('### Conversation');
    lines.push('');
    for (const msg of turns) {
      const speaker = msg.role === 'ai' ? 'Interviewer' : 'Participant';
      lines.push(`**${speaker}:** ${sanitize(msg.content)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function buildStudyMarkdown(study: StoredStudy, interviews: StoredInterview[]): string {
  const completed = interviews.filter(i => i.status === 'completed');
  const lines: string[] = [];

  lines.push(`# Study: ${study.config.name}`);
  lines.push('');
  lines.push(`**Research Question:** ${study.config.researchQuestion}`);
  if (study.config.description) {
    lines.push(`**Description:** ${study.config.description}`);
  }
  lines.push(`**Exported:** ${formatDate(Date.now())}`);
  lines.push(`**Total Interviews:** ${completed.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (completed.length === 0) {
    lines.push('*No completed interviews in this study.*');
  } else {
    completed.forEach((iv, i) => {
      lines.push(formatInterview(iv, i, study.config.profileSchema));
      lines.push('---');
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function buildProjectMarkdown(
  projectName: string,
  studies: { study: StoredStudy; interviews: StoredInterview[] }[],
): string {
  const totalInterviews = studies.reduce((sum, s) => sum + s.interviews.filter(i => i.status === 'completed').length, 0);
  const lines: string[] = [];

  lines.push(`# Project: ${projectName}`);
  lines.push('');
  lines.push(`**Exported:** ${formatDate(Date.now())}`);
  lines.push(`**Studies:** ${studies.length}`);
  lines.push(`**Total Interviews:** ${totalInterviews}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const { study, interviews } of studies) {
    const completed = interviews.filter(i => i.status === 'completed');
    lines.push(`# Study: ${study.config.name}`);
    lines.push('');
    lines.push(`**Research Question:** ${study.config.researchQuestion}`);
    if (study.config.description) lines.push(`**Description:** ${study.config.description}`);
    lines.push(`**Interviews:** ${completed.length}`);
    lines.push('');

    if (completed.length === 0) {
      lines.push('*No completed interviews.*');
      lines.push('');
    } else {
      completed.forEach((iv, i) => {
        lines.push(formatInterview(iv, i, study.config.profileSchema));
        lines.push('---');
        lines.push('');
      });
    }
  }

  return lines.join('\n');
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
