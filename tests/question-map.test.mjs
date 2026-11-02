import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestionMapItem } from "../dist/quiz-core.js";

const question = { acceptedAnswers: ["A", "E"] };

test("question map distinguishes blank, pending, correct, and incorrect answers", () => {
  assert.equal(classifyQuestionMapItem(question, undefined), "blank");
  assert.equal(classifyQuestionMapItem(question, { selected: "B", checked: false }), "pending");
  assert.equal(classifyQuestionMapItem(question, { selected: "E", checked: true }), "correct");
  assert.equal(classifyQuestionMapItem(question, { selected: "B", checked: true }), "incorrect");
});

test("checked answer status follows accepted alternatives, not only the book key", () => {
  assert.equal(classifyQuestionMapItem(question, { selected: "A", checked: true, correct: false }), "correct");
  assert.equal(classifyQuestionMapItem(question, { selected: "E", checked: true, correct: false }), "correct");
});

test("unchecked stored correctness never marks a question as correct", () => {
  assert.equal(classifyQuestionMapItem(question, { selected: "A", checked: false, correct: true }), "pending");
});
