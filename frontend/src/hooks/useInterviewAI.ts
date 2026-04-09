import { useState, useRef, useCallback } from 'react';
import { getAPIBaseURL } from '@/lib/config';

export interface DetectedQuestion {
  id: number;
  question: string;
  answer: string;
  isStreaming: boolean;
  timestamp: number;
}

interface UseInterviewAIReturn {
  questions: DetectedQuestion[];
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
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const questionIdRef = useRef(0);
  const lastProcessedRef = useRef('');
  const processingLockRef = useRef(false);
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

  const parseAndAddQuestion = useCallback((content: string) => {
    if (
      content.includes('[QUESTION]') &&
      content.includes('[ANSWER]')
    ) {
      const questionMatch = content.match(
        /\[QUESTION\]:\s*(.*?)(?:\n|\[ANSWER\])/s,
      );
      const answerMatch = content.match(/\[ANSWER\]:\s*([\s\S]*)/);

      if (questionMatch && answerMatch) {
        const newQuestion: DetectedQuestion = {
          id: questionIdRef.current++,
          question: questionMatch[1].trim(),
          answer: answerMatch[1].trim(),
          isStreaming: false,
          timestamp: Date.now(),
        };
        setQuestions((prev) => [...prev, newQuestion]);
      }
    }
  }, []);

  /**
   * Process transcript via Gemini Flash streaming to detect questions and generate answers.
   * Uses SSE streaming from the backend for low-latency responses.
   */
  const processTranscript = useCallback(
    (fullTranscript: string) => {
      if (!fullTranscript.trim()) return;
      if (fullTranscript === lastProcessedRef.current) return;
      if (processingLockRef.current) return;

      const newText = fullTranscript
        .slice(lastProcessedRef.current.length)
        .trim();
      if (newText.length < 10) return;

      lastProcessedRef.current = fullTranscript;
      processingLockRef.current = true;
      setIsProcessing(true);
      setCurrentAnswer('');

      const recentContext = fullTranscript.slice(-2000);
      const { resumeContext, jdContext, language } = contextRef.current;

      // Use the backend generate-answer endpoint with Gemini Flash streaming
      const baseUrl = getAPIBaseURL();

      (async () => {
        let streamedContent = '';
        try {
          // Build the question detection prompt as the "question"
          const questionPrompt = `Analyze this interview transcript and detect if the interviewer asked a new question. If yes, respond with [QUESTION]: <question> and [ANSWER]: <answer>. If no question, respond with [NO_QUESTION].\n\nTranscript:\n"${recentContext}"`;

          const response = await fetch(`${baseUrl}/api/v1/interview/generate-answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: questionPrompt,
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

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            // Parse SSE data lines
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                if (data.startsWith('[ERROR]')) {
                  console.error('Stream error:', data);
                  continue;
                }
                streamedContent += data;
                setCurrentAnswer(streamedContent);
              }
            }
          }

          // Parse the complete response for question/answer
          parseAndAddQuestion(streamedContent);
        } catch (err) {
          console.error('AI processing error:', err);
        } finally {
          processingLockRef.current = false;
          setIsProcessing(false);
          setCurrentAnswer('');
        }
      })();
    },
    [parseAndAddQuestion],
  );

  const clearQuestions = useCallback(() => {
    setQuestions([]);
    setCurrentAnswer('');
    questionIdRef.current = 0;
    lastProcessedRef.current = '';
  }, []);

  return {
    questions,
    currentAnswer,
    isProcessing,
    setContext,
    processTranscript,
    clearQuestions,
  };
}
