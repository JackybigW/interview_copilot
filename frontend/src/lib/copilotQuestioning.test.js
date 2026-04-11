import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLatestInterviewerQuestion,
  getStreamingAnswerText,
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
