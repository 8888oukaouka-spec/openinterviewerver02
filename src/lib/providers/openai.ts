// OpenAI Provider Implementation
// Server-side only - uses API key from environment

import OpenAI from 'openai';
import {
  AIProvider,
  buildInterviewSystemPrompt,
  cleanJSON,
  defaultInterviewResponse,
  defaultSynthesisResult,
  defaultAggregateSynthesisResult
} from '../ai';
import {
  buildGreetingPrompt,
  getDefaultGreeting,
  buildSynthesisPrompt,
  buildAggregateSynthesisPrompt
} from '../prompts';
import {
  StudyConfig,
  ParticipantProfile,
  InterviewMessage,
  SynthesisResult,
  BehaviorData,
  AIInterviewResponse,
  QuestionProgress,
  AggregateSynthesisResult,
  DEFAULT_OPENAI_MODEL,
  OPENAI_SYNTHESIS_MODEL,
} from '@/types';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private synthesisModel: string;

  constructor(model?: string, apiKey?: string | null) {
    const key = apiKey !== undefined ? (apiKey || undefined) : process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = model ||
      process.env.OPENAI_MODEL ||
      process.env.AI_MODEL ||
      DEFAULT_OPENAI_MODEL;
    this.synthesisModel = OPENAI_SYNTHESIS_MODEL;
  }

  async generateInterviewResponse(
    history: InterviewMessage[],
    studyConfig: StudyConfig,
    participantProfile: ParticipantProfile | null,
    questionProgress: QuestionProgress,
    currentContext: string
  ): Promise<AIInterviewResponse> {
    const systemPrompt = buildInterviewSystemPrompt(
      studyConfig,
      participantProfile,
      questionProgress,
      currentContext
    );

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(h => ({
          role: (h.role === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: h.content
        }))
      ];

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const text = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(cleanJSON(text));

      return {
        message: parsed.message || "That's interesting. Could you tell me more?",
        questionAddressed: parsed.questionAddressed ?? null,
        phaseTransition: parsed.phaseTransition ?? null,
        profileUpdates: parsed.profileUpdates || [],
        shouldConclude: parsed.shouldConclude || false
      };
    } catch (error) {
      console.error('OpenAI interview response error:', error);
      return defaultInterviewResponse;
    }
  }

  async getInterviewGreeting(studyConfig: StudyConfig): Promise<string> {
    const prompt = buildGreetingPrompt(studyConfig);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const text = (response.choices[0]?.message?.content || '').trim()
        .replace(/^["'\\]+|["'\\]+$/g, '');
      return text || getDefaultGreeting(studyConfig);
    } catch (error) {
      console.error('OpenAI greeting error:', error);
      return getDefaultGreeting(studyConfig);
    }
  }

  async synthesizeInterview(
    history: InterviewMessage[],
    studyConfig: StudyConfig,
    behaviorData: BehaviorData,
    participantProfile: ParticipantProfile | null
  ): Promise<SynthesisResult> {
    const prompt = buildSynthesisPrompt(history, studyConfig, behaviorData, participantProfile);

    try {
      const response = await this.client.chat.completions.create({
        model: this.synthesisModel,
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst. Always respond with valid JSON only, no markdown.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const text = response.choices[0]?.message?.content || '{}';
      return JSON.parse(cleanJSON(text)) as SynthesisResult;
    } catch (error) {
      console.error('OpenAI synthesis error:', error);
      return defaultSynthesisResult;
    }
  }

  async synthesizeAggregate(
    studyConfig: StudyConfig,
    syntheses: SynthesisResult[],
    interviewCount: number
  ) {
    const prompt = buildAggregateSynthesisPrompt(studyConfig, syntheses, interviewCount);

    try {
      const response = await this.client.chat.completions.create({
        model: this.synthesisModel,
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst. Always respond with valid JSON only, no markdown.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const text = response.choices[0]?.message?.content || '{}';
      return JSON.parse(cleanJSON(text));
    } catch (error) {
      console.error('OpenAI aggregate synthesis error:', error);
      return defaultAggregateSynthesisResult;
    }
  }

  async generateFollowupStudy(
    parentConfig: StudyConfig,
    synthesis: AggregateSynthesisResult
  ): Promise<{ name: string; researchQuestion: string; coreQuestions: string[] }> {
    const prompt = `You are helping design a follow-up research study.

PARENT STUDY: "${parentConfig.name}"
PARENT SUMMARY: ${synthesis.bottomLine}

KEY FINDINGS:
${synthesis.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

RESEARCH IMPLICATIONS:
${(synthesis.researchImplications || []).map((r, i) => `${i + 1}. ${r}`).join('\n') || 'None specified'}

DIVERGENT VIEWS:
${(synthesis.divergentViews || []).map(d => `- ${d.topic}: "${d.viewA}" vs "${d.viewB}"`).join('\n') || 'None identified'}

Generate a follow-up study that digs deeper into gaps or tensions found.
Return a JSON object with:
- name: A concise study name (start with "Follow-up: ")
- researchQuestion: A specific, researchable question building on the findings
- coreQuestions: 3-5 interview questions to explore this further`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.synthesisModel,
        messages: [
          {
            role: 'system',
            content: 'You are a research designer. Always respond with valid JSON only, no markdown.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const text = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(cleanJSON(text));
      return {
        name: result.name || `Follow-up: ${parentConfig.name}`,
        researchQuestion: result.researchQuestion || synthesis.keyFindings[0] || '',
        coreQuestions: result.coreQuestions || []
      };
    } catch (error) {
      console.error('OpenAI follow-up generation error:', error);
      return {
        name: `Follow-up: ${parentConfig.name}`,
        researchQuestion: `What deeper insights emerge from exploring: ${synthesis.keyFindings[0] || 'the findings'}?`,
        coreQuestions: synthesis.keyFindings.slice(0, 3).map(f =>
          `Can you tell me more about your experience with: ${f}?`
        )
      };
    }
  }
}
