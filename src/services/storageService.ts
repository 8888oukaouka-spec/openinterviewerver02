// Storage Service - Client-side interface for interview storage
// Calls API routes which interact with Vercel KV

import {
  StoredInterview,
  StoredStudy,
  StudyConfig,
  ParticipantProfile,
  InterviewMessage,
  BehaviorData,
  SynthesisResult
} from '@/types';

// Build the interview record from the current session state.
// Kept in one place so the completion screen (transcript-only) and the
// synthesis screen (transcript + synthesis) write to the SAME interview id,
// making the synthesis save an idempotent upsert over the initial save.
export function buildInterviewRecord(args: {
  studyConfig: StudyConfig;
  participantProfile: ParticipantProfile | null;
  transcript: InterviewMessage[];
  behaviorData: BehaviorData;
  synthesis: SynthesisResult | null;
}): Omit<StoredInterview, 'completedAt' | 'status'> {
  const interviewId = args.participantProfile?.id || `interview-${Date.now()}`;
  return {
    id: interviewId,
    studyId: args.studyConfig.id,
    studyName: args.studyConfig.name,
    participantProfile: args.participantProfile || {
      id: interviewId,
      fields: [],
      rawContext: '',
      timestamp: Date.now()
    },
    transcript: args.transcript,
    synthesis: args.synthesis,
    behaviorData: args.behaviorData,
    createdAt: args.participantProfile?.timestamp || Date.now()
  };
}

// Save completed interview
export async function saveCompletedInterview(
  interview: Omit<StoredInterview, 'completedAt' | 'status'>,
  participantToken?: string | null
): Promise<{ success: boolean; id: string }> {
  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (participantToken) {
      headers['Authorization'] = `Bearer ${participantToken}`;
    }

    const response = await fetch('/api/interviews/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...interview,
        completedAt: Date.now(),
        status: 'completed'
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving interview:', error);
    return { success: false, id: '' };
  }
}

// Researcher-only: generate the synthesis for a stored interview and persist it.
// Synthesis is no longer produced during the participant flow, so the researcher
// triggers it on demand from the dashboard. Uses the admin session cookie (no
// participant token). Throws on failure so the caller can offer a retry.
export async function generateInterviewSynthesis(
  interview: StoredInterview
): Promise<StoredInterview> {
  // The synthesis endpoint needs the full study config, which isn't stored on
  // the interview record — fetch it by studyId.
  const study = await getStudy(interview.studyId);
  if (!study) {
    throw new Error('Study configuration not found for this interview.');
  }

  const response = await fetch('/api/synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      history: interview.transcript,
      studyConfig: study.config,
      behaviorData: interview.behaviorData,
      participantProfile: interview.participantProfile
    })
  });

  if (!response.ok) {
    throw new Error(`Analysis failed (status ${response.status}). Please try again.`);
  }

  const synthesis = (await response.json()) as SynthesisResult;

  // The AI providers swallow errors (e.g. a 503 overload) and return a
  // placeholder synthesis with a sentinel bottomLine instead of failing the
  // request. Detect that so we don't save an empty analysis or claim success.
  // Sentinel matches `defaultSynthesisResult` in src/lib/ai.ts.
  if (!synthesis || synthesis.bottomLine === 'Interview synthesis in progress.') {
    throw new Error('The AI was unavailable (it may be overloaded). Please try again in a moment.');
  }

  // Upsert the SAME interview record (preserve its exact id) with the synthesis.
  const saveResult = await saveCompletedInterview({
    id: interview.id,
    studyId: interview.studyId,
    studyName: interview.studyName,
    participantProfile: interview.participantProfile,
    transcript: interview.transcript,
    synthesis,
    behaviorData: interview.behaviorData,
    createdAt: interview.createdAt
  });

  if (!saveResult.success) {
    throw new Error('Generated the analysis but could not save it. Please try again.');
  }

  return { ...interview, synthesis };
}

// Get all interviews (researcher only)
export async function getAllInterviews(): Promise<StoredInterview[]> {
  try {
    const response = await fetch('/api/interviews');

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.interviews || [];
  } catch (error) {
    console.error('Error fetching interviews:', error);
    return [];
  }
}

// Get single interview by ID
export async function getInterview(id: string): Promise<StoredInterview | null> {
  try {
    const response = await fetch(`/api/interviews/${id}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.interview || null;
  } catch (error) {
    console.error('Error fetching interview:', error);
    return null;
  }
}

// Export all interviews as ZIP
export async function exportAllInterviews(): Promise<Blob | null> {
  try {
    const response = await fetch('/api/interviews/export');

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Error exporting interviews:', error);
    return null;
  }
}

// Get interviews for a specific study
export async function getStudyInterviews(studyId: string): Promise<StoredInterview[]> {
  try {
    const response = await fetch(`/api/interviews?studyId=${encodeURIComponent(studyId)}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.interviews || [];
  } catch (error) {
    console.error('Error fetching study interviews:', error);
    return [];
  }
}

// Get all studies (researcher only)
export async function getAllStudies(): Promise<{ studies: StoredStudy[]; warning?: string }> {
  try {
    const response = await fetch('/api/studies');

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      studies: data.studies || [],
      warning: data.warning
    };
  } catch (error) {
    console.error('Error fetching studies:', error);
    return { studies: [] };
  }
}

// Get single study by ID
export async function getStudy(id: string): Promise<StoredStudy | null> {
  try {
    const response = await fetch(`/api/studies/${id}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.study || null;
  } catch (error) {
    console.error('Error fetching study:', error);
    return null;
  }
}

// Delete study
export async function deleteStudy(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/studies/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting study:', error);
    return { success: false, error: 'Failed to delete study' };
  }
}
