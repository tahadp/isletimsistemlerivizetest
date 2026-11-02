import { gradeAnswer, summarizeSession } from "./quiz-core.js";

export const HISTORY_LIMIT = 200;
export const HISTORY_QUESTION_LIMIT = 200;

export function canRevealHistoryAnswer(answer) {
  return Boolean(answer && answer.checked === true);
}

function isValidDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function clampCount(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(number)));
}

export function ensureHistoryIdentity(session, createId, now = new Date().toISOString()) {
  if (!session || typeof session !== "object") return session;
  const historyId = typeof session.historyId === "string" && session.historyId
    ? session.historyId
    : createId();
  return {
    ...session,
    historyId,
    startedAt: isValidDate(session.startedAt) ? session.startedAt : now
  };
}

function getQuestion(questionsById, questionId) {
  if (questionsById && typeof questionsById.get === "function") return questionsById.get(questionId);
  if (questionsById && typeof questionsById === "object") return questionsById[questionId];
  return undefined;
}

export function createQuestionSnapshot(session, questionsById) {
  if (!session || !Array.isArray(session.questionIds) || session.questionIds.length > HISTORY_QUESTION_LIMIT) return null;
  const snapshot = [];
  const seen = new Set();
  for (const questionId of session.questionIds) {
    if (typeof questionId !== "string" || !questionId.trim() || questionId.length > 160 || seen.has(questionId)) return null;
    seen.add(questionId);
    const answer = session.answers && typeof session.answers === "object" ? session.answers[questionId] : null;
    if (answer && answer.checked !== undefined && typeof answer.checked !== "boolean") return null;
    const selected = answer && answer.selected != null ? answer.selected : null;
    if (selected !== null && (typeof selected !== "string" || !/^[A-E]$/.test(selected))) return null;
    const checked = Boolean(answer && answer.checked);
    if (checked && !selected) return null;
    const question = getQuestion(questionsById, questionId);
    if (selected && question && Array.isArray(question.options) && !question.options.some((option) => option.key === selected)) return null;
    const correct = checked
      ? (question ? gradeAnswer(question, selected) : Boolean(answer.correct))
      : null;
    snapshot.push({ id: questionId, selected, checked, correct });
  }
  return snapshot;
}

function sanitizeQuestionSnapshot(value, total) {
  if (!Array.isArray(value) || value.length !== total || value.length > HISTORY_QUESTION_LIMIT) return null;
  const seen = new Set();
  const snapshot = [];
  for (const answer of value) {
    if (!answer || typeof answer !== "object" || typeof answer.id !== "string" || !answer.id.trim() || answer.id.length > 160) return null;
    if (seen.has(answer.id) || typeof answer.checked !== "boolean") return null;
    const selected = answer.selected === null
      ? null
      : typeof answer.selected === "string" && /^[A-E]$/.test(answer.selected)
        ? answer.selected
        : undefined;
    if (selected === undefined || (answer.checked && (!selected || typeof answer.correct !== "boolean"))) return null;
    seen.add(answer.id);
    snapshot.push({
      id: answer.id,
      selected,
      checked: answer.checked,
      correct: answer.checked ? answer.correct : null
    });
  }
  return snapshot;
}

export function resolveHistoryQuestions(entry, activeSession, questionsById) {
  if (!entry || typeof entry !== "object") return null;
  const stored = sanitizeQuestionSnapshot(entry.questions, clampCount(entry.total, 2000));
  if (stored) return stored;
  if (activeSession && activeSession.historyId === entry.id) {
    return createQuestionSnapshot(activeSession, questionsById);
  }
  return null;
}

export function createHistoryEntry(session, unit, updatedAt = new Date().toISOString(), questionsById) {
  if (!session || typeof session.historyId !== "string" || !session.historyId) return null;
  const summary = summarizeSession(session.questionIds, session.answers);
  if (!summary.total) return null;
  const startedAt = isValidDate(session.startedAt) ? session.startedAt : updatedAt;
  const entry = {
    id: session.historyId,
    startedAt,
    updatedAt: isValidDate(updatedAt) ? updatedAt : new Date().toISOString(),
    unit: typeof unit === "string" && unit.trim() ? unit.trim() : "Tüm üniteler",
    total: summary.total,
    correct: summary.correct,
    incorrect: summary.incorrect,
    unanswered: summary.unanswered,
    status: session.status === "complete" ? "complete" : "active"
  };
  const questions = createQuestionSnapshot(session, questionsById);
  if (questions) entry.questions = questions;
  return entry;
}

export function sanitizeHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const byId = new Map();
  for (const value of entries) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim()) continue;
    const total = clampCount(value.total, 2000);
    if (!total) continue;
    const startedAt = isValidDate(value.startedAt) ? value.startedAt : null;
    const updatedAt = isValidDate(value.updatedAt) ? value.updatedAt : startedAt;
    if (!startedAt || !updatedAt) continue;
    const questions = sanitizeQuestionSnapshot(value.questions, total);
    const correct = questions
      ? questions.filter((answer) => answer.checked && answer.correct === true).length
      : clampCount(value.correct, total);
    const incorrect = questions
      ? questions.filter((answer) => answer.checked && answer.correct === false).length
      : clampCount(value.incorrect, total - correct);
    const entry = {
      id: value.id.slice(0, 120),
      startedAt,
      updatedAt,
      unit: typeof value.unit === "string" ? value.unit.slice(0, 160) : "Tüm üniteler",
      total,
      correct,
      incorrect,
      unanswered: total - correct - incorrect,
      status: value.status === "complete" ? "complete" : "active"
    };
    if (questions) entry.questions = questions;
    byId.set(entry.id, entry);
  }
  return [...byId.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, HISTORY_LIMIT);
}

export function upsertHistoryEntry(entries, entry, limit = HISTORY_LIMIT) {
  const cleaned = sanitizeHistory(entries);
  const cleanEntry = sanitizeHistory([entry])[0];
  if (!cleanEntry) return cleaned.slice(0, limit);
  const updated = [cleanEntry, ...cleaned.filter((item) => item.id !== cleanEntry.id)];
  return updated
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.min(HISTORY_LIMIT, Math.max(0, limit)));
}

export function shouldRecordHistory(session) {
  return Boolean(session && !session.noHistory && !session.historySuppressed && !session.historyDeleted);
}
export function removeHistoryEntry(entries, entryId) {
  if (typeof entryId !== "string" || !entryId) return sanitizeHistory(entries);
  return sanitizeHistory(entries).filter((entry) => entry.id !== entryId);
}
