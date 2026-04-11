import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useVolcanoSTT } from '@/hooks/useVolcanoSTT';
import { useInterviewAI } from '@/hooks/useInterviewAI';
import TranscriptionPanel from '@/components/TranscriptionPanel';
import AIResponsePanel from '@/components/AIResponsePanel';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import {
  buildPrefillCandidate,
  buildTranscriptContext,
  isStablePrefillCandidate,
  normalizeQuestionText,
} from '@/lib/copilotQuestioning.js';

export default function Interview() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = (location.state as {
    resumeContext?: string;
    jdContext?: string;
    language?: string;
    viewOnly?: boolean;
  }) || {};

  const {
    isListening,
    interimSegments,
    segments,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error,
    hasSystemAudio,
  } = useVolcanoSTT();

  const {
    questions,
    currentQuestion,
    currentAnswer,
    isProcessing,
    setContext,
    startPrefill,
    finalizeQuestion,
    cancelPrefill,
    clearQuestions,
  } = useInterviewAI();

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProcessedSegmentIdRef = useRef(-1);
  const prefillCandidateRef = useRef({ question: '', seenCount: 0 });

  // Set AI context from state
  useEffect(() => {
    setContext(
      state.resumeContext || '',
      state.jdContext || '',
      state.language || 'en',
    );
  }, [state.resumeContext, state.jdContext, state.language, setContext]);

  // Timer
  useEffect(() => {
    if (isListening) {
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isListening]);

  // Start low-latency prefill once the same interviewer live question is seen twice.
  useEffect(() => {
    if (!isListening) {
      prefillCandidateRef.current = { question: '', seenCount: 0 };
      return;
    }

    const latestInterim = [...interimSegments]
      .reverse()
      .find((segment) => segment.speaker === 'interviewer');
    const nextCandidate = buildPrefillCandidate(latestInterim?.text || '');

    if (!nextCandidate) {
      prefillCandidateRef.current = { question: '', seenCount: 0 };
      return;
    }

    const previousQuestion = prefillCandidateRef.current.question;
    const seenCount =
      previousQuestion &&
      normalizeQuestionText(previousQuestion) === normalizeQuestionText(nextCandidate)
        ? prefillCandidateRef.current.seenCount
        : 0;

    if (
      isStablePrefillCandidate({
        previousCandidate: previousQuestion,
        nextCandidate,
        seenCount,
      })
    ) {
      startPrefill(
        nextCandidate,
        buildTranscriptContext({
          segments,
          liveInterviewerText: latestInterim?.text || '',
        }),
      );
    }

    prefillCandidateRef.current = {
      question: nextCandidate,
      seenCount: seenCount + 1,
    };
  }, [interimSegments, isListening, segments, startPrefill]);

  useEffect(() => {
    if (!isListening) return;

    const lastInterviewerSegment = [...segments]
      .reverse()
      .find((segment) => segment.speaker === 'interviewer');
    if (!lastInterviewerSegment) return;
    if (lastInterviewerSegment.id <= lastProcessedSegmentIdRef.current) {
      return;
    }

    lastProcessedSegmentIdRef.current = lastInterviewerSegment.id;
    finalizeQuestion(
      lastInterviewerSegment.text,
      buildTranscriptContext({
        segments: segments.slice(Math.max(0, segments.length - 8)),
      }),
    );
  }, [finalizeQuestion, isListening, segments]);

  const handleStart = useCallback(() => {
    setElapsed(0);
    startListening(state.language || 'zh');

    // Update session status
    if (id) {
      client.apiCall.invoke({
        url: `/api/v1/interview/sessions/${id}`,
        method: 'PUT',
        data: { status: 'active' },
      }).catch(console.error);
    }
  }, [startListening, state.language, id]);

  const handleStop = useCallback(() => {
    stopListening();

    // Save session data
    if (id) {
      client.apiCall.invoke({
        url: `/api/v1/interview/sessions/${id}`,
        method: 'PUT',
        data: {
          status: 'completed',
          duration: elapsed,
          transcript: JSON.stringify(
            segments.map((s) => ({
              text: s.text,
              speaker: s.speaker,
              timestamp: s.timestamp,
            })),
          ),
          ai_responses: JSON.stringify(
            questions.map((q) => ({
              question: q.question,
              answer: q.answer,
              timestamp: q.timestamp,
            })),
          ),
        },
      }).catch(console.error);
    }
  }, [stopListening, id, elapsed, segments, questions]);

  const handleReset = useCallback(() => {
    stopListening();
    resetTranscript();
    clearQuestions();
    cancelPrefill();
    setElapsed(0);
    lastProcessedSegmentIdRef.current = -1;
    prefillCandidateRef.current = { question: '', seenCount: 0 };
  }, [stopListening, resetTranscript, clearQuestions, cancelPrefill]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Interview Copilot</h1>
            <p className="text-[10px] text-white/40 -mt-0.5">
              Gemini Flash · {state.language === 'zh' ? '中文' : state.language === 'mixed' ? '中英混合' : 'English'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Context indicators */}
          {state.resumeContext && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              <span className="text-[10px] text-purple-400 font-medium">Resume</span>
            </div>
          )}
          {state.jdContext && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              <span className="text-[10px] text-cyan-400 font-medium">JD</span>
            </div>
          )}
          {isListening && hasSystemAudio && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              <span className="text-[10px] text-blue-400 font-medium">System Audio</span>
            </div>
          )}
          {isListening && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-green-400 font-medium">LIVE</span>
            </div>
          )}
          <div className="text-xs text-white/30 font-mono">{questions.length} Q&A</div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Transcription */}
        <div className="w-1/2 border-r border-white/[0.06] flex flex-col">
          <div className="flex-1 overflow-hidden">
            <TranscriptionPanel
              segments={segments}
              interimSegments={interimSegments}
              isListening={isListening}
            />
          </div>
        </div>

        {/* Right Panel - AI Response */}
        <div className="w-1/2 flex flex-col">
          <AIResponsePanel
            questions={questions}
            currentQuestion={currentQuestion}
            currentAnswer={currentAnswer}
            isProcessing={isProcessing}
          />
        </div>
      </div>

      {/* Control Bar */}
      <div className="border-t border-white/[0.06] bg-black/40 backdrop-blur-sm">
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {!isListening ? (
              <Button
                onClick={handleStart}
                disabled={!isSupported}
                className="bg-green-500 hover:bg-green-600 text-white rounded-full px-6 h-9 text-sm font-medium shadow-lg shadow-green-500/20 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                Start Interview
              </Button>
            ) : (
              <Button
                onClick={handleStop}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full px-6 h-9 text-sm font-medium shadow-lg shadow-red-500/20 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="mr-1.5">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop
              </Button>
            )}

            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-full px-4 h-9 text-sm border-white/10 text-white/60 hover:text-white hover:bg-white/10 !bg-transparent"
            >
              Reset
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {isProcessing && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-xs text-cyan-400">AI Processing</span>
              </span>
            )}

            <div className="font-mono text-lg text-white/70 tabular-nums tracking-wider">
              {formatTime(elapsed)}
            </div>

            {isListening && (
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className="w-0.5 bg-green-400 rounded-full animate-pulse"
                    style={{
                      height: `${8 + Math.random() * 12}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: `${400 + Math.random() * 300}ms`,
                    }}
                  ></span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
