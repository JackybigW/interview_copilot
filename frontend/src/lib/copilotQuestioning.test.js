import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTranscriptContext,
  extractLatestInterviewerQuestion,
  getStreamingAnswerText,
  buildPrefillCandidate,
  isStablePrefillCandidate,
  shouldPromoteFinalQuestion,
  shouldRestartPrefillRequest,
  shouldStartPrefillRequest,
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

test('buildTranscriptContext includes recent final segments plus interviewer live text', () => {
  const context = buildTranscriptContext({
    segments: [
      { speaker: 'user', text: '你好', id: 1 },
      { speaker: 'interviewer', text: '你最大的缺点', id: 2 },
    ],
    liveInterviewerText: '你最大的缺点是什么',
  });

  assert.equal(
    context,
    '[user] 你好\n[interviewer] 你最大的缺点\n[interviewer] 你最大的缺点是什么',
  );
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
  assert.equal(
    shouldPromoteFinalQuestion({
      prefillQuestion: '',
      finalQuestion: '你最大的缺点是什么？',
    }),
    false,
  );
});

test('shouldStartPrefillRequest only starts when candidate changes materially', () => {
  assert.equal(
    shouldStartPrefillRequest({
      activeQuestion: '',
      nextQuestion: '你最大的缺点是什么',
      isProcessing: false,
    }),
    true,
  );

  assert.equal(
    shouldStartPrefillRequest({
      activeQuestion: '你最大的缺点是什么',
      nextQuestion: '你最大的缺点是什么？',
      isProcessing: true,
    }),
    false,
  );
});

test('shouldRestartPrefillRequest restarts when the final question diverges', () => {
  assert.equal(
    shouldRestartPrefillRequest({
      prefillQuestion: '你最大的缺点是什么',
      finalQuestion: '你为什么想加入我们公司？',
    }),
    true,
  );
});
