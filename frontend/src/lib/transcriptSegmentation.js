export const LIVE_SEGMENT_FINALIZE_MS = 300;
export const DUPLICATE_SEGMENT_SUPPRESSION_MS = 20_000;

export function shouldFinalizeImmediatelyOnProviderFinal({
  isFinal,
  providerFinal,
}) {
  return Boolean(isFinal && providerFinal);
}

export function getFinalizeDelayMs() {
  return LIVE_SEGMENT_FINALIZE_MS;
}

export function stripCommittedPrefixFromSnapshot(text, committedText = '') {
  const normalizedSnapshot = text.trim();
  const normalizedCommitted = committedText.trim();

  if (!normalizedSnapshot) return '';
  if (!normalizedCommitted) return normalizedSnapshot;

  const canonicalCommitted = canonicalizeTranscriptText(normalizedCommitted);
  if (!canonicalCommitted) return normalizedSnapshot;

  for (let index = 0; index <= normalizedSnapshot.length; index += 1) {
    const candidatePrefix = normalizedSnapshot.slice(0, index);
    if (canonicalizeTranscriptText(candidatePrefix) === canonicalCommitted) {
      return normalizedSnapshot.slice(index).trim();
    }
  }

  return normalizedSnapshot;
}

export function canonicalizeTranscriptText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[.,!?;:'"“”‘’，。！？；：、()（）[\]【】<>《》-]/g, '');
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
