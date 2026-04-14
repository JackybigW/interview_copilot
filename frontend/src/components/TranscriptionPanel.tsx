import { useEffect, useRef } from 'react';
import type {
  InterimTranscriptSegment,
  TranscriptSegment,
} from '@/hooks/useVolcanoSTT';

interface TranscriptionPanelProps {
  segments: TranscriptSegment[];
  interimSegments: InterimTranscriptSegment[];
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

function normalizeTranscriptText(
  text: string,
  fallbackSpeaker: TranscriptSegment['speaker'] | 'live',
) {
  const normalized = text.trim();
  const match = normalized.match(/^\[(user|interviewer)\]\s*/i);

  if (!match) {
    return {
      speaker: fallbackSpeaker,
      text: normalized,
    };
  }

  const mappedSpeaker =
    match[1].toLowerCase() === 'interviewer' ? 'interviewer' : 'user';

  return {
    speaker: mappedSpeaker,
    text: normalized.replace(/^\[(user|interviewer)\]\s*/i, '').trim(),
  };
}

function formatSegmentTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getSpeakerStyles(speaker: TranscriptSegment['speaker']) {
  if (speaker === 'interviewer') {
    return {
      text: 'text-blue-200/90',
      badge: 'bg-blue-500/15 text-blue-300 border border-blue-400/20',
      dot: 'bg-blue-400 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]',
    };
  }

  return {
    text: 'text-emerald-200/90',
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    dot: 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]',
  };
}

function TranscriptRow({
  timestamp,
  text,
  speaker,
  dimmed = false,
  interim = false,
}: {
  timestamp: number;
  text: string;
  speaker: TranscriptSegment['speaker'] | 'live';
  dimmed?: boolean;
  interim?: boolean;
}) {
  const normalized = normalizeTranscriptText(text, speaker);
  const speakerStyles =
    normalized.speaker === 'live'
      ? {
          text: 'text-white/45',
          badge: 'bg-white/5 text-white/40 border border-white/10',
          dot: 'bg-white/30 shadow-[0_0_0_4px_rgba(255,255,255,0.06)]',
        }
      : getSpeakerStyles(normalized.speaker);

  return (
    <div
      className={`group relative grid grid-cols-[80px_20px_minmax(0,1fr)] gap-3 pb-5 ${
        dimmed ? 'opacity-55' : ''
      } ${interim ? 'animate-in fade-in duration-200' : 'animate-in fade-in slide-in-from-bottom-1 duration-300'}`}
    >
      <div className="pt-0.5 text-[11px] font-mono tabular-nums text-white/28">
        {formatSegmentTime(timestamp)}
      </div>

      <div className="relative flex justify-center">
        <div className="absolute top-0 bottom-[-22px] left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/10 via-white/[0.07] to-transparent" />
        <span
          className={`relative mt-1 h-2.5 w-2.5 rounded-full ${speakerStyles.dot} ${
            interim ? 'animate-pulse' : ''
          }`}
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${speakerStyles.badge}`}
          >
            {normalized.speaker === 'live'
              ? 'Live'
              : normalized.speaker === 'interviewer'
                ? 'Interviewer'
                : 'You'}
          </span>
          {interim && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/25">
              streaming
            </span>
          )}
        </div>
        <p
          className={`mt-2 max-w-[56ch] text-[15px] leading-7 ${
            interim ? 'italic' : ''
          } ${speakerStyles.text}`}
        >
          {normalized.text}
        </p>
      </div>
    </div>
  );
}

export default function TranscriptionPanel({
  segments,
  interimSegments,
  isListening,
}: TranscriptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, interimSegments]);

  const showDemo = segments.length === 0 && !isListening;
  const displayedInterims = [...interimSegments].sort(
    (left, right) => left.timestamp - right.timestamp,
  );

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

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-blue-400">Interviewer</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-emerald-400">You</span>
          </span>
          {isListening && (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-medium text-green-400">
                Listening
              </span>
            </span>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.035),transparent_34%)] px-4 py-5 scrollbar-thin"
      >
        <div className="mx-auto max-w-3xl">
          {showDemo && (
            <div className="space-y-5">
              <div className="pb-2 text-center">
                <p className="text-xs text-white/30">
                  Preview - Start the interview to begin real transcription
                </p>
              </div>

              <div className="rounded-[24px] border border-white/[0.05] bg-white/[0.02] px-5 py-5">
                {DEMO_SEGMENTS.map((segment) => (
                  <TranscriptRow
                    key={segment.id}
                    timestamp={segment.timestamp}
                    text={segment.text}
                    speaker={segment.speaker}
                    dimmed
                  />
                ))}

                <div className="mt-2 flex flex-col items-center gap-3 py-5 text-white/25">
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
                  <p className="max-w-xs text-center text-xs leading-5">
                    Microphone captures your voice. Screen share captures the
                    interviewer&apos;s audio from the browser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!showDemo && segments.length > 0 && (
            <div className="rounded-[24px] border border-white/[0.05] bg-white/[0.02] px-5 py-5">
              {segments.map((segment) => (
                <TranscriptRow
                  key={segment.id}
                  timestamp={segment.timestamp}
                  text={segment.text}
                  speaker={segment.speaker}
                />
              ))}
              {displayedInterims.length > 0 ? (
                displayedInterims.map((segment) => (
                  <TranscriptRow
                    key={`interim-${segment.speaker}`}
                    timestamp={segment.timestamp}
                    text={segment.text}
                    speaker={segment.speaker}
                    interim
                  />
                ))
              ) : isListening ? (
                <div className="grid grid-cols-[80px_20px_minmax(0,1fr)] gap-3 pt-1">
                  <div className="pt-0.5 text-[11px] font-mono tabular-nums text-white/18">
                    {formatSegmentTime(Date.now())}
                  </div>
                  <div className="relative flex justify-center">
                    <div className="absolute top-0 bottom-[-10px] left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/8 to-transparent" />
                    <span className="relative mt-1 h-2.5 w-2.5 rounded-full bg-white/30 animate-pulse shadow-[0_0_0_4px_rgba(255,255,255,0.06)]" />
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Live
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/24">
                      Capturing audio
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {isListening && segments.length === 0 && interimSegments.length === 0 && (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[24px] border border-white/[0.05] bg-white/[0.02] text-white/30">
              <div className="mb-4 flex items-end gap-1">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-green-400/60 animate-pulse"
                    style={{
                      height: `${14 + Math.random() * 16}px`,
                      animationDelay: `${i * 120}ms`,
                      animationDuration: `${550 + Math.random() * 220}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/20">
                Waiting for speech
              </p>
            </div>
          )}

          {isListening && segments.length === 0 && interimSegments.length > 0 && (
            <div className="rounded-[24px] border border-white/[0.05] bg-white/[0.02] px-5 py-5">
              {displayedInterims.map((segment) => (
                <TranscriptRow
                  key={`empty-interim-${segment.speaker}`}
                  timestamp={segment.timestamp}
                  text={segment.text}
                  speaker={segment.speaker}
                  interim
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
