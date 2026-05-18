// Research Interview Tool Types

// ============================================
// Interview Phase & Progress Tracking
// ============================================

export type InterviewPhase =
  | 'background'
  | 'core-questions'
  | 'exploration'
  | 'feedback'
  | 'wrap-up';

export interface QuestionProgress {
  questionsAsked: number[];
  total: number;
  currentPhase: InterviewPhase;
  isComplete: boolean;
}

// ============================================
// Profile Schema
// ============================================

export interface ProfileField {
  id: string;
  label: string;
  extractionHint: string;
  required: boolean;
  options?: string[];
}

export type ProfileFieldStatus = 'pending' | 'extracted' | 'vague' | 'refused';

export interface ProfileFieldValue {
  fieldId: string;
  value: string | null;
  status: ProfileFieldStatus;
  extractedAt?: number;
}

export interface ParticipantProfile {
  id: string;
  fields: ProfileFieldValue[];
  rawContext: string;
  timestamp: number;
}

// ============================================
// Study Configuration
// ============================================

export type AIBehavior = 'structured' | 'standard' | 'exploratory';

export type AIProviderType = 'gemini' | 'claude' | 'openai';

// ============================================
// AI Model Configuration
// ============================================

export interface AIModelOption {
  id: string;
  label: string;
  desc: string;
}

// Available Gemini models
export const GEMINI_MODELS: AIModelOption[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Free tier - 1500 req/day' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fast, cost-effective' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Higher quality' },
];

// Available Claude models
export const CLAUDE_MODELS: AIModelOption[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Fastest' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', desc: 'Balanced' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', desc: 'Most capable' },
];

// Available OpenAI models
export const OPENAI_MODELS: AIModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast and cheap (~$0.001/interview)' },
  { id: 'gpt-4o', label: 'GPT-4o', desc: 'Most capable' },
];

// Default models
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

// Synthesis models
export const CLAUDE_SYNTHESIS_MODEL = 'claude-opus-4-5';
export const OPENAI_SYNTHESIS_MODEL = 'gpt-4o';

// Link expiration options
export type LinkExpirationOption = 'never' | '7days' | '30days' | '90days';

export interface StudyConfig {
  id: string;
  name: string;
  description: string;
  researchQuestion: string;
  coreQuestions: string[];
  topicAreas: string[];
  profileSchema: ProfileField[];
  aiBehavior: AIBehavior;
  aiProvider?: AIProviderType;
  aiModel?: string;
  consentText: string;
  createdAt: number;
  parentStudyId?: string;
  parentStudyName?: string;
  generatedFrom?: 'synthesis' | 'manual';
  linksEnabled?: boolean;
  linkExpiration?: LinkExpirationOption;
  enableReasoning?: boolean;
}

// ============================================
// Interview Messages
// ============================================

export interface InterviewMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: number;
}

// ============================================
// Behavior & Analysis Data
// ============================================

export interface BehaviorData {
  timePerTopic: Record<string, number>;
  messagesPerTopic: Record<string, number>;
  topicsExplored: string[];
  contradictions: string[];
}

export interface SynthesisResult {
  statedPreferences: string[];
  revealedPreferences: string[];
  themes: { theme: string; evidence: string; frequency: number }[];
  contradictions: string[];
  keyInsights: string[];
  bottomLine: string;
}

// ============================================
// App State
// ============================================

export type AppStep =
  | 'setup'
  | 'consent'
  | 'interview'
  | 'synthesis'
  | 'export';

export type ViewMode = 'researcher' | 'participant';

export interface ContextEntry {
  id: string;
  text: string;
  source: 'text' | 'system';
  timestamp: number;
}

// ============================================
// AI Response Structure
// ============================================

export interface AIInterviewResponse {
  message: string;
  questionAddressed: number | null;
  phaseTransition: InterviewPhase | null;
  profileUpdates: {
    fieldId: string;
    value: string | null;
    status: 'extracted' | 'vague' | 'refused';
  }[];
  shouldConclude: boolean;
}

// ============================================
// Stored Interview (Vercel KV)
// ============================================

export interface StoredInterview {
  id: string;
  studyId: string;
  studyName: string;
  participantProfile: ParticipantProfile;
  transcript: InterviewMessage[];
  synthesis: SynthesisResult | null;
  behaviorData: BehaviorData;
  createdAt: number;
  completedAt: number;
  status: 'in_progress' | 'completed';
}

// ============================================
// Participant Token (URL)
// ============================================

export interface ParticipantToken {
  studyId: string;
  studyConfig: StudyConfig;
  createdAt: number;
  expiresAt?: number;
  researcherId?: string;
}

// ============================================
// Researcher Account (Hosted Mode)
// ============================================

export interface ResearcherAccount {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  oauthProvider: 'google' | 'github';
  oauthId: string;
  createdAt: number;
  lastLoginAt: number;
  onboardingComplete: boolean;
  encryptedRedisUrl: string | null;
  encryptedRedisToken: string | null;
  encryptedGeminiApiKey: string | null;
  encryptedAnthropicApiKey: string | null;
  redisConfiguredAt: number | null;
}

export interface ResearcherProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  onboardingComplete: boolean;
  hasRedisConfigured: boolean;
  hasGeminiKey: boolean;
  hasAnthropicKey: boolean;
}

// ============================================
// Stored Study (Vercel KV)
// ============================================

export interface StoredStudy {
  id: string;
  config: StudyConfig;
  createdAt: number;
  updatedAt: number;
  interviewCount: number;
  isLocked: boolean;
}

// ============================================
// Aggregate Synthesis
// ============================================

export interface AggregateSynthesisResult {
  studyId: string;
  interviewCount: number;
  commonThemes: { theme: string; frequency: number; representativeQuotes: string[] }[];
  divergentViews: { topic: string; viewA: string; viewB: string }[];
  keyFindings: string[];
  researchImplications: string[];
  bottomLine: string;
  generatedAt: number;
}
