import { summarizeSession } from "./quiz-core.js";

export const HISTORY_LIMIT = 200;

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

export function createHistoryEntry(session, unit, updatedAt = new Date().toISOString()) {
  if (!session || typeof session.historyId !== "string" || !session.historyId) return null;
  const summary = summarizeSession(session.questionIds, session.answers);
  if (!summary.total) return null;
  const startedAt = isValidDate(session.startedAt) ? session.startedAt : updatedAt;
  return {
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
}

export function sanitizeHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const byId = new Map();
  for (const value of entries) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim()) continue;
    const total = clampCount(value.total, 2000);
    if (!total) continue;
    const correct = clampCount(value.correct, total);
    const incorrect = clampCount(value.incorrect, total - correct);
    const startedAt = isValidDate(value.startedAt) ? value.startedAt : null;
    const updatedAt = isValidDate(value.updatedAt) ? value.updatedAt : startedAt;
    if (!startedAt || !updatedAt) continue;
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
