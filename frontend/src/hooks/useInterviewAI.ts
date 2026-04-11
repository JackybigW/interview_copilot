import { useState, useRef, useCallback } from 'react';
import { getAPIBaseURL } from '@/lib/config';
import {
  getStreamingAnswerText,
  normalizeQuestionText,
  shouldRestartPrefillRequest,
  shouldStartPrefillRequest,
} from '@/lib/copilotQuestioning.js';

export interface DetectedQuestion {
  id: number;
  question: string;
  answer: string;
  isStreaming: boolean;
  timestamp: number;
}

export type ProcessingPhase = 'idle' | 'prefill' | 'final';

interface StartProcessingInput {
  question: string;
  transcriptContext: string;
  phase: ProcessingPhase;
  promoteExisting?: boolean;
}

interface UseInterviewAIReturn {
  questions: DetectedQuestion[];
  currentQuestion: string;
  currentAnswer: string;
  isProcessing: boolean;
  processingPhase: ProcessingPhase;
  /** Set resume/JD concise context and language */
  setContext: (resumeContext: string, jdContext: string, language: string) => void;
  startPrefill: (question: string, transcriptContext: string) => void;
  finalizeQuestion: (question: string, transcriptContext: string) => void;
  cancelPrefill: () => void;
  clearQuestions: () => void;
}

/**
 * Hook for AI-powered interview assistance using Gemini Flash streaming.
 * 
 * Uses the backend /generate-answer endpoint which calls Gemini Flash natively
 * for low-latency streaming responses. The context comes from structured
 * extraction (concise_context format).
 */
