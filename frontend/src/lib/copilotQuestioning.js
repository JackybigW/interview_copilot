export const QUESTION_CUES = [
  '吗',
  '么',
  '什么',
  '为什么',
  'how',
  'what',
  'why',
  'when',
  'tell me',
  '?',
  '？',
];

export function normalizeQuestionText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000,，。！？!?；;:：、]+/g, '');
}

export function buildTranscriptContext({ segments, liveInterviewerText = '', maxSegments = 8 }) {
  const finalLines = segments
    .slice(-maxSegments)
    .map((segment) => `[${segment.speaker}] ${segment.text}`);
  const liveLine = liveInterviewerText.trim()
    ? [`[interviewer] ${liveInterviewerText.trim()}`]
    : [];
  return [...finalLines, ...liveLine].join('\n');
}

export function buildFinalizedInterviewerQuestion(segments) {
  const trailingInterviewerSegments = [];

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.speaker !== 'interviewer') {
      break;
    }
    trailingInterviewerSegments.unshift(segment.text.trim());
  }

  return trailingInterviewerSegments.filter(Boolean).join(' ');
}

export function buildPrefillCandidate(interviewerText) {
  const trimmed = String(interviewerText ?? '').trim();
  if (!trimmed) {
    return '';
  }

  if (normalizeQuestionText(trimmed).length < 8) {
    return '';
  }

  const loweredText = trimmed.toLowerCase();
  if (!QUESTION_CUES.some((cue) => loweredText.includes(cue))) {
    return '';
  }

  return trimmed;
}

export function isStablePrefillCandidate({
  previousCandidate,
  nextCandidate,
  seenCount,
}) {
  if (!previousCandidate || !nextCandidate) {
    return false;
  }

  return (
    normalizeQuestionText(previousCandidate) === normalizeQuestionText(nextCandidate) &&
    seenCount + 1 >= 2
  );
}

export function shouldPromoteFinalQuestion({ prefillQuestion, finalQuestion }) {
  if (!prefillQuestion || !finalQuestion) {
    return false;
  }

  return (
    normalizeQuestionText(prefillQuestion) ===
    normalizeQuestionText(finalQuestion)
  );
}

export function shouldStartPrefillRequest({
  activeQuestion,
  nextQuestion,
  isProcessing,
}) {
  if (!nextQuestion) return false;
  if (!isProcessing) return true;
  return normalizeQuestionText(activeQuestion) !== normalizeQuestionText(nextQuestion);
}

export function shouldRestartPrefillRequest({ prefillQuestion, finalQuestion }) {
  return !shouldPromoteFinalQuestion({ prefillQuestion, finalQuestion });
}

export function extractLatestInterviewerQuestion(transcriptContext) {
  const lines = transcriptContext
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/^\[interviewer\]\s*(.*)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}

export function getStreamingAnswerText(content) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.includes('[NO_QUESTION]')) {
    return '';
  }

  const answerMatch = trimmed.match(/\[ANSWER\]:\s*([\s\S]*)$/);
  if (answerMatch?.[1]) {
    return answerMatch[1].trim();
  }

  return trimmed;
}
