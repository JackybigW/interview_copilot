import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeTranscriptText,
  DUPLICATE_SEGMENT_SUPPRESSION_MS,
  getSpeakersToFinalizeOnIncoming,
  getSpeakersToFinalizeOnStableIncoming,
  getFinalizeDelayMs,
  getStaleLiveSpeakers,
  LIVE_SEGMENT_FINALIZE_MS,
  shouldFinalizeLiveTextOnSpeakerSwitch,
  stripCommittedPrefixFromSnapshot,
  shouldFinalizeImmediatelyOnProviderFinal,
  shouldIgnoreIncomingSnapshot,
} from './transcriptSegmentation.js';

test('finalizes the previous speaker when the other speaker starts talking', () => {
  const liveTextBySpeaker = {
    user: 'My biggest strength is execution.',
    interviewer: '',
  };

  assert.deepEqual(
    getSpeakersToFinalizeOnIncoming(liveTextBySpeaker, 'interviewer'),
    ['user'],
  );
});

test('does not finalize anything when the same speaker keeps talking', () => {
  const liveTextBySpeaker = {
    user: '',
    interviewer: 'What is your biggest weakness?',
  };

  assert.deepEqual(
    getSpeakersToFinalizeOnIncoming(liveTextBySpeaker, 'interviewer'),
    [],
  );
});

test('does not finalize the previous speaker when the new speaker only has a tiny chunk', () => {
  assert.deepEqual(
    getSpeakersToFinalizeOnStableIncoming({
      liveTextBySpeaker: {
        user: '',
        interviewer: '你最大的缺点是什么',
      },
      incomingSpeaker: 'user',
      incomingText: '嗯',
    }),
    [],
  );
});

test('finalizes the previous speaker when the new speaker has a stable utterance', () => {
  assert.deepEqual(
    getSpeakersToFinalizeOnStableIncoming({
      liveTextBySpeaker: {
        user: '',
        interviewer: '你最大的缺点是什么',
      },
      incomingSpeaker: 'user',
      incomingText: 'ok 目前识别没什么问题',
    }),
    ['interviewer'],
  );
});

test('does not switch-finalize an incomplete interviewer lead-in', () => {
  assert.equal(
    shouldFinalizeLiveTextOnSpeakerSwitch({
      speaker: 'interviewer',
      liveText: '开始聊题，第一个',
    }),
    false,
  );
});

test('switch-finalizes a question-like interviewer utterance without punctuation', () => {
  assert.equal(
    shouldFinalizeLiveTextOnSpeakerSwitch({
      speaker: 'interviewer',
      liveText: '你最大的缺点是什么',
    }),
    true,
  );
});

test('finalizes a stale live transcript after inactivity', () => {
  const liveTextBySpeaker = {
    user: '',
    interviewer: 'Tell me about a time you led a project.',
  };
  const liveTimestampBySpeaker = {
    user: 0,
    interviewer: 10_000,
  };

  assert.deepEqual(
    getStaleLiveSpeakers(
      liveTextBySpeaker,
      liveTimestampBySpeaker,
      10_000 + LIVE_SEGMENT_FINALIZE_MS + 1,
    ),
    ['interviewer'],
  );
});

test('ignores an incoming snapshot that exactly matches the recent finalized text', () => {
  assert.equal(
    shouldIgnoreIncomingSnapshot({
      speaker: 'user',
      incomingText: '面试官，您好，我在等你的问题。',
      liveTextBySpeaker: {
        user: '',
        interviewer: '',
      },
      lastFinalizedBySpeaker: {
        user: {
          text: '面试官，您好，我在等你的问题。',
          timestamp: 20_000,
        },
        interviewer: {
          text: '',
          timestamp: 0,
        },
      },
      now: 20_000 + DUPLICATE_SEGMENT_SUPPRESSION_MS - 1,
    }),
    true,
  );
});

