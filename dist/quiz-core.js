export function gradeAnswer(question, selectedKey) {
  const acceptedAnswers = Array.isArray(question && question.acceptedAnswers) ? question.acceptedAnswers : [];
  return Boolean(selectedKey) && acceptedAnswers.includes(selectedKey);
}

export function classifyOption(question, optionKey, selectedKey, checked) {
  if (!checked) return "neutral";
  const accepted = Array.isArray(question && question.acceptedAnswers) && question.acceptedAnswers.includes(optionKey);
  if (optionKey === selectedKey) return accepted ? "selected-correct" : "selected-wrong";
  return accepted ? "accepted-alternative" : "neutral";
}

export function classifyQuestionMapItem(question, record = {}) {
  if (!record || !record.selected) return "blank";
  if (!record.checked) return "pending";
  return gradeAnswer(question, record.selected) ? "correct" : "incorrect";
}

export function shuffleOptionKeys(options, random = Math.random) {
  const keys = Array.isArray(options) ? options.map((option) => option.key) : [];
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function restoreOptionOrder(savedOrder, options) {
  const keys = Array.isArray(options) ? options.map((option) => option.key) : [];
  if (!Array.isArray(savedOrder) || savedOrder.length !== keys.length || new Set(savedOrder).size !== keys.length || savedOrder.some((key) => !keys.includes(key))) return keys;
  return savedOrder.slice();
}
export function describeQuestionMapItem(position, unitTitle, sourceNumber, state) {
  const stateLabels = {
    blank: "boş",
    pending: "işaretli, kontrol edilmedi",
    correct: "doğru",
    incorrect: "yanlış"
  };
  const displayNumber = String(Number.isInteger(position) && position >= 0 ? position + 1 : 1);
  const source = sourceNumber ? ", " + unitTitle + ", soru numarası " + sourceNumber : ", " + unitTitle;
  return {
    displayNumber,
    accessibleLabel: "Soru " + displayNumber + source + ": " + (stateLabels[state] || "durumu bilinmiyor")
  };
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

export function hasUnfinishedQuestions(session) {
  if (!session || session.status !== "active" || !Array.isArray(session.questionIds)) return false;
  return summarizeSession(session.questionIds, session.answers).completed < session.questionIds.length;
}

export function confirmFreshStart(session, confirmStart, startFresh) {
  if (hasUnfinishedQuestions(session) && !confirmStart()) return false;
  startFresh();
  return true;
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
  const sourceOptionOrders = saved.optionOrders && typeof saved.optionOrders === "object" && !Array.isArray(saved.optionOrders)
    ? saved.optionOrders
    : {};
  const optionOrders = {};
  for (const id of questionIds) optionOrders[id] = restoreOptionOrder(sourceOptionOrders[id], questionsById.get(id).options);

  return {
    questionIds,
    index,
    answers,
    status: saved.status === "complete" ? "complete" : "active",
    historyId: typeof saved.historyId === "string" && saved.historyId ? saved.historyId : null,
    startedAt: typeof saved.startedAt === "string" ? saved.startedAt : null,
    historySuppressed: Boolean(saved.historySuppressed),
    noHistory: Boolean(saved.noHistory),
    historyDeleted: Boolean(saved.historyDeleted),
    originalIds,
    optionOrders,
    config: {
      unit: typeof config.unit === "string" || typeof config.unit === "number" ? String(config.unit) : "all",
      shuffle: Boolean(config.shuffle),
      shuffleOptions: Boolean(config.shuffleOptions)
    }
  };
}
export function summarizePendingAnswers(questionIds, answers = {}) {
  const pendingIds = [];
  const blankIds = [];
  for (const id of Array.isArray(questionIds) ? questionIds : []) {
    const record = answers && answers[id];
    if (!record || !record.selected) blankIds.push(id);
    else if (!record.checked) pendingIds.push(id);
  }
  return { pendingIds, blankIds };
}

export function gradePendingAnswers(questionIds, answers = {}, questionsById) {
  const nextAnswers = { ...(answers && typeof answers === "object" ? answers : {}) };
  const gradedIds = [];
  for (const id of Array.isArray(questionIds) ? questionIds : []) {
    const record = nextAnswers[id];
    if (!record || !record.selected || record.checked) continue;
    const question = questionsById && typeof questionsById.get === "function"
      ? questionsById.get(id)
      : questionsById && questionsById[id];
    if (!question) continue;
    nextAnswers[id] = {
      ...record,
      checked: true,
      correct: gradeAnswer(question, record.selected)
    };
    gradedIds.push(id);
  }
  return { answers: nextAnswers, gradedIds };
}
