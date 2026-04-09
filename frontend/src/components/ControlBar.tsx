import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface ControlBarProps {
  isListening: boolean;
  isProcessing: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  error: string | null;
  isSupported: boolean;
}

export default function ControlBar({
  isListening,
  isProcessing,
  onStart,
  onStop,
  onReset,
  error,
  isSupported,
}: ControlBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isListening) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isListening]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setElapsed(0);
    onStart();
  };

  const handleStop = () => {
    onStop();
  };

  const handleReset = () => {
    setElapsed(0);
    onReset();
  };

  return (
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
            className="rounded-full px-4 h-9 text-sm border-white/10 text-white/60 hover:text-white hover:bg-white/10 bg-transparent"
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
  );
}