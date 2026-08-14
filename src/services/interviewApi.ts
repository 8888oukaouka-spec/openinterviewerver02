// Client-side service that calls API routes
// API keys are kept server-side - this file runs in the browser

import {
  StudyConfig,
  ParticipantProfile,
  InterviewMessage,
  SynthesisResult,
  BehaviorData,
  AIInterviewResponse,
  QuestionProgress
} from '@/types';

// Participant authority is a short-lived HttpOnly same-site cookie. Share-link
// codes and session credentials are never exposed to this JavaScript service.
const buildHeaders = (
  researcherPreview = false,
  participantSessionHandle?: string | null
): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(researcherPreview ? { 'X-OpenInterviewer-Preview': '1' } : {}),
  ...(!researcherPreview && participantSessionHandle
    ? { 'X-OpenInterviewer-Participant-Session': participantSessionHandle }
    : {}),
});

// Generate AI interviewer response
export const generateInterviewResponse = async (
  history: InterviewMessage[],
  studyConfig: StudyConfig,
  participantProfile: ParticipantProfile | null,
  questionProgress: QuestionProgress,
  currentContext: string,
  researcherPreview = false,
  participantSessionHandle?: string | null
): Promise<AIInterviewResponse> => {
  try {
    const response = await fetch('/api/interview', {
      method: 'POST',
      headers: buildHeaders(researcherPreview, participantSessionHandle),
      body: JSON.stringify({
        history,
        studyConfig,
        participantProfile,
        questionProgress,
        currentContext
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating interview response:', error);
    throw error;
  }
};

// Get initial interview greeting
export const getInterviewGreeting = async (
  studyConfig: StudyConfig,
  researcherPreview = false,
  participantSessionHandle?: string | null
): Promise<string> => {
  try {
    const response = await fetch('/api/greeting', {
      method: 'POST',
      headers: buildHeaders(researcherPreview, participantSessionHandle),
      body: JSON.stringify({ studyConfig })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.greeting;
  } catch (error) {
    console.error('Error getting interview greeting:', error);
    throw error;
  }
};

// Synthesize interview patterns
export const synthesizeInterview = async (
  history: InterviewMessage[],
  studyConfig: StudyConfig,
  behaviorData: BehaviorData,
  participantProfile: ParticipantProfile | null,
  researcherPreview = false,
  participantSessionHandle?: string | null
): Promise<SynthesisResult> => {
  try {
    const response = await fetch('/api/synthesis', {
      method: 'POST',
      headers: buildHeaders(researcherPreview, participantSessionHandle),
      body: JSON.stringify({
        history,
        studyConfig,
        behaviorData,
        participantProfile
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error synthesizing interview:', error);
    throw error;
  }
};
