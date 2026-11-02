import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestionMapItem, describeQuestionMapItem } from "../dist/quiz-core.js";

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

test("map uses unique session positions and accessible labels retain unit source numbers and status", () => {
  const first = describeQuestionMapItem(0, "Ünite 1", 1, "blank");
  const eleventh = describeQuestionMapItem(10, "Ünite 2", 1, "incorrect");
  assert.equal(first.displayNumber, "1");
  assert.equal(eleventh.displayNumber, "11");
  assert.notEqual(first.displayNumber, eleventh.displayNumber);
  assert.match(first.accessibleLabel, /Ünite 1, soru numarası 1: boş/);
  assert.match(eleventh.accessibleLabel, /Soru 11, Ünite 2, soru numarası 1: yanlış/);
});
