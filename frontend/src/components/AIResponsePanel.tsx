import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedQuestion, ProcessingPhase } from '@/hooks/useInterviewAI';
import { getStreamingAnswerText } from '@/lib/copilotQuestioning.js';

interface AIResponsePanelProps {
  questions: DetectedQuestion[];
  currentQuestion: string;
  currentAnswer: string;
  isProcessing: boolean;
  processingPhase: ProcessingPhase;
}

const DEMO_QUESTION: DetectedQuestion = {
  id: -1,
  question: 'How do you handle state management in large applications?',
  answer:
    'I typically evaluate the complexity of the application first. For simpler apps, React Context with useReducer works well. For larger applications, I prefer using Zustand or Redux Toolkit for predictable state updates. I also separate server state using React Query, which handles caching and synchronization elegantly.',
  isStreaming: false,
  timestamp: Date.now() - 10000,
};

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.03] text-white/20'
          : 'border-white/[0.09] bg-white/[0.05] text-white/65 hover:border-white/15 hover:bg-white/[0.08] hover:text-white'
      }`}
      aria-label={direction === 'prev' ? 'View previous question' : 'View next question'}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {direction === 'prev' ? (
          <>
            <path d="M15 18l-6-6 6-6" />
          </>
        ) : (
          <>
            <path d="M9 18l6-6-6-6" />
          </>
        )}
      </svg>
    </button>
  );
}

export default function AIResponsePanel({
  questions,
  currentQuestion,
  currentAnswer,
  isProcessing,
  processingPhase,
}: AIResponsePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewedIndex, setViewedIndex] = useState(0);

  const hasStreamingQuestion =
    isProcessing && currentQuestion.trim().length > 0;

  const items = useMemo(() => {
    const baseItems = questions.map((question) => ({
      ...question,
      streaming: false,
    }));

    if (hasStreamingQuestion) {
      baseItems.push({
        id: -999_999,
        question: currentQuestion,
        answer: getStreamingAnswerText(currentAnswer),
        isStreaming: true,
        timestamp: Date.now(),
        streaming: true,
      });
    }

    return baseItems;
  }, [currentAnswer, currentQuestion, hasStreamingQuestion, questions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [viewedIndex, items.length]);

  useEffect(() => {
    if (items.length > 0) {
      setViewedIndex(items.length - 1);
    } else {
      setViewedIndex(0);
    }
  }, [items.length]);

  const showDemo = items.length === 0 && !isProcessing;
  const clampedIndex =
    items.length === 0 ? 0 : Math.min(Math.max(viewedIndex, 0), items.length - 1);
  const activeItem = items[clampedIndex];
  const isViewingLatest = items.length > 0 && clampedIndex === items.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-sm font-semibold text-white/90">
            AI Copilot
          </span>
        </div>
        <span className="ml-1 text-[10px] text-white/30">
          Auto-answers when interviewer asks a question
        </span>
        {isProcessing && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
            <span className="text-xs font-medium text-cyan-400">
              {processingPhase === 'prefill' ? 'Prefilling...' : 'Thinking...'}
            </span>
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.07),transparent_36%)] px-4 py-5 scrollbar-thin"
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center">
          {showDemo && (
            <div className="space-y-5">
              <p className="text-center text-xs text-white/30">
                Preview - AI will auto-detect questions and stream answers
              </p>

              <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-6 py-6 opacity-55">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                    <span className="text-[11px] font-bold text-blue-300">Q</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium leading-7 text-blue-200/95">
                      {DEMO_QUESTION.question}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15">
                    <span className="text-[11px] font-bold text-cyan-300">A</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-white/68">
                      {DEMO_QUESTION.answer}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showDemo && activeItem && (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                      <span className="text-[11px] font-bold text-blue-300">Q</span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/25">
                        {activeItem.streaming ? 'Current question' : 'Detected question'}
                      </p>
                      <p className="mt-2 text-base font-medium leading-7 text-blue-200/95">
                        {activeItem.question}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-[11px] font-mono text-white/22">
                    {activeItem.streaming ? 'LIVE' : formatTime(activeItem.timestamp)}
                  </div>
                </div>

                <div className="mt-6 flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      activeItem.streaming
                        ? 'bg-cyan-500/18'
                        : 'bg-cyan-500/12'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-cyan-300">A</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    {activeItem.streaming && (
                      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
                        <span className="flex gap-1">
                          <span className="h-3 w-1 rounded-full bg-cyan-400/60 animate-pulse" />
                          <span
                            className="h-3 w-1 rounded-full bg-cyan-400/80 animate-pulse"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="h-3 w-1 rounded-full bg-cyan-400 animate-pulse"
                            style={{ animationDelay: '300ms' }}
                          />
                        </span>
                        {processingPhase === 'prefill' ? 'Preparing answer' : 'Generating'}
                      </div>
                    )}

                    <p className="min-h-[168px] whitespace-pre-wrap text-[15px] leading-7 text-white/78">
                      {activeItem.answer || (activeItem.streaming ? '...' : 'No answer available.')}
                    </p>
                  </div>
                </div>
              </div>

              {items.length > 1 && (
                <div className="flex items-center justify-between rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <NavButton
                      direction="prev"
                      disabled={clampedIndex === 0}
                      onClick={() => setViewedIndex((prev) => Math.max(prev - 1, 0))}
                    />
                    <NavButton
                      direction="next"
                      disabled={clampedIndex === items.length - 1}
                      onClick={() =>
                        setViewedIndex((prev) => Math.min(prev + 1, items.length - 1))
                      }
                    />
                  </div>

                  <div className="text-xs text-white/38">
                    {clampedIndex + 1} / {items.length}
                  </div>

                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/24">
                    {isViewingLatest ? 'Latest' : 'History'}
                  </div>
                </div>
              )}
            </div>
          )}

          {!showDemo && !activeItem && isProcessing && (
            <div className="rounded-[28px] border border-cyan-500/15 bg-cyan-500/[0.05] px-6 py-6 text-center">
              <p className="text-sm text-cyan-300/80">
                Listening for the latest interviewer question...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
