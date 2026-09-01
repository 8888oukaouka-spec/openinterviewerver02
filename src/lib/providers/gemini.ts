import { GoogleGenAI } from '@google/genai';
import type { ProviderJsonSchema } from '../providerSchemas';

// Keywords not supported by Gemini's schema format — strip them silently.
const GEMINI_UNSUPPORTED_KEYWORDS = new Set([
  'additionalProperties',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minItems', 'maxItems',
  'minLength', 'maxLength',
  'pattern', '$schema', '$id', '$ref',
]);

// Converts JSON Schema to Gemini's schema format:
// - strips unsupported keywords (minimum, maxItems, additionalProperties, etc.)
// - converts type: ['x', 'null'] → type: 'x', nullable: true
// - removes null from enum arrays and adds nullable: true
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (GEMINI_UNSUPPORTED_KEYWORDS.has(k)) continue;
    if (k === 'type' && Array.isArray(v)) {
      const nonNull = (v as string[]).filter((t) => t !== 'null');
      out['type'] = nonNull.length === 1 ? nonNull[0] : nonNull;
      if ((v as string[]).includes('null')) out['nullable'] = true;
    } else if (k === 'enum' && Array.isArray(v)) {
      const nonNull = (v as unknown[]).filter((e) => e !== null);
      out['enum'] = nonNull;
      if ((v as unknown[]).includes(null)) out['nullable'] = true;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = toGeminiSchema(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? toGeminiSchema(item as Record<string, unknown>)
          : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}
import {
  AIProvider,
  buildInterviewSystemPrompt,
  cleanJSON,
  type ProviderResult,
} from '../ai';
import {
  buildAggregateSynthesisPrompt,
  buildGreetingPrompt,
  buildSynthesisPrompt,
} from '../prompts';
import {
  type AggregateSynthesisResult,
  type AIInterviewResponse,
  type BehaviorData,
  DEFAULT_GEMINI_MODEL,
  GEMINI_SYNTHESIS_MODEL,
  type InterviewMessage,
  type ParticipantProfile,
  type QuestionProgress,
  type StudyConfig,
  type SynthesisResult,
} from '@/types';
import {
  ProviderFailure,
  ProviderTimeoutError,
  logProviderFailure,
  providerCallError,
  withProviderDeadline,
} from '../providerErrors';
import {
  validateAggregateSynthesisPayload,
  validateFollowupStudy,
  validateInterviewResponse,
  validateSynthesisResult,
  type FollowupStudy,
} from '../providerValidation';
import {
  aggregateSynthesisResponseSchema,
  followupStudyResponseSchema,
  interviewResponseSchema,
  synthesisResponseSchema,
} from '../providerSchemas';
import {
  buildFollowupPrompt,
  execution,
  formatInterviewHistory,
  GREETING_DEADLINE_MS,
  INTERVIEW_DEADLINE_MS,
  providerResult,
  SYNTHESIS_DEADLINE_MS,
  type AggregateSynthesisPayload,
} from './shared';
import { isKnownProviderModel } from '../providerRegistry';

type GeminiThinkingLevel = 'low' | 'high';

export function getGeminiInteractionThinkingLevel(
  enableReasoning?: boolean,
): GeminiThinkingLevel | undefined {
  if (enableReasoning === undefined) return undefined;
  return enableReasoning ? 'high' : 'low';
}

export class GeminiProvider implements AIProvider {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model?: string, apiKey?: string | null) {
    const key = apiKey !== undefined ? (apiKey || undefined) : process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is required');

    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model
      || process.env.GEMINI_MODEL
      || process.env.AI_MODEL
      || DEFAULT_GEMINI_MODEL;
    if (!isKnownProviderModel('gemini', this.model)) {
      throw new Error(`Unsupported Gemini model: ${this.model}`);
    }
  }

  private async createInteraction(options: {
    model: string;
    input: string;
    systemInstruction?: string;
    schema?: ProviderJsonSchema;
    enableReasoning?: boolean;
    deadlineMs: number;
    operation: string;
  }): Promise<{ output_text: string; model: string }> {
    const thinkingLevel = getGeminiInteractionThinkingLevel(options.enableReasoning);

    const thinkingConfig = thinkingLevel !== undefined
      ? { thinkingConfig: { thinkingBudget: thinkingLevel === 'high' ? 8192 : 0 } }
      : {};

    const jsonConfig = options.schema
      ? {
          responseMimeType: 'application/json' as const,
          responseSchema: toGeminiSchema(options.schema as Record<string, unknown>),
        }
      : {};

    try {
      const response = await withProviderDeadline(options.deadlineMs, (_signal) =>
        this.ai.models.generateContent({
          model: options.model,
          contents: options.input,
          config: {
            ...(options.systemInstruction
              ? { systemInstruction: options.systemInstruction }
              : {}),
            ...jsonConfig,
            ...thinkingConfig,
          },
        })
      );
      return { output_text: response.text ?? '', model: options.model };
    } catch (error) {
      if (error instanceof ProviderTimeoutError || error instanceof ProviderFailure) throw error;
      throw providerCallError('gemini', options.operation, error);
    }
  }

  async generateInterviewResponse(
    history: InterviewMessage[],
    studyConfig: StudyConfig,
    participantProfile: ParticipantProfile | null,
    questionProgress: QuestionProgress,
    currentContext: string,
  ): Promise<AIInterviewResponse> {
    const response = await this.createInteraction({
      model: this.model,
      input: formatInterviewHistory(history) || 'PARTICIPANT: Please continue the interview.',
      systemInstruction: buildInterviewSystemPrompt(
        studyConfig,
        participantProfile,
        questionProgress,
        currentContext,
      ),
      schema: interviewResponseSchema,
      enableReasoning: studyConfig.enableReasoning,
      deadlineMs: INTERVIEW_DEADLINE_MS,
      operation: 'interview',
    });

    return this.parseStructured(response.output_text, 'interview', validateInterviewResponse);
  }

  async getInterviewGreeting(studyConfig: StudyConfig): Promise<string> {
    const response = await this.createInteraction({
      model: this.model,
      input: buildGreetingPrompt(studyConfig),
      deadlineMs: GREETING_DEADLINE_MS,
      operation: 'greeting',
    });
    if (!response.output_text?.trim()) {
      throw new ProviderFailure('invalid-response', 'Gemini greeting returned no text');
    }
    return response.output_text;
  }

  async synthesizeInterview(
    history: InterviewMessage[],
    studyConfig: StudyConfig,
    behaviorData: BehaviorData,
    participantProfile: ParticipantProfile | null,
  ): Promise<ProviderResult<SynthesisResult>> {
    const requestedModel = studyConfig.aiSynthesisModel || GEMINI_SYNTHESIS_MODEL;
    const response = await this.createInteraction({
      model: requestedModel,
      input: buildSynthesisPrompt(history, studyConfig, behaviorData, participantProfile),
      schema: synthesisResponseSchema,
      enableReasoning: studyConfig.enableReasoning ?? true,
      deadlineMs: SYNTHESIS_DEADLINE_MS,
      operation: 'synthesis',
    });
    const value = this.parseStructured(response.output_text, 'synthesis', validateSynthesisResult);
    return providerResult(value, execution('gemini', requestedModel, response.model));
  }

  async synthesizeAggregate(
    studyConfig: StudyConfig,
    syntheses: SynthesisResult[],
    interviewCount: number,
  ): Promise<ProviderResult<AggregateSynthesisPayload>> {
    const requestedModel = studyConfig.aiSynthesisModel || GEMINI_SYNTHESIS_MODEL;
    const response = await this.createInteraction({
      model: requestedModel,
      input: buildAggregateSynthesisPrompt(studyConfig, syntheses, interviewCount),
      schema: aggregateSynthesisResponseSchema,
      enableReasoning: studyConfig.enableReasoning ?? true,
      deadlineMs: SYNTHESIS_DEADLINE_MS,
      operation: 'aggregate-synthesis',
    });
    const value = this.parseStructured(
      response.output_text,
      'aggregate-synthesis',
      validateAggregateSynthesisPayload,
    );
    return providerResult(value, execution('gemini', requestedModel, response.model));
  }

  async generateFollowupStudy(
    parentConfig: StudyConfig,
    synthesis: AggregateSynthesisResult,
  ): Promise<ProviderResult<FollowupStudy>> {
    const requestedModel = parentConfig.aiSynthesisModel || GEMINI_SYNTHESIS_MODEL;
    const response = await this.createInteraction({
      model: requestedModel,
      input: buildFollowupPrompt(parentConfig, synthesis),
      schema: followupStudyResponseSchema,
      enableReasoning: parentConfig.enableReasoning ?? true,
      deadlineMs: SYNTHESIS_DEADLINE_MS,
      operation: 'follow-up',
    });
    const value = this.parseStructured(response.output_text, 'follow-up', validateFollowupStudy);
    return providerResult(value, execution('gemini', requestedModel, response.model));
  }

  private parseStructured<T>(
    text: string | undefined,
    operation: string,
    validate: (input: unknown) => T,
  ): T {
    if (!text) {
      throw new ProviderFailure('invalid-response', `Gemini ${operation} returned no text`);
    }
    try {
      return validate(JSON.parse(cleanJSON(text)));
    } catch (error) {
      logProviderFailure('gemini', `${operation}-parse`, error);
      throw new ProviderFailure(
        'invalid-response',
        `Gemini ${operation} returned unparseable or malformed JSON`,
        error,
      );
    }
  }
}
