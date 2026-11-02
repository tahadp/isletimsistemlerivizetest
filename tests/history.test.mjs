import test from "node:test";
import assert from "node:assert/strict";
import { restoreSession } from "../dist/quiz-core.js";
import {
  HISTORY_LIMIT,
  HISTORY_QUESTION_LIMIT,
  canRevealHistoryAnswer,
  removeHistoryEntry,
  createHistoryEntry,
  createQuestionSnapshot,
  ensureHistoryIdentity,
  sanitizeHistory,
  resolveHistoryQuestions,
  shouldRecordHistory,
  upsertHistoryEntry
} from "../dist/history-core.js";

const savedAt = "2026-10-31T12:30:00.000Z";

test("history review reveals accepted answers and explanations only after checking", () => {
  assert.equal(canRevealHistoryAnswer({ selected: "B", checked: false, correct: null }), false);
  assert.equal(canRevealHistoryAnswer({ selected: null, checked: false, correct: null }), false);
  assert.equal(canRevealHistoryAnswer({ selected: "B", checked: true, correct: false }), true);
});

test("history entry stores date, unit and per-session totals", () => {
  const questionsById = new Map([
    ["q1", { id: "q1", acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }],
    ["q2", { id: "q2", acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }],
    ["q3", { id: "q3", acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }]
  ]);
  const session = {
    historyId: "attempt-1",
    startedAt: "2026-10-31T12:00:00.000Z",
    status: "active",
    questionIds: ["q1", "q2", "q3"],
    answers: {
      q1: { selected: "A", checked: true, correct: true },
      q2: { selected: "B", checked: true, correct: false }
    }
  };
  assert.deepEqual(createHistoryEntry(session, "Ünite 1", savedAt, questionsById), {
    id: "attempt-1",
    startedAt: "2026-10-31T12:00:00.000Z",
    updatedAt: savedAt,
    unit: "Ünite 1",
    total: 3,
    correct: 1,
    incorrect: 1,
    unanswered: 1,
    status: "active",
    questions: [
      { id: "q1", selected: "A", checked: true, correct: true },
      { id: "q2", selected: "B", checked: true, correct: false },
      { id: "q3", selected: null, checked: false, correct: null }
    ]
  });
});

test("snapshots derive accepted alternatives and retain checked, pending and blank states", () => {
  const questionsById = new Map([
    ["multi", { acceptedAnswers: ["A", "E"], options: [{ key: "A" }, { key: "B" }, { key: "E" }] }],
    ["pending", { acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }],
    ["blank", { acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }]
  ]);
  const snapshot = createQuestionSnapshot({
    questionIds: ["multi", "pending", "blank"],
    answers: {
      multi: { selected: "E", checked: true, correct: false },
      pending: { selected: "B", checked: false, correct: true }
    }
  }, questionsById);

  assert.deepEqual(snapshot, [
    { id: "multi", selected: "E", checked: true, correct: true },
    { id: "pending", selected: "B", checked: false, correct: null },
    { id: "blank", selected: null, checked: false, correct: null }
  ]);
});

test("upserting the same attempt updates it without inflating session count", () => {
  const first = {
    id: "attempt-1", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1",
    total: 2, correct: 1, incorrect: 0, unanswered: 1, status: "active",
    questions: [
      { id: "q1", selected: "A", checked: true, correct: true },
      { id: "q2", selected: null, checked: false, correct: null }
    ]
  };
  const updated = {
    ...first,
    updatedAt: "2026-10-31T12:40:00.000Z",
    correct: 2,
    unanswered: 0,
    status: "complete",
    questions: [
      { id: "q1", selected: "A", checked: true, correct: true },
      { id: "q2", selected: "E", checked: true, correct: true }
    ]
  };
  const result = upsertHistoryEntry([first], updated);
  assert.equal(result.length, 1);
  assert.equal(result[0].correct, 2);
  assert.equal(result[0].status, "complete");
  assert.equal(result[0].questions[1].selected, "E");
});

test("history is sanitized, deduplicated and limited to the newest 200 entries", () => {
  const entries = Array.from({ length: HISTORY_LIMIT + 3 }, (_, index) => ({
    id: "attempt-" + index,
    startedAt: savedAt,
    updatedAt: new Date(Date.parse(savedAt) + index * 1000).toISOString(),
    unit: "Ünite 1",
    total: 2,
    correct: 1,
    incorrect: 1,
    unanswered: 0
  }));
  const result = sanitizeHistory([...entries, { id: "bad" }, null]);
  assert.equal(result.length, HISTORY_LIMIT);
  assert.equal(result[0].id, "attempt-" + (HISTORY_LIMIT + 2));
  assert.ok(!result.some((entry) => entry.id === "attempt-0"));
});

test("snapshot sanitization preserves full bounded answers and drops malformed details", () => {
  const valid = {
    id: "attempt-with-details", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1",
    total: 2, correct: 1, incorrect: 1, unanswered: 0, status: "complete",
    questions: [
      { id: "q1", selected: "A", checked: true, correct: true },
      { id: "q2", selected: "B", checked: true, correct: false }
    ]
  };
  const restored = sanitizeHistory([{ ...valid, correct: 2, incorrect: 0 }]);
  assert.deepEqual(restored[0].questions, valid.questions);
  assert.equal(restored[0].correct, 1);
  assert.equal(restored[0].incorrect, 1);

  const malformed = sanitizeHistory([{ ...valid, id: "bad-details", questions: [valid.questions[0]] }]);
  assert.equal(malformed.length, 1);
  assert.equal(Object.hasOwn(malformed[0], "questions"), false);

  const tooLarge = Array.from({ length: HISTORY_QUESTION_LIMIT + 1 }, (_, index) => ({
    id: "q" + index, selected: null, checked: false, correct: null
  }));
  const bounded = sanitizeHistory([{
    ...valid, id: "too-large", total: tooLarge.length, correct: 0, incorrect: 0,
    unanswered: tooLarge.length, questions: tooLarge
  }]);
  assert.equal(Object.hasOwn(bounded[0], "questions"), false);
});

