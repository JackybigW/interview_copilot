import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLatestInterviewerQuestion,
  getStreamingAnswerText,
  buildPrefillCandidate,
  isStablePrefillCandidate,
  shouldPromoteFinalQuestion,
} from './copilotQuestioning.js';

test('extracts the latest interviewer line from labeled transcript context', () => {
  const transcript = [
    '[user] 面试官您好，我在等你的问题。',
    '[interviewer] 你最大的缺点是什么？',
  ].join('\n');

  assert.equal(
    extractLatestInterviewerQuestion(transcript),
    '你最大的缺点是什么？',
  );
});

test('returns empty string when there is no interviewer line', () => {
  const transcript = '[user] 我想先做个自我介绍。';

  assert.equal(extractLatestInterviewerQuestion(transcript), '');
});

test('treats plain streamed content as the answer body', () => {
  assert.equal(
    getStreamingAnswerText('我最大的缺点是有时会对细节过于投入，但我会主动设定优先级。'),
    '我最大的缺点是有时会对细节过于投入，但我会主动设定优先级。',
  );
});

test('extracts the answer body when legacy tagged content is received', () => {
  assert.equal(
    getStreamingAnswerText('[QUESTION]: 你最大的缺点是什么？[ANSWER]: 我会诚实回答。'),
    '我会诚实回答。',
  );
});

test('returns an empty prefill candidate for short non-question partials', () => {
  assert.equal(buildPrefillCandidate('嗯'), '');
  assert.equal(buildPrefillCandidate('这个'), '');
  assert.equal(
    buildPrefillCandidate('咱开始聊题，第一个，你最大的缺点是什么'),
    '咱开始聊题，第一个，你最大的缺点是什么',
  );
});

test('requires repeated matching snapshots before a prefill candidate is stable', () => {
  assert.equal(
    isStablePrefillCandidate({
      previousCandidate: '你最大的缺点是什么',
      nextCandidate: '你最大的缺点是什么',
      seenCount: 1,
    }),
    true,
  );

  assert.equal(
    isStablePrefillCandidate({
      previousCandidate: '你最大的缺点是',
      nextCandidate: '你最大的缺点是什么',
      seenCount: 1,
    }),
    false,
  );
});

test('accepts punctuation-only final refinements', () => {
  assert.equal(
    shouldPromoteFinalQuestion({
      prefillQuestion: '你最大的缺点是什么',
      finalQuestion: '你最大的缺点是什么？',
    }),
    true,
  );
  assert.equal(
    shouldPromoteFinalQuestion({
      prefillQuestion: '你最大的缺点是什么',
      finalQuestion: '你为什么想加入我们公司？',
    }),
    false,
  );
});
