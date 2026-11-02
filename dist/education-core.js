import { displayedOptionLabel, formatSourceQuestionPosition, gradeAnswer } from "./quiz-core.js";

export function educationPositionLabel(index, total, question) {
  const position = Number.isInteger(index) && index >= 0 ? index + 1 : 1;
  const sourcePosition = formatSourceQuestionPosition(question) || "Soru " + (question && question.number ? question.number : position);
  return position + " / " + total + " · " + sourcePosition;
}

function answerText(question, sourceKey, optionOrder) {
  const option = Array.isArray(question && question.options)
    ? question.options.find((item) => item && item.key === sourceKey)
    : null;
  if (!option) return displayedOptionLabel(sourceKey, optionOrder);
  return displayedOptionLabel(sourceKey, optionOrder) + " — " + option.text;
}

export function buildTestFeedback(question, selectedKey, optionOrder) {
  const acceptedAnswers = Array.isArray(question && question.acceptedAnswers) ? question.acceptedAnswers : [];
  const acceptedText = acceptedAnswers.map((key) => answerText(question, key, optionOrder)).join(" · ");
  const hasConflict = typeof question?.conflictNote === "string" && question.conflictNote.trim().length > 0;
  const answerLines = [];

  if (hasConflict) {
    answerLines.push({ label: acceptedAnswers.length > 1 ? "Kabul edilen cevaplar" : "Kabul edilen cevap", text: acceptedText });
    if (question.bookAnswer) {
      answerLines.push({ label: "Kitap anahtarı", text: answerText(question, question.bookAnswer, optionOrder) });
    }
  } else if (!gradeAnswer(question, selectedKey)) {
    answerLines.push({ label: acceptedAnswers.length > 1 ? "Doğru cevaplar" : "Doğru cevap", text: acceptedText });
  }

  const source = question && question.source;
  const sourceLine = source && source.title
    ? source.title + (source.pdfPage ? " · PDF s. " + source.pdfPage : "") + (source.bookPage ? " · Kitap s. " + source.bookPage : "")
    : "";

  return {
    correct: gradeAnswer(question, selectedKey),
    answerLines,
    conflictNote: hasConflict ? question.conflictNote : "",
    explanation: typeof question?.explanation === "string" ? question.explanation : "",
    sourceLine
  };
}

export function filterSiraQuestions(questions, unitIds) {
  const selected = new Set(Array.isArray(unitIds) ? unitIds.map(String) : []);
  return Array.isArray(questions)
    ? questions.filter((question) => question && question.id && question.type === "sira-sizde" && selected.has(String(question.unit)))
    : [];
}

export function getSiraAnswerDetails(question) {
  const source = question && question.answerSource;
  const citationParts = [];
  if (source && source.pdfPage) citationParts.push("PDF s. " + source.pdfPage);
  if (source && source.bookPage) citationParts.push("Kitap s. " + source.bookPage);
  return {
    answer: typeof question?.answer === "string" ? question.answer : "",
    explanation: typeof question?.explanation === "string" ? question.explanation : "",
    ambiguityNote: typeof question?.ambiguityNote === "string" ? question.ambiguityNote : "",
    sourceLine: citationParts.join(" · ")
  };
}
