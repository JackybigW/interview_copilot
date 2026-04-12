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

const MIN_REWRITE_OVERLAP_CHARS = 6;

function getLongestCanonicalCommonSubstringLength(left, right) {
  let maxLength = 0;
  const dp = Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = right.length; rightIndex >= 1; rightIndex -= 1) {
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        dp[rightIndex] = dp[rightIndex - 1] + 1;
        if (dp[rightIndex] > maxLength) {
          maxLength = dp[rightIndex];
        }
      } else {
        dp[rightIndex] = 0;
      }
    }
  }

  return maxLength;
}

function getCanonicalSuffixPrefixOverlapLength(left, right) {
  const maxOverlap = Math.min(left.length, right.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) {
      return length;
    }
  }

  return 0;
}

// Volcano snapshots are expected to be append-only once earlier speech has been
// committed. Once a segment is committed, later snapshots from the same speaker
// must either continue appending or start a clearly new utterance. If a later
// snapshot still overlaps heavily with committed text but no longer extends it
// as a prefix, we treat it as a rewrite and ignore it to avoid re-injecting
// already committed content back into the UI.
export function stripCommittedPrefixFromSnapshot(text, committedText = '') {
  const normalizedSnapshot = text.trim();
  const normalizedCommitted = committedText.trim();

  if (!normalizedSnapshot) return '';
  if (!normalizedCommitted) return normalizedSnapshot;

  const canonicalCommitted = canonicalizeTranscriptText(normalizedCommitted);
  const canonicalSnapshot = canonicalizeTranscriptText(normalizedSnapshot);
  if (!canonicalCommitted) return normalizedSnapshot;

  for (let index = 0; index <= normalizedSnapshot.length; index += 1) {
    const candidatePrefix = normalizedSnapshot.slice(0, index);
    if (canonicalizeTranscriptText(candidatePrefix) === canonicalCommitted) {
      return normalizedSnapshot.slice(index).trim();
    }
  }

  if (
    canonicalCommitted.includes(canonicalSnapshot) ||
    getLongestCanonicalCommonSubstringLength(
      canonicalCommitted,
      canonicalSnapshot,
    ) >= MIN_REWRITE_OVERLAP_CHARS ||
    getCanonicalSuffixPrefixOverlapLength(canonicalCommitted, canonicalSnapshot) >=
      MIN_REWRITE_OVERLAP_CHARS
  ) {
    return '';
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
  isFinal = false,
  providerFinal = false,
  duplicateSuppressionMs = DUPLICATE_SEGMENT_SUPPRESSION_MS,
}) {
  const normalizedIncoming = incomingText.trim();
  if (!normalizedIncoming) return true;
  const canonicalIncoming = canonicalizeTranscriptText(normalizedIncoming);
  const shouldFinalizeImmediately = shouldFinalizeImmediatelyOnProviderFinal({
    isFinal,
    providerFinal,
  });

  const currentLiveText = liveTextBySpeaker[speaker]?.trim() || '';
  if (
    !shouldFinalizeImmediately &&
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
