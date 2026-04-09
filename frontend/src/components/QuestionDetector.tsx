import type { DetectedQuestion } from '@/hooks/useInterviewAI';

interface QuestionDetectorProps {
  questions: DetectedQuestion[];
  onSelectQuestion: (id: number) => void;
  selectedId: number | null;
}

export default function QuestionDetector({
  questions,
  onSelectQuestion,
  selectedId,
}: QuestionDetectorProps) {
  if (questions.length === 0) return null;

  return (
    <div className="border-t border-white/[0.06]">
      <div className="px-4 py-2 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Detected Questions ({questions.length})
        </span>
      </div>
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        {questions.map((q, index) => (
          <button
            key={q.id}
            onClick={() => onSelectQuestion(q.id)}
            className={`text-xs px-2.5 py-1 rounded-full transition-all ${
              selectedId === q.id
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/70'
            }`}
          >
            Q{index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}