test('does not ignore an incoming snapshot when it extends the current live text', () => {
  assert.equal(
    shouldIgnoreIncomingSnapshot({
      speaker: 'interviewer',
      incomingText: '你最大的缺点是什么？',
      liveTextBySpeaker: {
        user: '',
        interviewer: '你最大的缺点',
      },
      lastFinalizedBySpeaker: {
        user: {
          text: '',
          timestamp: 0,
        },
        interviewer: {
          text: '',
          timestamp: 0,
        },
      },
      now: 30_000,
    }),
    false,
  );
});

test('does not ignore a provider-final snapshot when it matches the current live text', () => {
  assert.equal(
    shouldIgnoreIncomingSnapshot({
      speaker: 'interviewer',
      incomingText: '你最大的缺点是什么？',
      liveTextBySpeaker: {
        user: '',
        interviewer: '你最大的缺点是什么？',
      },
      lastFinalizedBySpeaker: {
        user: {
          text: '',
          timestamp: 0,
        },
        interviewer: {
          text: '',
          timestamp: 0,
        },
      },
      now: 30_000,
      isFinal: true,
      providerFinal: true,
    }),
    false,
  );
});

test('canonicalizes punctuation so spoken duplicates do not reappear', () => {
  assert.equal(
    canonicalizeTranscriptText('你好，面试官等你的问题。'),
    canonicalizeTranscriptText('你好 面试官等你的问题'),
  );
});

test('provider final chunks finalize immediately', () => {
  assert.equal(
    shouldFinalizeImmediatelyOnProviderFinal({
      isFinal: true,
      providerFinal: true,
    }),
    true,
  );
});

test('provider final is required when the local chunk is final', () => {
  assert.equal(
    shouldFinalizeImmediatelyOnProviderFinal({
      isFinal: true,
      providerFinal: false,
    }),
    false,
  );
});

test('provider final is required when the local chunk is not final', () => {
  assert.equal(
    shouldFinalizeImmediatelyOnProviderFinal({
      isFinal: false,
      providerFinal: true,
    }),
    false,
  );
});

test('provider final beats local inactivity fallback', () => {
  assert.equal(
    shouldFinalizeImmediatelyOnProviderFinal({
      isFinal: true,
      providerFinal: true,
    }),
    true,
  );
  assert.equal(getFinalizeDelayMs(), 300);
});

test('ignores a repeated finalized utterance even after the short suppression window', () => {
  assert.equal(
    shouldIgnoreIncomingSnapshot({
      speaker: 'interviewer',
      incomingText: '设计逻辑啊，咱开始聊题，第一个，你最大的缺点是什么？哈哈。',
      liveTextBySpeaker: {
        user: '',
        interviewer: '',
      },
      lastFinalizedBySpeaker: {
        user: {
          text: '',
          timestamp: 0,
        },
        interviewer: {
          text: '设计逻辑啊咱开始聊题第一个你最大的缺点是什么哈哈',
          timestamp: 10_000,
        },
      },
      now: 10_000 + DUPLICATE_SEGMENT_SUPPRESSION_MS + 10_000,
    }),
    true,
  );
});

test('strips the committed prefix from cumulative snapshots', () => {
  assert.equal(
    stripCommittedPrefixFromSnapshot(
      '你好 面试官等你的问题 我最大的优点是执行力强',
      '你好，面试官等你的问题。',
    ),
    '我最大的优点是执行力强',
  );
  assert.equal(LIVE_SEGMENT_FINALIZE_MS, 300);
});

test('keeps the full snapshot when committed text no longer matches the prefix', () => {
  assert.equal(
    stripCommittedPrefixFromSnapshot(
      'I work at Google',
      'I worked at',
    ),
    'I work at Google',
  );
});

test('drops rewritten cumulative snapshots that would replay committed text', () => {
  assert.equal(
    stripCommittedPrefixFromSnapshot(
      '没说你好，我在等你的问题。面试官你好，我在等你的问题。全线问题',
      '面试官你好，我在等你的问题。全线问题。权限问题',
    ),
    '',
  );
});

test('keeps a clearly new utterance even when earlier text was committed', () => {
  assert.equal(
    stripCommittedPrefixFromSnapshot(
      '权限问题',
      '面试官你好，我在等你的问题。全线问题',
    ),
    '权限问题',
  );
});
