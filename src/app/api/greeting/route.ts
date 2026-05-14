export const maxDuration = 60;

// POST /api/greeting - Get interview greeting
// Simplified: uses GEMINI_API_KEY directly in standalone mode

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { StudyConfig } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studyConfig } = body as { studyConfig: StudyConfig };

    if (!studyConfig) {
      return NextResponse.json(
        { error: 'Missing required field: studyConfig' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const prompt = `You are starting a research interview for a study called "${studyConfig.name}".
Research question: ${studyConfig.researchQuestion}

Write a warm, natural opening greeting to welcome the participant and start the interview.
Keep it to 2-3 sentences. Be friendly and conversational. Do not use quotes around your response.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = (response.text || '').trim().replace(/^["'\\]+|["'\\]+$/g, '');
    const greeting = text || `Welcome to the ${studyConfig.name} study! I'm glad you're here. Let's start by having you tell me a bit about yourself.`;

    return NextResponse.json({ greeting });
  } catch (error) {
    console.error('Greeting API error:', error);
    // Return a fallback greeting instead of an error
    return NextResponse.json({
      greeting: "Welcome! Thank you for participating in this research study. I'm excited to learn from your experiences. To get started, could you share a bit about yourself?"
    });
  }
}
