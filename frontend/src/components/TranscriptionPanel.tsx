import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '@/hooks/useSpeechRecognition';

interface TranscriptionPanelProps {
  segments: TranscriptSegment[];
  interimTranscript: string;
  isListening: boolean;
}

const DEMO_SEGMENTS: TranscriptSegment[] = [
  {
    id: -1,
    text: 'Tell me about your experience with React and TypeScript.',
    timestamp: Date.now() - 30000,
    isFinal: true,
    speaker: 'interviewer',
  },
  {
    id: -2,
    text: "I've been working with React for over 3 years, building complex SPAs...",
    timestamp: Date.now() - 25000,
    isFinal: true,
    speaker: 'user',
  },
  {
    id: -3,
    text: 'How do you handle state management in large applications?',
    timestamp: Date.now() - 15000,
    isFinal: true,
    speaker: 'interviewer',
  },
];

export default function TranscriptionPanel({
  segments,
  interimTranscript,
  isListening,
}: TranscriptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, interimTranscript]);

  const displaySegments = segments.length > 0 ? segments : [];
  const showDemo = segments.length === 0 && !isListening;

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
            className="text-purple-400"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span className="text-sm font-semibold text-white/90">
            Live Transcription
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-[10px] text-blue-400">Interviewer</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[10px] text-emerald-400">You</span>
          </span>
          {isListening && (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-green-400 font-medium">
                Listening
              </span>
            </span>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin"
      >
        {/* Demo preview when idle */}
        {showDemo && (
          <div className="space-y-3">
            <div className="text-center mb-4">
              <p className="text-xs text-white/30 mb-3">
                Preview — Start the interview to begin real transcription
              </p>
            </div>
            {DEMO_SEGMENTS.map((segment) => {
              const isInterviewer = segment.speaker === 'interviewer';
              return (
                <div
                  key={segment.id}
                  className={`text-sm leading-relaxed flex items-start gap-2 opacity-50 ${
                    isInterviewer ? 'text-blue-300/90' : 'text-emerald-300/90'
                  }`}
                >
                  <span className="text-white/20 text-xs font-mono shrink-0 mt-0.5">
                    {new Date(segment.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                      isInterviewer
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isInterviewer ? 'Interviewer' : 'You'}
                  </span>
                  <span>{segment.text}</span>
                </div>
              );
            })}
            <div className="flex flex-col items-center gap-2 mt-6 text-white/25">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-50"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <p className="text-xs text-center max-w-xs">
                Microphone captures your voice. Screen share captures the
                interviewer&apos;s audio from the browser.
              </p>
            </div>
          </div>
        )}

        {/* Real segments */}
        {displaySegments.map((segment) => {
          const isInterviewer = segment.speaker === 'interviewer';
          return (
            <div
              key={segment.id}
              className={`text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-300 flex items-start gap-2 ${
                isInterviewer ? 'text-blue-300/90' : 'text-emerald-300/90'
              }`}
            >
              <span className="text-white/30 text-xs font-mono shrink-0 mt-0.5">
                {new Date(segment.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                  isInterviewer
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isInterviewer ? 'Interviewer' : 'You'}
              </span>
              <span>{segment.text}</span>
            </div>
          );
        })}

        {/* Listening empty state */}
        {isListening && segments.length === 0 && !interimTranscript && (
          <div className="flex flex-col items-center justify-center h-32 text-white/30 gap-2">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="w-0.5 bg-green-400/60 rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 12}px`,
                    animationDelay: `${i * 100}ms`,
                    animationDuration: `${400 + Math.random() * 300}ms`,
                  }}
                ></span>
              ))}
            </div>
            <p className="text-xs">Waiting for speech...</p>
          </div>
        )}

        {interimTranscript && (
          <div className="text-sm text-white/40 italic leading-relaxed flex items-start gap-2">
            <span className="text-white/20 text-xs font-mono shrink-0 mt-0.5">
              {new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 bg-white/5 text-white/30 border border-white/10">
              ...
            </span>
            <span>{interimTranscript}</span>
          </div>
        )}
      </div>
    </div>
  );
}