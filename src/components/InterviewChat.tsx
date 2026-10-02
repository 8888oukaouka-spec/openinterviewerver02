'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import {
  generateInterviewResponse,
  getInterviewGreeting
} from '@/services/interviewApi';
import { InterviewMessage, InterviewPhase } from '@/types';
import ReactMarkdown from 'react-markdown';
import { Button, Turn } from '@/components/ui';
import NoSessionNotice from '@/components/NoSessionNotice';

// Minimal Web Speech API types — not included in all TypeScript lib.dom versions
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      [index: number]: { readonly transcript: string };
    };
  };
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined)
    ?? (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined)
    ?? null;
}

// Language options for voice input
const SPEECH_LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'zh-TW', label: '中文 (繁體)' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'hi-IN', label: 'हिन्दी' },
] as const;

function pickSpeechLang(): string {
  const browserCode = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  const prefix = browserCode.split('-')[0];
  return SPEECH_LANGS.find(l => l.code.toLowerCase().startsWith(prefix))?.code ?? 'en-US';
}

// Phase display labels
const phaseLabels: Record<InterviewPhase, string> = {
  'background': 'Getting to know you',
  'core-questions': 'Core Questions',
  'exploration': 'Exploring further',
  'feedback': 'Your feedback',
  'wrap-up': 'Wrapping up'
};

