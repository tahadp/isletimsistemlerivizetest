import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterQuestionsByUnits, formatSourceQuestionPosition, formatUnitSelection, restoreSession, shuffleQuestions } from "../dist/quiz-core.js";

const data = JSON.parse((await readFile(new URL("../dist/questions.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const questionsById = new Map(data.questions.map((question) => [question.id, question]));

test("unit selection filters 10, 20, and 50 test questions without modifying source order", () => {
  const originalIds = data.questions.map((question) => question.id);
  assert.equal(filterQuestionsByUnits(data.questions, ["1"]).length, 10);
  assert.equal(filterQuestionsByUnits(data.questions, ["1", "2"]).length, 20);
  assert.equal(filterQuestionsByUnits(data.questions, data.units.map((unit) => unit.id)).length, 50);
  assert.equal(filterQuestionsByUnits(data.questions, []).length, 0);
  assert.deepEqual(data.questions.map((question) => question.id), originalIds);
});

test("five selected units are shuffled together across all 50 questions", () => {
  const selected = filterQuestionsByUnits(data.questions, data.units.map((unit) => unit.id));
  const shuffled = shuffleQuestions(selected, () => 0.3);
  assert.equal(shuffled.length, 50);
  assert.notDeepEqual(shuffled.map((question) => question.id), selected.map((question) => question.id));
  assert.deepEqual(new Set(shuffled.map((question) => question.id)), new Set(selected.map((question) => question.id)));
  assert.ok(new Set(shuffled.slice(0, 15).map((question) => question.unit)).size > 1, "early positions cross unit boundaries instead of staying in 10-question blocks");
});

test("source question position remains tied to its original unit and number after shuffling", () => {
  const selected = filterQuestionsByUnits(data.questions, data.units.map((unit) => unit.id));
  const shuffled = shuffleQuestions(selected, () => 0.3);
  const originalQuestion = shuffled.find((question) => question.id === "u5-test-7");
  assert.ok(originalQuestion);
  assert.equal(formatSourceQuestionPosition(originalQuestion), "5. Ünite · 7. Soru");
  assert.notEqual(shuffled.indexOf(originalQuestion) + 1, originalQuestion.number);
});

test("restored sessions normalize new multi-unit and legacy single/all configs", () => {
  const ids = ["u1-test-1", "u2-test-1"];
  const multi = restoreSession({ questionIds: ids, config: { units: [2, "1", "2", "99"], shuffle: true } }, questionsById);
  assert.deepEqual(multi.config.units, ["1", "2"]);
  assert.equal(multi.config.unit, "all");
  assert.equal(multi.config.shuffle, true);

  const single = restoreSession({ questionIds: [ids[0]], config: { unit: "1" } }, questionsById);
  assert.deepEqual(single.config.units, ["1"]);
  assert.equal(single.config.unit, "1");

  const all = restoreSession({ questionIds: ids, config: { unit: "all" } }, questionsById);
  assert.deepEqual(all.config.units, ["1", "2", "3", "4", "5"]);
});

test("history unit labels name one or several selected units accurately", () => {
  assert.equal(formatUnitSelection(data.units, ["1"]), data.units[0].title);
  assert.equal(formatUnitSelection(data.units, ["1", "2"]), data.units[0].title + " + " + data.units[1].title);
  assert.equal(formatUnitSelection(data.units, data.units.map((unit) => unit.id)), "Tüm üniteler");
  assert.equal(formatUnitSelection(data.units, []), "Ünite seçilmedi");
});
