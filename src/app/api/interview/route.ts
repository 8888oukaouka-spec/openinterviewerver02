export const maxDuration = 60;

// POST /api/interview - Generate AI interview response
// Simplified: uses GEMINI_API_KEY directly in standalone mode

import { NextResponse } from 'next/server';
import { getInterviewProvider } from '@/lib/providers';
import {
  StudyConfig,
  ParticipantProfile,
  InterviewMessage,
  QuestionProgress
} from '@/types';

const MAX_HISTORY_MESSAGES = 100;
const MAX_CONTEXT_LENGTH = 10000;
const MAX_MESSAGE_LENGTH = 5000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let {
      history,
      studyConfig,
      participantProfile,
      questionProgress,
      currentContext
    } = body as {
      history: InterviewMessage[];
      studyConfig: StudyConfig;
      participantProfile: ParticipantProfile | null;
      questionProgress: QuestionProgress;
      currentContext: string;
    };

    if (!history || !studyConfig || !questionProgress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Apply payload size limits
    history = history.slice(-MAX_HISTORY_MESSAGES).map(msg => ({
      ...msg,
      content: msg.content?.slice(0, MAX_MESSAGE_LENGTH) || ''
    }));
    currentContext = (currentContext || '').slice(0, MAX_CONTEXT_LENGTH);
    if (participantProfile?.rawContext) {
      participantProfile = {
        ...participantProfile,
        rawContext: participantProfile.rawContext.slice(0, MAX_CONTEXT_LENGTH)
      };
    }

    // Use env var API key directly (standalone mode)
    const provider = getInterviewProvider(studyConfig, {
      geminiApiKey: process.env.GEMINI_API_KEY || null,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    });

    const result = await provider.generateInterviewResponse(
      history,
      studyConfig,
      participantProfile,
      questionProgress,
      currentContext
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Interview API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate interview response' },
      { status: 500 }
    );
  }
}
