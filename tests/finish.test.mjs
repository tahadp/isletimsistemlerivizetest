import test from "node:test";
import assert from "node:assert/strict";
import {
  gradePendingAnswers,
  confirmFreshStart,
  summarizePendingAnswers,
  summarizeSession
} from "../dist/quiz-core.js";

test("starting a new test preserves unfinished active and retry sessions on cancel", () => {
  const activeSession = {
    status: "active",
    questionIds: ["q1", "q2"],
    answers: { q1: { selected: "A", checked: true, correct: true } }
  };
  const activeSnapshot = structuredClone(activeSession);
  const history = [{ id: "existing" }];
  let replacementStarted = false;
  assert.equal(confirmFreshStart(activeSession, () => false, () => { replacementStarted = true; history.length = 0; }), false);
  assert.deepEqual(activeSession, activeSnapshot);
  assert.deepEqual(history, [{ id: "existing" }]);
  assert.equal(replacementStarted, false);

  const retrySession = {
    status: "active",
    noHistory: true,
    questionIds: ["q1", "q2"],
    answers: { q1: { selected: "A", checked: true, correct: false } }
  };
  assert.equal(confirmFreshStart(retrySession, () => false, () => { replacementStarted = true; }), false);
  assert.equal(replacementStarted, false);
});

test("completed sessions need no warning and confirmed starts replace unfinished sessions", () => {
  let confirmations = 0;
  let starts = 0;
  assert.equal(confirmFreshStart({ status: "complete", questionIds: ["q1"], answers: {} }, () => { confirmations += 1; return false; }, () => { starts += 1; }), true);
  assert.equal(confirmations, 0);
  assert.equal(starts, 1);
  assert.equal(confirmFreshStart({ status: "active", questionIds: ["q1", "q2"], answers: {} }, () => { confirmations += 1; return true; }, () => { starts += 1; }), true);
  assert.equal(confirmations, 1);
  assert.equal(starts, 2);
});

test("fully answered active session needs no warning", () => {
  assert.equal(confirmFreshStart({
    status: "active",
    questionIds: ["q1"],
    answers: { q1: { selected: "A", checked: true, correct: true } }
  }, () => false, () => {}), true);
});

test("selected unchecked answers are pending, while unanswered questions are truly blank", () => {
  const result = summarizePendingAnswers(["q1", "q2", "q3"], {
    q1: { selected: "E", checked: false },
    q2: { selected: "B", checked: true, correct: false }
  });
  assert.deepEqual(result, { pendingIds: ["q1"], blankIds: ["q3"] });
});

test("finish auto-grades selected pending answers and leaves true blanks unanswered", () => {
  const questions = new Map([
    ["q1", { acceptedAnswers: ["A", "E"] }],
    ["q2", { acceptedAnswers: ["A", "D"] }],
    ["q3", { acceptedAnswers: ["B", "C", "D"] }]
  ]);
  const originalAnswers = {
    q1: { selected: "E", checked: false },
    q2: { selected: "C", checked: false },
    q3: { selected: "D", checked: true, correct: true }
  };
  const graded = gradePendingAnswers(["q1", "q2", "q3", "q4"], originalAnswers, questions);

  assert.deepEqual(graded.gradedIds, ["q1", "q2"]);
  assert.equal(graded.answers.q1.correct, true);
  assert.equal(graded.answers.q2.correct, false);
  assert.deepEqual(graded.answers.q3, originalAnswers.q3);
  assert.equal("q4" in graded.answers, false);
  assert.deepEqual(summarizePendingAnswers(["q1", "q2", "q3", "q4"], graded.answers), {
    pendingIds: [],
    blankIds: ["q4"]
  });
  assert.deepEqual(summarizeSession(["q1", "q2", "q3", "q4"], graded.answers), {
    total: 4,
    completed: 3,
    correct: 2,
    incorrect: 1,
    unanswered: 1,
    wrongIds: ["q2"]
  });
});
