export function gradeAnswer(question, selectedKey) {
  const acceptedAnswers = Array.isArray(question && question.acceptedAnswers) ? question.acceptedAnswers : [];
  return Boolean(selectedKey) && acceptedAnswers.includes(selectedKey);
}

export function summarizeSession(questionIds, answers = {}) {
  const ids = Array.isArray(questionIds) ? questionIds : [];
  let completed = 0;
  let correct = 0;
  const wrongIds = [];

  for (const id of ids) {
    const record = answers && answers[id];
    if (!record || !record.checked) continue;
    completed += 1;
    if (record.correct) correct += 1;
    else wrongIds.push(id);
  }

  return {
    total: ids.length,
    completed,
    correct,
    incorrect: completed - correct,
    unanswered: ids.length - completed,
    wrongIds
  };
}

export function restoreSession(saved, questionsById) {
  if (!saved || !Array.isArray(saved.questionIds) || saved.questionIds.length === 0) return null;

  const questionIds = [...new Set(saved.questionIds.filter((id) => questionsById.has(id)))];
  if (!questionIds.length) return null;

  const sourceAnswers = saved.answers && typeof saved.answers === "object" && !Array.isArray(saved.answers)
    ? saved.answers
    : {};
  const answers = {};

  for (const id of questionIds) {
    const record = sourceAnswers[id];
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const question = questionsById.get(id);
    const validKeys = new Set(Array.isArray(question.options) ? question.options.map((option) => option.key) : []);
    const selected = validKeys.has(record.selected) ? record.selected : undefined;
    if (!selected) continue;
    const checked = Boolean(record.checked);
    answers[id] = {
      selected,
      checked,
      correct: checked ? gradeAnswer(question, selected) : false
    };
  }

  const parsedIndex = Number(saved.index);
  const index = Math.min(Math.max(Number.isInteger(parsedIndex) ? parsedIndex : 0, 0), questionIds.length - 1);
  const originalIds = Array.isArray(saved.originalIds)
    ? saved.originalIds.filter((id) => questionsById.has(id))
    : questionIds.slice();
  const config = saved.config && typeof saved.config === "object" && !Array.isArray(saved.config)
    ? saved.config
    : {};

  return {
    questionIds,
    index,
    answers,
    status: saved.status === "complete" ? "complete" : "active",
    originalIds,
    config: {
      unit: typeof config.unit === "string" || typeof config.unit === "number" ? String(config.unit) : "all",
      shuffle: Boolean(config.shuffle)
    }
  };
}
