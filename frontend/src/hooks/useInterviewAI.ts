import { useState, useRef, useCallback } from 'react';
import { getAPIBaseURL } from '@/lib/config';
import {
  extractLatestInterviewerTurn,
  extractLatestInterviewerQuestion,
  getStreamingAnswerText,
} from '@/lib/copilotQuestioning.js';

export interface DetectedQuestion {
  id: number;
  question: string;
  answer: string;
  isStreaming: boolean;
  timestamp: number;
}

interface UseInterviewAIReturn {
  questions: DetectedQuestion[];
  currentQuestion: string;
  currentAnswer: string;
  isProcessing: boolean;
  /** Set resume/JD concise context and language */
  setContext: (resumeContext: string, jdContext: string, language: string) => void;
  /** Process transcript to detect questions and generate answers via Gemini Flash */
  processTranscript: (fullTranscript: string) => void;
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

  const questionIdRef = useRef(0);
  const lastProcessedQuestionRef = useRef('');
  const isProcessingRef = useRef(false);
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

  /**
   * Process transcript via Gemini Flash streaming to detect questions and generate answers.
   * Uses SSE streaming from the backend for low-latency responses.
   */
  const processTranscript = useCallback(
    (fullTranscript: string) => {
      if (!fullTranscript.trim()) return;
      if (isProcessingRef.current) return;
      if (fullTranscript.trim().length < 10) return;
      const latestInterviewerTurn = extractLatestInterviewerTurn(fullTranscript);
      if (!latestInterviewerTurn) return;
      const latestQuestion = extractLatestInterviewerQuestion(fullTranscript);
      if (!latestQuestion) return;
      if (latestQuestion === lastProcessedQuestionRef.current) return;

      const recentContext = fullTranscript.slice(-2000);
      const { resumeContext, jdContext, language } = contextRef.current;
      const baseUrl = getAPIBaseURL();
      isProcessingRef.current = true;
      setIsProcessing(true);
      setCurrentQuestion(latestQuestion);
      setCurrentAnswer('');

      (async () => {
        try {
          const response = await fetch(`${baseUrl}/api/v1/interview/generate-answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: latestInterviewerTurn,
              resume_context: resumeContext,
              jd_context: jdContext,
              transcript_context: recentContext,
              language,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No reader');

          const decoder = new TextDecoder();
          let streamedContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              if (data.startsWith('[ERROR]')) {
                console.error('Stream error:', data);
                continue;
              }
              streamedContent += data;
              setCurrentAnswer(getStreamingAnswerText(streamedContent));
            }
          }

          const finalAnswer = getStreamingAnswerText(streamedContent);
          if (finalAnswer) {
            lastProcessedQuestionRef.current = latestQuestion;
            const newQuestion: DetectedQuestion = {
              id: questionIdRef.current++,
              question: latestQuestion,
              answer: finalAnswer,
              isStreaming: false,
              timestamp: Date.now(),
            };
            setQuestions((prev) => [...prev, newQuestion]);
          }
        } catch (err) {
          console.error('AI processing error:', err);
        } finally {
          isProcessingRef.current = false;
          setIsProcessing(false);
          setCurrentQuestion('');
          setCurrentAnswer('');
        }
      })();
    },
    [],
  );

  const clearQuestions = useCallback(() => {
    setQuestions([]);
    setCurrentQuestion('');
    setCurrentAnswer('');
    questionIdRef.current = 0;
    lastProcessedQuestionRef.current = '';
    isProcessingRef.current = false;
  }, []);

  return {
    questions,
    currentQuestion,
    currentAnswer,
    isProcessing,
    setContext,
    processTranscript,
    clearQuestions,
  };
}
