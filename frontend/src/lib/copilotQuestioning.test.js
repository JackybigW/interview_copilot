import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLastQuestionFromText,
  extractLatestInterviewerTurn,
  extractLatestInterviewerQuestion,
  getDetectedQuestionText,
  getStreamingAnswerText,
} from './copilotQuestioning.js';

test('extracts the latest interviewer turn from labeled transcript context', () => {
  const transcript = [
    '[user] 面试官您好，我在等你的问题。',
    '[interviewer] 开始聊题，第一个，你最大的缺点是什么？',
  ].join('\n');

  assert.equal(
    extractLatestInterviewerTurn(transcript),
    '开始聊题，第一个，你最大的缺点是什么？',
  );
});

test('extracts the latest interviewer line from labeled transcript context', () => {
  const transcript = [
    '[user] 面试官您好，我在等你的问题。',
    '[interviewer] 开始聊题，第一个，你最大的缺点是什么？',
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

test('extracts the last question sentence from a longer interviewer turn', () => {
  assert.equal(
    extractLastQuestionFromText('开始聊题，第一个，你最大的缺点是什么？'),
    '你最大的缺点是什么？',
  );
});

test('returns empty string when the text does not contain a question', () => {
  assert.equal(
    extractLastQuestionFromText('开始聊题，第一个，先做个简单自我介绍'),
    '',
  );
});

test('extracts the detected question from tagged streamed content', () => {
  assert.equal(
    getDetectedQuestionText('[QUESTION]: 你最大的缺点是什么？[ANSWER]: 我会诚实回答。'),
    '你最大的缺点是什么？',
  );
});

test('returns empty string when gemini reports no question', () => {
  assert.equal(getDetectedQuestionText('[NO_QUESTION]'), '');
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
