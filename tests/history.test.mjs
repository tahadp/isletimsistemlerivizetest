import test from "node:test";
import assert from "node:assert/strict";
import { restoreSession } from "../dist/quiz-core.js";
import {
  HISTORY_LIMIT,
  removeHistoryEntry,
  createHistoryEntry,
  ensureHistoryIdentity,
  sanitizeHistory,
  shouldRecordHistory,
  upsertHistoryEntry
} from "../dist/history-core.js";

const savedAt = "2026-10-31T12:30:00.000Z";

test("history entry stores date, unit and per-session totals", () => {
  const session = {
    historyId: "attempt-1",
    startedAt: "2026-10-31T12:00:00.000Z",
    status: "active",
    questionIds: ["q1", "q2", "q3"],
    answers: {
      q1: { checked: true, correct: true },
      q2: { checked: true, correct: false }
    }
  };
  assert.deepEqual(createHistoryEntry(session, "Ünite 1", savedAt), {
    id: "attempt-1",
    startedAt: "2026-10-31T12:00:00.000Z",
    updatedAt: savedAt,
    unit: "Ünite 1",
    total: 3,
    correct: 1,
    incorrect: 1,
    unanswered: 1,
    status: "active"
  });
});

test("upserting the same attempt updates it without inflating session count", () => {
  const first = {
    id: "attempt-1", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 1",
    total: 2, correct: 1, incorrect: 0, unanswered: 1, status: "active"
  };
  const updated = { ...first, updatedAt: "2026-10-31T12:40:00.000Z", correct: 2, unanswered: 0, status: "complete" };
  const result = upsertHistoryEntry([first], updated);
  assert.equal(result.length, 1);
  assert.equal(result[0].correct, 2);
  assert.equal(result[0].status, "complete");
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
    { id: "attempt-2", startedAt: savedAt, updatedAt: savedAt, unit: "Ünite 2", total: 1, correct: 1, incorrect: 0, unanswered: 0 }
  ];
  const remaining = removeHistoryEntry(entries, "attempt-1");
  assert.deepEqual(remaining.map((entry) => entry.id), ["attempt-2"]);
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