const InterviewChat: React.FC = () => {
  const router = useRouter();
  const {
    studyConfig,
    participantProfile,
    questionProgress,
    interviewHistory,
    addMessage,
    setStep,
    isAiThinking,
    setAiThinking,
    contextEntries,
    appendContext,
    setInterviewPhase,
    markQuestionAsked,
    completeInterview,
    updateProfileField,
    setProfileRawContext,
    participantSessionHandle,
    viewMode
  } = useStore();

  const [input, setInput] = useState('');
  const [showFinishOption, setShowFinishOption] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');
  const [speechError, setSpeechError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  const greetingStartedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Check Web Speech API support once on mount
  useEffect(() => {
    const supported = getSpeechRecognitionCtor() !== null;
    setSpeechSupported(supported);
    if (supported) setSpeechLang(pickSpeechLang());
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewHistory, isAiThinking]);

  // Show finish option after background phase
  useEffect(() => {
    if (questionProgress.currentPhase !== 'background') {
      setShowFinishOption(true);
    }
  }, [questionProgress.currentPhase]);

  // Autogrow fallback: `.input-verbatim` sets `field-sizing: content` for
  // browsers that support it. Where that's unsupported, size the textarea
  // from its scrollHeight instead, clamped to the same ~40vh cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const supportsFieldSizing =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');
    if (supportsFieldSizing) return;

    const resize = () => {
      el.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.4;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [input]);

  // Initialize with greeting. The started ref must live outside this effect so a
  // re-run (history length, config identity) cannot cancel an in-flight request
  // and leave Thinking stuck.
  useEffect(() => {
    if (!studyConfig || greetingStartedRef.current || interviewHistory.length > 0) {
      return;
    }

    greetingStartedRef.current = true;
    setInitError(null);
    setAiThinking(true);

    const initialize = async () => {
      try {
        const greeting = await getInterviewGreeting(
          studyConfig,
          viewMode === 'preview',
          participantSessionHandle
        );
        if (!mountedRef.current) return;

        const msg: InterviewMessage = {
          id: `msg-${Date.now()}`,
          role: 'ai',
          content: greeting,
          timestamp: Date.now()
        };
        addMessage(msg);
      } catch (error) {
        console.error('Error initializing interview:', error);
        if (!mountedRef.current) return;
        greetingStartedRef.current = false;
        setInitError('The interviewer could not start. This is not an AI reply — please try again.');
      } finally {
        if (mountedRef.current) setAiThinking(false);
      }
    };

    void initialize();
  }, [studyConfig, interviewHistory.length, participantSessionHandle, viewMode, addMessage, setAiThinking]);

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim() || !studyConfig) return;

    // Add user message
    const userMsg: InterviewMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    addMessage(userMsg);
    setInput('');
    setSendError(null);

    // Also save to context
    appendContext(text, 'text');

    // Generate AI response
    setAiThinking(true);

    try {
      const currentContext = contextEntries.map(e => e.text).join('\n');
      const updatedHistory = [...interviewHistory, userMsg];

      const response = await generateInterviewResponse(
        updatedHistory,
        studyConfig,
        participantProfile,
        questionProgress,
        currentContext,
        viewMode === 'preview',
        participantSessionHandle
      );

      if (!mountedRef.current) return;

      // Handle profile updates
      if (response.profileUpdates && response.profileUpdates.length > 0) {
        response.profileUpdates.forEach(update => {
          updateProfileField(update.fieldId, update.value, update.status);
        });

        // Update raw context with user's background info
        if (questionProgress.currentPhase === 'background') {
          const existingContext = participantProfile?.rawContext || '';
          const newContext = existingContext + (existingContext ? '\n' : '') + text;
          setProfileRawContext(newContext);
        }
      }

      // Handle phase transition
      if (response.phaseTransition) {
        setInterviewPhase(response.phaseTransition);
      }

      // Handle question progress
      if (response.questionAddressed !== null && response.questionAddressed !== undefined) {
        markQuestionAsked(response.questionAddressed);
      }

      // Add AI message
      const aiMsg: InterviewMessage = {
        id: `msg-${Date.now()}`,
        role: 'ai',
        content: response.message,
        timestamp: Date.now()
      };
      addMessage(aiMsg);

      // Handle interview conclusion
      if (response.shouldConclude) {
        completeInterview();
      }
    } catch (error) {
      console.error('Error generating response:', error);
      if (!mountedRef.current) return;
      setSendError('The interviewer could not reply. Please try sending again.');
    } finally {
      if (mountedRef.current) setAiThinking(false);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter alone inserts a newline (default textarea behavior). Only
    // Cmd/Ctrl+Enter sends; the Send button is the other way to send.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isAiThinking && input.trim()) {
        void handleSend();
      }
    }
  };

  const handleRetryGreeting = () => {
    if (!studyConfig || isAiThinking || interviewHistory.length > 0) return;
    greetingStartedRef.current = false;
    setInitError(null);
    greetingStartedRef.current = true;
    setAiThinking(true);
    void (async () => {
      try {
        const greeting = await getInterviewGreeting(
          studyConfig,
          viewMode === 'preview',
          participantSessionHandle
        );
        if (!mountedRef.current) return;
        addMessage({
          id: `msg-${Date.now()}`,
          role: 'ai',
          content: greeting,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error initializing interview:', error);
        if (!mountedRef.current) return;
        greetingStartedRef.current = false;
        setInitError('The interviewer could not start. This is not an AI reply — please try again.');
      } finally {
        if (mountedRef.current) setAiThinking(false);
      }
    })();
  };

  const handleFinishEarly = () => {
    completeInterview();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText('');
  };

  const startListening = () => {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLang;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const word = transcript.trim();
          if (word) {
            setInput(prev => {
              const base = prev.trimEnd();
              return base ? base + ' ' + word : word;
            });
          }
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
      const code = event.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setSpeechError('Microphone access was denied. Please allow microphone permission and try again.');
      } else if (code === 'network') {
        setSpeechError('Speech recognition requires an internet connection and may not work in all regions. Try using Chrome.');
      } else if (code === 'language-not-supported') {
        setSpeechError(`"${speechLang}" is not supported by your browser's speech recognition. Try Chrome, or switch to English.`);
      } else if (code !== 'aborted' && code !== 'no-speech') {
        setSpeechError(`Speech recognition stopped (${code}). For best language support, use Chrome.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setSpeechError(null);
    recognition.start();
    setIsListening(true);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleViewAnalysis = () => {
    setStep('synthesis');
    router.push('/synthesis');
  };

  if (!studyConfig) return <NoSessionNotice />;

  // Calculate progress
  const totalQuestions = studyConfig.coreQuestions.length;
  const questionsCompleted = questionProgress.questionsAsked.length;
  const isComplete = questionProgress.isComplete;

  // Progress display
  const getProgressDisplay = () => {
    if (questionProgress.currentPhase === 'background') {
      return phaseLabels['background'];
    }
    if (questionProgress.currentPhase === 'core-questions') {
      return `Question ${Math.min(questionsCompleted + 1, totalQuestions)} of ${totalQuestions}`;
    }
    return phaseLabels[questionProgress.currentPhase];
  };

  return (
    <div className="flex h-dvh flex-col bg-paper-0">
      {/* Running head */}
      <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-ink-300 bg-paper-0 px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate font-sans text-[15px] font-semibold text-ink-900">{studyConfig.name}</h1>
          <p className="text-[13px] text-ink-500">{getProgressDisplay()}</p>
        </div>

        {showFinishOption && !isComplete && (
          <button
            type="button"
            onClick={handleFinishEarly}
            className="shrink-0 text-[13px] text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
          >
            Finish early
          </button>
        )}
      </header>

      {/* Transcript */}
      {/* `relative` keeps the absolutely-positioned sr-only speaker prefixes inside
          this scroll container — without it they resolve against the body and
          inflate the document's scroll height. */}
      <div role="log" aria-live="polite" className="relative min-h-0 flex-1 overflow-y-auto bg-paper-0">
        <div className="mx-auto max-w-measure space-y-8 px-4 py-8">
          {interviewHistory.map((msg) => (
            <Turn key={msg.id} speaker={msg.role === 'ai' ? 'interviewer' : 'participant'}>
              <span className="sr-only">{msg.role === 'ai' ? 'Interviewer:' : 'You:'} </span>
              <div className="prose-verbatim">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </Turn>
          ))}

          {isAiThinking && (
            <div role="status">
              <div className="h-[2px] overflow-hidden">
                <div className="composing-bar h-full bg-ink-300" />
              </div>
              <p className="mt-2 text-[13px] text-ink-500">Composing a follow-up…</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area or Completion UI */}
      {isComplete ? (
        <div className="border-t border-ink-300 bg-paper-0 px-6 py-8">
          <div className="mx-auto max-w-measure space-y-4 text-center">
            <h3 className="font-sans text-lg font-semibold text-ink-900">
              {viewMode === 'preview' ? 'Preview conversation complete' : 'Interview conversation complete'}
            </h3>
            <p className="text-sm text-ink-500">
              {viewMode === 'preview'
                ? 'Continue to generate the preview analysis. Preview responses will not be added to study data.'
                : 'Your responses have not been saved yet. Continue to finalize and save your interview. Keep this tab open until you see confirmation that it is safe to close.'}
            </p>
            <Button type="button" variant="primary" onClick={handleViewAnalysis} className="mx-auto">
              {viewMode === 'preview' ? 'Continue preview' : 'Continue to save interview'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-ink-300 bg-paper-0 px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-measure space-y-2">
            {(initError || sendError) && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded bg-error px-4 py-3 text-sm text-paper-1"
              >
                <p>{initError || sendError}</p>
                {initError && (
                  <button
                    type="button"
                    onClick={handleRetryGreeting}
                    disabled={isAiThinking}
                    className="shrink-0 text-paper-1 underline underline-offset-2 hover:opacity-90 disabled:opacity-50"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            {/* Speech recognition error */}
            {speechError && (
              <p className="text-[13px] text-error">{speechError}</p>
            )}
            {/* Unified pill input — mirrors Gemini's single-container layout */}
            <div className={`flex items-end gap-3 rounded-2xl border bg-paper-2 px-4 py-3 shadow-sm transition-colors ${isListening ? 'border-error' : 'border-ink-300'}`}>
              {/* Textarea */}
              <div className="flex-1">
                <label htmlFor="interview-response" className="sr-only">
                  Your response
                </label>
                <textarea
                  ref={textareaRef}
                  id="interview-response"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder={isListening ? 'Listening… speak now' : 'Take as much space as you need.'}
                  disabled={isAiThinking}
                  rows={3}
                  className="input-verbatim w-full resize-none bg-transparent text-[17px] leading-[1.6] text-ink-900 placeholder:text-ink-500 focus:outline-none disabled:opacity-50"
                />
                {isListening && interimText && (
                  <p className="mt-1 text-[14px] italic text-ink-400">{interimText}</p>
                )}
              </div>

              {/* Right-side controls — language + mic + send */}
              <div className="flex shrink-0 items-center gap-2 pb-[2px]">

                {/* Language selector — text + chevron, no box */}
                {speechSupported && (
                  <div className="relative flex items-center">
                    <select
                      value={speechLang}
                      onChange={(e) => setSpeechLang(e.target.value)}
                      disabled={isListening || isAiThinking}
                      aria-label="Voice input language"
                      className="appearance-none cursor-pointer bg-transparent pr-4 text-[13px] font-medium text-ink-600 focus:outline-none disabled:opacity-40"
                    >
                      {SPEECH_LANGS.map((lang) => (
                        <option key={lang.code} value={lang.code}>{lang.label}</option>
                      ))}
                    </select>
                    {/* Chevron */}
                    <svg className="pointer-events-none absolute right-0 text-ink-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                )}

                {/* Mic button */}
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={isAiThinking}
                    aria-label={isListening ? 'Stop recording' : 'Start voice input'}
                    aria-pressed={isListening}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      isListening
                        ? 'animate-pulse bg-error text-paper-1'
                        : 'text-ink-600 hover:bg-paper-pop hover:text-ink-900'
                    }`}
                  >
                    {isListening ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="5" y="5" width="14" height="14" rx="2" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="2" width="6" height="12" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                        <line x1="9" y1="21" x2="15" y2="21" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Send button — filled circle with up-arrow */}
                <button
                  type="button"
                  onClick={() => { stopListening(); void handleSend(); }}
                  disabled={!input.trim() || isAiThinking}
                  aria-label="Send"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-paper-1 transition-colors hover:bg-ink-700 disabled:opacity-30"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-[12px] text-ink-500 [@media(pointer:coarse)]:hidden">⌘/Ctrl + Enter to send</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewChat;
