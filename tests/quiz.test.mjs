import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayedOptionLabel, gradeAnswer, optionTextForSourceKey, restoreSession, sessionShufflePreferences, shuffleOptionKeys, summarizeSession } from '../dist/quiz-core.js';
const readJson = async (name) => JSON.parse((await readFile(new URL(name, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const data = await readJson('../dist/questions.json');
const questions = data.questions;
const byId = new Map(questions.map(q => [q.id, q]));

test('Exactly 50 original test questions, 250 options and five units; no Sıra Sizde', () => {
  assert.equal(questions.length, 50);
  assert.equal(byId.size, 50);
  assert.equal(data.units.length, 5);
  for (let unit = 1; unit <= 5; unit++) {
    assert.deepEqual(questions.filter(q => q.unit === unit).map(q => q.number).sort((a,b) => a-b), [1,2,3,4,5,6,7,8,9,10]);
  }
  for (const q of questions) {
    assert.equal(q.type, 'test');
    assert.ok(q.prompt.trim());
    assert.equal(q.options.length, 5);
    assert.deepEqual(q.options.map(o => o.key), ['A','B','C','D','E']);
    assert.ok(q.options.every(o => o.text.trim()));
    assert.ok(q.explanation.trim());
    assert.ok(q.source.title && Number.isInteger(q.source.pdfPage) && q.source.pdfPage > 0);
    assert.ok(q.acceptedAnswers.includes(q.bookAnswer));
    assert.ok(q.acceptedAnswers.every(key => q.options.some(o => o.key === key)));
    assert.equal(new Set(q.acceptedAnswers).size, q.acceptedAnswers.length);
    assert.ok(!JSON.stringify(q).includes('\uFFFD'), q.id + ': broken Unicode');
  }
});

test('Every accepted alternative earns full credit; other choices and empty answers do not', () => {
  for (const q of questions) {
    for (const key of ['A','B','C','D','E']) assert.equal(gradeAnswer(q, key), q.acceptedAnswers.includes(key), q.id + ' / ' + key);
    assert.equal(gradeAnswer(q, ''), false);
    assert.equal(gradeAnswer(q, null), false);
    assert.equal(gradeAnswer(q, 'X'), false);
    for (const a of q.options) for (const b of q.options) {
      if (a.text === b.text) assert.equal(gradeAnswer(q, a.key), gradeAnswer(q, b.key), q.id + ': identical options must receive equal credit');
    }
  }
});

test('Reviewed source conflicts preserve book keys and accept supported alternatives', () => {
  assert.deepEqual(byId.get('u1-test-7').acceptedAnswers, ['B','C','D']);
  assert.deepEqual(byId.get('u2-test-1').acceptedAnswers, ['A','E']);
  assert.deepEqual(byId.get('u5-test-3').acceptedAnswers, ['A','D']);
  for (const id of ['u1-test-7','u2-test-1','u2-test-6','u5-test-3']) assert.ok(byId.get(id).conflictNote);
  assert.deepEqual(byId.get('u3-test-3').acceptedAnswers, ['D']);
});

test('Option shuffling changes only display order and saved order survives restore', () => {
  const question = byId.get('u1-test-7');
  const shuffled = shuffleOptionKeys(question.options, () => 0);
  assert.deepEqual(shuffled, ['B', 'C', 'D', 'E', 'A']);
  assert.deepEqual(new Set(shuffled), new Set(question.options.map((option) => option.key)));
  assert.equal(gradeAnswer(question, 'D'), question.acceptedAnswers.includes('D'));
  const restored = restoreSession({
    questionIds: [question.id], optionOrders: { [question.id]: shuffled },
    config: { shuffle: true, shuffleOptions: true }
  }, byId);
  assert.deepEqual(restored.optionOrders[question.id], shuffled);
  assert.equal(restored.config.shuffle, true);
  assert.equal(restored.config.shuffleOptions, true);
  assert.deepEqual(sessionShufflePreferences(restored), { shuffle: true, shuffleOptions: true });
  assert.deepEqual(restored.optionOrders[question.id], shuffled);
  assert.deepEqual(question.acceptedAnswers.map((key) => displayedOptionLabel(key, restored.optionOrders[question.id])), ['A', 'B', 'C']);
  assert.equal(displayedOptionLabel(question.bookAnswer, restored.optionOrders[question.id]), 'B');
  assert.equal(gradeAnswer(question, question.acceptedAnswers[0]), true);
});

test('Displayed A-E labels map back to source option keys for checked and restored answers', () => {
  const question = byId.get('u2-test-1');
  const order = ['E', 'D', 'C', 'B', 'A'];
  const restored = restoreSession({
    questionIds: [question.id], optionOrders: { [question.id]: order },
    answers: { [question.id]: { selected: 'E', checked: true } },
    config: { shuffleOptions: true }
  }, byId);
  assert.equal(displayedOptionLabel('E', restored.optionOrders[question.id]), 'A');
  assert.equal(restored.answers[question.id].selected, 'E');
  assert.equal(restored.answers[question.id].correct, question.acceptedAnswers.includes('E'));
  assert.deepEqual(question.acceptedAnswers.map((key) => displayedOptionLabel(key, order)), ['E', 'A']);
  assert.equal(displayedOptionLabel(question.bookAnswer, order), 'E');
});

test('History review preserves selected and accepted choice text without exposing source keys', () => {
  const question = byId.get('u1-test-7');
  const selectedText = optionTextForSourceKey(question.options, 'B');
  const acceptedText = question.acceptedAnswers.map((key) => optionTextForSourceKey(question.options, key));
  assert.ok(selectedText);
  assert.ok(acceptedText.every(Boolean));
  assert.equal(selectedText, question.options.find((option) => option.key === 'B').text);
  assert.equal(acceptedText.length, 3);
  assert.equal(optionTextForSourceKey(question.options, 'Z'), '');
});

test('Restored home shuffle controls reflect legacy and saved session preferences', () => {
  assert.deepEqual(sessionShufflePreferences(null), { shuffle: false, shuffleOptions: false });
  const legacy = restoreSession({ questionIds: ['u5-test-7'], config: { shuffle: true } }, byId);
  assert.deepEqual(sessionShufflePreferences(legacy), { shuffle: true, shuffleOptions: false });
  const saved = restoreSession({ questionIds: ['u5-test-7'], config: { shuffle: true, shuffleOptions: true } }, byId);
  assert.deepEqual(sessionShufflePreferences(saved), { shuffle: true, shuffleOptions: true });
});

test('Enabled option shuffle never silently returns the original order', () => {
  const question = byId.get('u5-test-7');
  const original = question.options.map((option) => option.key);
  const shuffled = shuffleOptionKeys(question.options, () => 0.999999);
  assert.deepEqual(new Set(shuffled), new Set(original));
  assert.notDeepEqual(shuffled, original);
});

test('Invalid or missing stored option orders fall back to source order', () => {
  const question = byId.get('u2-test-1');
  const restored = restoreSession({
    questionIds: [question.id], optionOrders: { [question.id]: ['A', 'A'] }
  }, byId);
  assert.deepEqual(restored.optionOrders[question.id], question.options.map((option) => option.key));
  assert.equal(restored.config.shuffleOptions, false);
});

test('Scores separate checked wrong, unchecked and correct, including alternatives', () => {
  const ids = ['u1-test-7','u5-test-3','u2-test-1','u3-test-1'];
  const session = restoreSession({questionIds:ids, index:0, answers: {
    'u1-test-7': {selected:'D',checked:true,correct:false},
    'u5-test-3': {selected:'B',checked:true,correct:true},
    'u2-test-1': {selected:'E',checked:false,correct:true}
  }}, byId);
  assert.deepEqual(summarizeSession(session.questionIds, session.answers), {total:4,completed:2,correct:1,incorrect:1,unanswered:2,wrongIds:['u5-test-3']});
});

test('Corrupt saved progress cannot crash the quiz or inflate scores', () => {
  assert.equal(restoreSession(null, byId), null);
  assert.equal(restoreSession({questionIds:['missing']}, byId), null);
  const id = 'u2-test-1';
  const restored = restoreSession({questionIds:[id,id,'missing'],index:999,answers:{[id]:{selected:'X',checked:true,correct:true}},config:[]}, byId);
  assert.deepEqual(restored.questionIds,[id]);
  assert.equal(restored.index,0);
  assert.deepEqual(restored.answers,{});
  assert.equal(summarizeSession(restored.questionIds,restored.answers).correct,0);
});