test("legacy aggregate history opens only from a matching current session", () => {
  const legacy = {
    id: "old-attempt", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1",
    total: 1, correct: 0, incorrect: 1, unanswered: 0
  };
  const question = { acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] };
  const questionsById = new Map([["q1", question]]);
  const current = {
    historyId: "old-attempt", questionIds: ["q1"],
    answers: { q1: { selected: "B", checked: true, correct: false } }
  };
  assert.equal(resolveHistoryQuestions(legacy, null, questionsById), null);
  assert.equal(resolveHistoryQuestions(legacy, { ...current, historyId: "other" }, questionsById), null);
  assert.deepEqual(resolveHistoryQuestions(legacy, current, questionsById), [
    { id: "q1", selected: "B", checked: true, correct: false }
  ]);
  assert.deepEqual(current.answers.q1, { selected: "B", checked: true, correct: false });
});

test("stored details take precedence over a matching live session and stay unchanged", () => {
  const questionsById = new Map([["q1", { acceptedAnswers: ["A"], options: [{ key: "A" }, { key: "B" }] }]]);
  const entry = {
    id: "attempt", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1",
    total: 1, correct: 1, incorrect: 0, unanswered: 0,
    questions: [{ id: "q1", selected: "A", checked: true, correct: true }]
  };
  const current = {
    historyId: "attempt", questionIds: ["q1"],
    answers: { q1: { selected: "B", checked: true, correct: false } }
  };
  assert.deepEqual(resolveHistoryQuestions(entry, current, questionsById), entry.questions);
  assert.deepEqual(current.answers.q1, { selected: "B", checked: true, correct: false });
  assert.deepEqual(entry.questions, [{ id: "q1", selected: "A", checked: true, correct: true }]);
});

test("restoring a v1 session assigns one stable history id", () => {
  const legacySession = { questionIds: ["q1"], answers: {} };
  let generated = 0;
  const migrated = ensureHistoryIdentity(legacySession, () => "stable-" + (++generated), savedAt);
  const restoredAgain = ensureHistoryIdentity(migrated, () => "unexpected", savedAt);
  assert.equal(migrated.historyId, "stable-1");
  assert.equal(restoredAgain.historyId, "stable-1");
  assert.equal(generated, 1);
  assert.equal(restoredAgain.startedAt, savedAt);
});

test("restoring a v1 active session keeps its history ID and clear suppression flag", () => {
  const question = { id: "q1", type: "test", options: [{ key: "A" }, { key: "B" }], acceptedAnswers: ["A"] };
  const restored = restoreSession({
    questionIds: ["q1"],
    index: 0,
    answers: { q1: { selected: "B", checked: true, correct: false } },
    historyId: "attempt-persistent",
    startedAt: savedAt,
    historySuppressed: true
  }, new Map([["q1", question]]));

  assert.equal(restored.historyId, "attempt-persistent");
  assert.equal(restored.historySuppressed, true);
  assert.equal(restored.answers.q1.correct, false);
});
test("retry sessions never write history, including after restoring persisted mode", () => {
  assert.equal(shouldRecordHistory({ historyId: "retry-1", noHistory: true }), false);
  assert.equal(shouldRecordHistory({ historyId: "attempt-1", historySuppressed: true }), false);
  assert.equal(shouldRecordHistory({ historyId: "attempt-1", historyDeleted: true }), false);
  assert.equal(shouldRecordHistory({ historyId: "attempt-1" }), true);

  const question = { id: "q1", type: "test", options: [{ key: "A" }, { key: "B" }], acceptedAnswers: ["A"] };
  const retry = restoreSession({
    questionIds: ["q1"],
    answers: { q1: { selected: "B", checked: true, correct: false } },
    historyId: "retry-1",
    noHistory: true
  }, new Map([["q1", question]]));

  assert.equal(retry.noHistory, true);
  assert.equal(shouldRecordHistory(retry), false);
});
test("deleting one history entry leaves other records and suppresses its active session", () => {
  const entries = [
    { id: "attempt-1", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1", total: 2, correct: 1, incorrect: 1, unanswered: 0 },
    {
      id: "attempt-2", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 2", total: 1, correct: 1, incorrect: 0, unanswered: 0,
      questions: [{ id: "q2", selected: "A", checked: true, correct: true }]
    }
  ];
  const remaining = removeHistoryEntry(entries, "attempt-1");
  assert.deepEqual(remaining.map((entry) => entry.id), ["attempt-2"]);
  assert.deepEqual(remaining[0].questions, [{ id: "q2", selected: "A", checked: true, correct: true }]);
  assert.equal(removeHistoryEntry(remaining, "attempt-1").length, 1);

  const activeSession = { historyId: "attempt-1", historyDeleted: true };
  assert.equal(shouldRecordHistory(activeSession), false);
});
test("a deleted active attempt remains excluded after reload and later answers", () => {
  const question = { id: "q1", type: "test", options: [{ key: "A" }, { key: "B" }], acceptedAnswers: ["A"] };
  const restored = restoreSession({
    questionIds: ["q1"],
    answers: { q1: { selected: "B", checked: true, correct: false } },
    historyId: "deleted-attempt",
    historyDeleted: true
  }, new Map([["q1", question]]));

  assert.equal(restored.historyDeleted, true);
  assert.equal(shouldRecordHistory(restored), false);
  const afterAnotherAnswer = { ...restored, historySuppressed: false };
  assert.equal(shouldRecordHistory(afterAnotherAnswer), false);
});
