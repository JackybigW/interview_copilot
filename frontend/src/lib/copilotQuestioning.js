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