export function useInterviewAI(): UseInterviewAIReturn {
  const [questions, setQuestions] = useState<DetectedQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle');

  const questionIdRef = useRef(0);
  const lastProcessedRef = useRef('');
  const processingLockRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const activeQuestionRef = useRef('');
  const activePhaseRef = useRef<ProcessingPhase>('idle');
  const currentAnswerRef = useRef('');
  const contextRef = useRef({
    resumeContext: '',
    jdContext: '',
    language: 'en',
  });

  const setContext = useCallback(
    (resumeContext: string, jdContext: string, language: string) => {
      contextRef.current = { resumeContext, jdContext, language };
    },
    [],
  );

  const resetActiveState = useCallback(() => {
    activeQuestionRef.current = '';
    activePhaseRef.current = 'idle';
    currentAnswerRef.current = '';
    setIsProcessing(false);
    setProcessingPhase('idle');
    setCurrentQuestion('');
    setCurrentAnswer('');
  }, []);

  const setDisplayedAnswer = useCallback((answer: string) => {
    currentAnswerRef.current = answer;
    setCurrentAnswer(answer);
  }, []);

  const stopActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    processingLockRef.current = false;
  }, []);

  const streamAnswer = useCallback(
    async ({
      question,
      transcriptContext,
      phase,
      promoteExisting = false,
    }: StartProcessingInput) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion) {
        return;
      }

      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      processingLockRef.current = true;
      activeQuestionRef.current = trimmedQuestion;
      activePhaseRef.current = phase;

      setIsProcessing(true);
      setProcessingPhase(phase);
      setCurrentQuestion(trimmedQuestion);
      const preservedAnswer = promoteExisting ? currentAnswerRef.current : '';
      const initialAnswer =
        phase === 'prefill' && currentAnswerRef.current
          ? currentAnswerRef.current
          : preservedAnswer;
      setDisplayedAnswer(initialAnswer);

      const recentContext = transcriptContext.slice(-2000);
      const { resumeContext, jdContext, language } = contextRef.current;
      const baseUrl = getAPIBaseURL();

      let streamedContent = '';
      let buffer = '';
      let completed = false;

      const consumeLine = (line: string) => {
        if (!line.startsWith('data: ')) {
          return;
        }

        if (generation !== requestGenerationRef.current) {
          return;
        }

        const data = line.slice(6);
        if (data === '[DONE]') {
          return;
        }
        if (data.startsWith('[ERROR]')) {
          console.error('Stream error:', data);
          return;
        }

        streamedContent += data;
        const nextAnswer = getStreamingAnswerText(streamedContent);
        const shouldKeepPromotedAnswerVisible =
          promoteExisting &&
          preservedAnswer &&
          (!nextAnswer ||
            (preservedAnswer.startsWith(nextAnswer) &&
              nextAnswer.length < preservedAnswer.length));

        if (!shouldKeepPromotedAnswerVisible) {
          setDisplayedAnswer(nextAnswer);
        }
      };

      try {
        const response = await fetch(`${baseUrl}/api/v1/interview/generate-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            question: trimmedQuestion,
            resume_context: resumeContext,
            jd_context: jdContext,
            transcript_context: recentContext,
            language,
            request_phase: phase,
            request_generation: generation,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No reader');
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex === -1) {
              break;
            }

            const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
            buffer = buffer.slice(newlineIndex + 1);
            consumeLine(line);
          }
        }

        if (buffer) {
          consumeLine(buffer.replace(/\r$/, ''));
        }

        completed = true;
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('AI processing error:', err);
        }
      } finally {
        if (generation === requestGenerationRef.current) {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }

          processingLockRef.current = false;
          setIsProcessing(false);

          if (!completed) {
            resetActiveState();
          } else if (phase === 'final') {
            const finalAnswer = getStreamingAnswerText(streamedContent);
            const normalizedQuestion = normalizeQuestionText(trimmedQuestion);
            const finalCommitKey = `${normalizedQuestion}::${transcriptContext.trim()}`;

            if (finalAnswer) {
              // Scope dedupe to the same finalized utterance, not every matching question in session history.
              const shouldSkipCommit = lastProcessedRef.current === finalCommitKey;
              const newQuestion: DetectedQuestion = {
                id: questionIdRef.current++,
                question: trimmedQuestion,
                answer: finalAnswer,
                isStreaming: false,
                timestamp: Date.now(),
              };

              setQuestions((previousQuestions) => {
                return shouldSkipCommit
                  ? previousQuestions
                  : [...previousQuestions, newQuestion];
              });
              lastProcessedRef.current = finalCommitKey;
            }

            resetActiveState();
          } else {
            activePhaseRef.current = 'prefill';
            setProcessingPhase('prefill');
          }
        }
      }
    },
    [resetActiveState, setDisplayedAnswer],
  );

  const startPrefill = useCallback(
    (question: string, transcriptContext: string) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion) {
        return;
      }

      const hasActivePrefill =
        processingLockRef.current || activePhaseRef.current === 'prefill';

      if (
        !shouldStartPrefillRequest({
          activeQuestion: activeQuestionRef.current,
          nextQuestion: trimmedQuestion,
          isProcessing: hasActivePrefill,
        })
      ) {
        return;
      }

      stopActiveRequest();
      void streamAnswer({
        question: trimmedQuestion,
        transcriptContext,
        phase: 'prefill',
      });
    },
    [stopActiveRequest, streamAnswer],
  );

  const finalizeQuestion = useCallback(
    (question: string, transcriptContext: string) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion) {
        return;
      }

      const shouldRestart = shouldRestartPrefillRequest({
        prefillQuestion: activeQuestionRef.current,
        finalQuestion: trimmedQuestion,
      });
      const shouldPromoteExisting =
        activePhaseRef.current === 'prefill' && !shouldRestart;

      stopActiveRequest();

      void streamAnswer({
        question: trimmedQuestion,
        transcriptContext,
        phase: 'final',
        promoteExisting: shouldPromoteExisting,
      });
    },
    [stopActiveRequest, streamAnswer],
  );

  const clearQuestions = useCallback(() => {
    stopActiveRequest();
    requestGenerationRef.current += 1;
    setQuestions([]);
    questionIdRef.current = 0;
    lastProcessedRef.current = '';
    resetActiveState();
  }, [resetActiveState, stopActiveRequest]);

  const cancelPrefill = useCallback(() => {
    stopActiveRequest();
    requestGenerationRef.current += 1;
    resetActiveState();
  }, [resetActiveState, stopActiveRequest]);

  return {
    questions,
    currentQuestion,
    currentAnswer,
    isProcessing,
    processingPhase,
    setContext,
    startPrefill,
    finalizeQuestion,
    cancelPrefill,
    clearQuestions,
  };
}
