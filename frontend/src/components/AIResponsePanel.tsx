import { useEffect, useRef } from 'react';
import type { DetectedQuestion } from '@/hooks/useInterviewAI';

interface AIResponsePanelProps {
  questions: DetectedQuestion[];
  currentAnswer: string;
  isProcessing: boolean;
}

const DEMO_QUESTION: DetectedQuestion = {
  id: -1,
  question: 'How do you handle state management in large applications?',
  answer:
    'I typically evaluate the complexity of the application first. For simpler apps, React Context with useReducer works well. For larger applications, I prefer using Zustand or Redux Toolkit for predictable state updates. I also separate server state using React Query, which handles caching and synchronization elegantly.',
  isStreaming: false,
  timestamp: Date.now() - 10000,
};

export default function AIResponsePanel({
  questions,
  currentAnswer,
  isProcessing,
}: AIResponsePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [questions, currentAnswer]);

  const parseStreamingContent = (content: string) => {
    if (content.includes('[NO_QUESTION]')) {
      return null;
    }

    if (content.includes('[ANSWER]')) {
      const answerMatch = content.match(/\[ANSWER\]:\s*([\s\S]*)/);
      if (answerMatch) return answerMatch[1].trim();
    }

    if (content.includes('[QUESTION]')) {
      const afterQuestion = content.split('[QUESTION]')[1] || '';
      return afterQuestion.replace(/^:\s*/, '').trim();
    }

    return content;
  };

  const showDemo = questions.length === 0 && !currentAnswer && !isProcessing;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
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
        <span className="text-[10px] text-white/30 ml-1">
          Auto-answers when interviewer asks a question
        </span>
        {isProcessing && (
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-xs text-cyan-400 font-medium">
              Thinking...
            </span>
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
      >
        {/* Demo preview when idle */}
        {showDemo && (
          <div className="space-y-4">
            <p className="text-xs text-white/30 text-center mb-2">
              Preview — AI will auto-detect questions and stream answers
            </p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 opacity-50">
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-blue-400">Q</span>
                </span>
                <p className="text-sm text-blue-300 font-medium leading-relaxed">
                  {DEMO_QUESTION.question}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-cyan-400">A</span>
                </span>
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                  {DEMO_QUESTION.answer}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 mt-4 text-white/25">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-50"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-xs text-center max-w-xs">
                When the interviewer finishes a question, AI will automatically
                generate a suggested answer in real-time.
              </p>
            </div>
          </div>
        )}

        {/* Real Q&A cards */}
        {questions.map((q) => (
          <div
            key={q.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-blue-400">Q</span>
              </span>
              <p className="text-sm text-blue-300 font-medium leading-relaxed">
                {q.question}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-cyan-400">A</span>
              </span>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                {q.answer}
              </p>
            </div>
            <div className="text-[10px] text-white/20 text-right font-mono">
              {new Date(q.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
          </div>
        ))}

        {currentAnswer && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-0.5">
                <span
                  className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse"
                  style={{ animationDelay: '0ms' }}
                ></span>
                <span
                  className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse"
                  style={{ animationDelay: '150ms' }}
                ></span>
                <span
                  className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse"
                  style={{ animationDelay: '300ms' }}
                ></span>
              </div>
              <span className="text-xs text-cyan-400 font-medium">
                Generating answer...
              </span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
              {parseStreamingContent(currentAnswer) || '...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}