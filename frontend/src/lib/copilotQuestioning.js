export const QUESTION_CUES = [
  '为什么',
  '怎么',
  '如何',
  '什么',
  '哪',
  '谁',
  '多少',
  '吗',
  '呢',
  '是否',
  '能否',
  '可以',
  '要不要',
  '请',
  '谈谈',
  '说说',
  'why',
  'how',
  'what',
  'which',
  'who',
  'where',
  'when',
  'can you',
  'could you',
  'would you',
  'do you',
  'is',
  'are',
];

export function normalizeQuestionText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000\p{P}]+/gu, '');
}

function splitQuestionSegments(text) {
  return String(text ?? '')
    .split(/[\n\r]+|(?<=[。！？!?；;])/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function containsQuestionCue(text) {
  const normalized = normalizeQuestionText(text);
  return QUESTION_CUES.some((cue) => normalized.includes(normalizeQuestionText(cue)));
}

function getLatestQuestionSegment(text) {
  const segments = splitQuestionSegments(text);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (containsQuestionCue(segment)) {
      return segment;
    }
  }

  return '';
}

export function buildPrefillCandidate(interviewerText) {
  const latestSegment = getLatestQuestionSegment(interviewerText);
  if (!latestSegment) {
    return '';
  }

  if (normalizeQuestionText(latestSegment).length < 8) {
    return '';
  }

  return latestSegment;
}

export function isStablePrefillCandidate({
  previousCandidate,
  nextCandidate,
  seenCount,
}) {
  return (
    normalizeQuestionText(previousCandidate) ===
      normalizeQuestionText(nextCandidate) &&
    seenCount + 1 >= 2
  );
}

export function shouldPromoteFinalQuestion({ prefillQuestion, finalQuestion }) {
  return (
    normalizeQuestionText(prefillQuestion) ===
    normalizeQuestionText(finalQuestion)
  );
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
