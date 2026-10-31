import test from "node:test";
import assert from "node:assert/strict";
import { classifyOption, gradeAnswer } from "../dist/quiz-core.js";

const question = {
  acceptedAnswers: ["A", "E"],
  options: [
    { key: "A", text: "Birinci kabul edilen cevap" },
    { key: "B", text: "Yanlış seçenek" },
    { key: "E", text: "Alternatif kabul edilen cevap" }
  ]
};

test("every accepted answer is graded as correct", () => {
  assert.equal(gradeAnswer(question, "A"), true);
  assert.equal(gradeAnswer(question, "E"), true);
  assert.equal(gradeAnswer(question, "B"), false);
});

test("a wrong selected option is red while accepted alternatives remain neutral", () => {
  assert.equal(classifyOption(question, "B", "B", true), "selected-wrong");
  assert.equal(classifyOption(question, "A", "B", true), "accepted-alternative");
  assert.equal(classifyOption(question, "E", "B", true), "accepted-alternative");
  assert.equal(classifyOption(question, "A", "B", false), "neutral");
});

test("only the selected accepted option receives the correct state", () => {
  assert.equal(classifyOption(question, "E", "E", true), "selected-correct");
  assert.equal(classifyOption(question, "A", "E", true), "accepted-alternative");
  assert.equal(classifyOption(question, "B", "E", true), "neutral");
});

test("multi-answer accepted sets used by the question bank are preserved", () => {
  for (const [answers, accepted] of [
    [["A", "E"], ["A", "E"]],
    [["A", "D"], ["A", "D"]],
    [["B", "C", "D"], ["B", "C", "D"]]
  ]) {
    const item = { acceptedAnswers: answers };
    for (const key of accepted) assert.equal(gradeAnswer(item, key), true);
  }
});
