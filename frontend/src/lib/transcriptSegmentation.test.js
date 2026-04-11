import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeTranscriptText,
  DUPLICATE_SEGMENT_SUPPRESSION_MS,
  getSpeakersToFinalizeOnIncoming,
  getStaleLiveSpeakers,
  LIVE_SEGMENT_FINALIZE_MS,
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

test('canonicalizes punctuation so spoken duplicates do not reappear', () => {
  assert.equal(
    canonicalizeTranscriptText('你好，面试官等你的问题。'),
    canonicalizeTranscriptText('你好 面试官等你的问题'),
  );
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
