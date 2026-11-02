import test from "node:test";
import assert from "node:assert/strict";
import { classifyOption } from "../dist/quiz-core.js";
import { buildEducationTestDetails, buildTestFeedback, educationPositionLabel, filterSiraQuestions, getSiraAnswerDetails } from "../dist/education-core.js";

const question = {
  acceptedAnswers: ["A", "E"],
  bookAnswer: "A",
  options: [
    { key: "A", text: "Kitap yanıtı" },
    { key: "B", text: "Yanlış seçim" },
    { key: "E", text: "Kabul edilen alternatif" }
  ],
  explanation: "Açıklama metni."
};

test("ordinary correct feedback omits duplicate answer and book-key lines", () => {
  const feedback = buildTestFeedback(question, "E", ["A", "B", "E"]);
  assert.equal(feedback.correct, true);
  assert.deepEqual(feedback.answerLines, []);
  assert.equal(feedback.explanation, question.explanation);
});

test("ordinary wrong feedback shows accepted answers once and does not expose the source key", () => {
  const feedback = buildTestFeedback(question, "B", ["E", "B", "A"]);
  assert.equal(feedback.correct, false);
  assert.deepEqual(feedback.answerLines, [{
    label: "Doğru cevaplar",
    text: "C — Kitap yanıtı · A — Kabul edilen alternatif"
  }]);
  assert.equal(feedback.answerLines.some((line) => line.label === "Kitap anahtarı"), false);
});

test("conflicting source feedback shows separate accepted and book answers using displayed labels", () => {
  const feedback = buildTestFeedback({ ...question, conflictNote: "Kaynaklarda farklılık var." }, "B", ["E", "B", "A"]);
  assert.deepEqual(feedback.answerLines, [
    { label: "Kabul edilen cevaplar", text: "C — Kitap yanıtı · A — Kabul edilen alternatif" },
    { label: "Kitap anahtarı", text: "C — Kitap yanıtı" }
  ]);
  assert.equal(feedback.conflictNote, "Kaynaklarda farklılık var.");
  assert.ok(feedback.answerLines.every((line) => !line.text.includes("A — Kitap yanıtı")));
});

test("ordinary quiz option states remain unchanged", () => {
  assert.equal(classifyOption(question, "A", "A", true), "selected-correct");
  assert.equal(classifyOption(question, "B", "B", true), "selected-wrong");
  assert.equal(classifyOption(question, "E", "B", true), "accepted-alternative");
});

test("Education Test reveals accepted answers and explanation immediately with shuffled display labels", () => {
  const details = buildEducationTestDetails(question, ["E", "B", "A"]);
  assert.equal(details.acceptedLabel, "Doğru ve kabul edilen cevaplar");
  assert.deepEqual(details.acceptedAnswers, ["C — Kitap yanıtı", "A — Kabul edilen alternatif"]);
  assert.equal(details.explanation, "Açıklama metni.");
  assert.equal(details.bookAnswer, "");
  assert.equal(Object.hasOwn(details, "correct"), false);
});

test("Education Test keeps book-key and conflict explanation available only for conflict questions", () => {
  const details = buildEducationTestDetails({ ...question, conflictNote: "Kaynaklarda farklılık var." }, ["E", "B", "A"]);
  assert.equal(details.bookAnswer, "C — Kitap yanıtı");
  assert.equal(details.conflictNote, "Kaynaklarda farklılık var.");
});

test("education position includes both tour position and original unit question number", () => {
  assert.equal(educationPositionLabel(0, 16, { unit: 1, number: 3 }), "1 / 16 · 1. Ünite · 3. Soru");
});

test("Sıra Sizde filters selected units and supplies the book answer for immediate display", () => {
  const questions = [
    { id: "s1", unit: 1, type: "sira-sizde", prompt: "Açık soru", answer: "Yanıt", explanation: "Özet.", ambiguityNote: "Kaynaklarda yanıtın kapsamı farklı yorumlanmış.", answerSource: { pdfPage: 4, bookPage: 9 } },
    { id: "s2", unit: 2, type: "sira-sizde", prompt: "Diğer açık soru", answer: "Başka yanıt" },
    { id: "t1", unit: 1, type: "test", prompt: "Test sorusu" }
  ];
  assert.deepEqual(filterSiraQuestions(questions, ["1"]).map((item) => item.id), ["s1"]);
  assert.deepEqual(getSiraAnswerDetails(questions[0]), {
    answer: "Yanıt", explanation: "Özet.", ambiguityNote: "Kaynaklarda yanıtın kapsamı farklı yorumlanmış.", sourceLine: "PDF s. 4 · Kitap s. 9"
  });
  assert.deepEqual(getSiraAnswerDetails({ prompt: "No answer" }), { answer: "", explanation: "", ambiguityNote: "", sourceLine: "" });
});
