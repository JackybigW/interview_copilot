export function extractLatestInterviewerTurn(transcriptContext) {
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

export function extractLastQuestionFromText(text) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return '';
  }

  const questionEnd = Math.max(
    normalizedText.lastIndexOf('?'),
    normalizedText.lastIndexOf('？'),
  );
  if (questionEnd === -1) {
    return '';
  }

  const questionWithPrefix = normalizedText.slice(0, questionEnd + 1);
  const delimiterCandidates = ['，', ',', '。', '.', '；', ';', '！', '!', '\n'];
  let clauseStart = 0;

  delimiterCandidates.forEach((delimiter) => {
    const index = questionWithPrefix.lastIndexOf(delimiter);
    if (index !== -1) {
      clauseStart = Math.max(clauseStart, index + 1);
    }
  });

  return questionWithPrefix.slice(clauseStart).trim();
}

export function extractLatestInterviewerQuestion(transcriptContext) {
  return extractLastQuestionFromText(
    extractLatestInterviewerTurn(transcriptContext),
  );
}

export function getDetectedQuestionText(content) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.includes('[NO_QUESTION]')) {
    return '';
  }

  const questionMatch = trimmed.match(/\[QUESTION\]:\s*([\s\S]*?)(?:\[ANSWER\]:|$)/);
  if (questionMatch?.[1]) {
    return questionMatch[1].trim();
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
