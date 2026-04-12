export const LIVE_SEGMENT_FINALIZE_MS = 1200;
export const DUPLICATE_SEGMENT_SUPPRESSION_MS = 20_000;

export function canonicalizeTranscriptText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[.,!?;:'"“”‘’，。！？；：、()（）[\]【】<>《》-]/g, '');
}

export function stripCommittedPrefixFromSnapshot(incomingText, committedText) {
  const normalizedIncoming = incomingText.trim();
  if (!normalizedIncoming) return '';

  const normalizedCommitted = committedText.trim();
  if (!normalizedCommitted) return normalizedIncoming;

  const canonicalCommitted = canonicalizeTranscriptText(normalizedCommitted);
  const canonicalIncoming = canonicalizeTranscriptText(normalizedIncoming);

  if (!canonicalCommitted) return normalizedIncoming;
  if (canonicalIncoming === canonicalCommitted) return '';
  if (!canonicalIncoming.startsWith(canonicalCommitted)) return normalizedIncoming;

  for (let index = 0; index <= normalizedIncoming.length; index += 1) {
    const prefix = normalizedIncoming.slice(0, index);
    if (canonicalizeTranscriptText(prefix) === canonicalCommitted) {
      return normalizedIncoming
        .slice(index)
        .replace(/^[\s\u3000,，。！？!?；;:：、.-]+/, '')
        .trim();
    }
  }

  return normalizedIncoming;
}

export function getSpeakersToFinalizeOnIncoming(
  liveTextBySpeaker,
  incomingSpeaker,
) {
  return ['interviewer', 'user'].filter(
    (speaker) =>
      speaker !== incomingSpeaker && Boolean(liveTextBySpeaker[speaker]?.trim()),
  );
}

export function getStaleLiveSpeakers(
  liveTextBySpeaker,
  liveTimestampBySpeaker,
  now,
  finalizeAfterMs = LIVE_SEGMENT_FINALIZE_MS,
) {
  return ['interviewer', 'user'].filter((speaker) => {
    const liveText = liveTextBySpeaker[speaker]?.trim();
    const timestamp = liveTimestampBySpeaker[speaker] || 0;

    return Boolean(liveText) && timestamp > 0 && now - timestamp >= finalizeAfterMs;
  });
}

export function shouldIgnoreIncomingSnapshot({
  speaker,
  incomingText,
  liveTextBySpeaker,
  lastFinalizedBySpeaker,
  now,
  duplicateSuppressionMs = DUPLICATE_SEGMENT_SUPPRESSION_MS,
}) {
  const normalizedIncoming = incomingText.trim();
  if (!normalizedIncoming) return true;
  const canonicalIncoming = canonicalizeTranscriptText(normalizedIncoming);

  const currentLiveText = liveTextBySpeaker[speaker]?.trim() || '';
  if (
    currentLiveText &&
    canonicalizeTranscriptText(currentLiveText) === canonicalIncoming
  ) {
    return true;
  }

  const lastFinalized = lastFinalizedBySpeaker[speaker];
  if (
    !currentLiveText &&
    canonicalizeTranscriptText(lastFinalized?.text || '') === canonicalIncoming &&
    now - (lastFinalized.timestamp || 0) < duplicateSuppressionMs
  ) {
    return true;
  }

  if (
    !currentLiveText &&
    canonicalizeTranscriptText(lastFinalized?.text || '') === canonicalIncoming
  ) {
    return true;
  }

  return false;
}
