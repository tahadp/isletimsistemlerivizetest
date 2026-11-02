import { classifyOption, classifyQuestionMapItem, confirmFreshStart, describeQuestionMapItem, gradeAnswer, gradePendingAnswers, restoreSession, shuffleOptionKeys, summarizePendingAnswers, summarizeSession } from "./quiz-core.js";
import {
  HISTORY_LIMIT,
  canRevealHistoryAnswer,
  removeHistoryEntry,
  createHistoryEntry,
  ensureHistoryIdentity,
  resolveHistoryQuestions,
  shouldRecordHistory,
  sanitizeHistory,
  upsertHistoryEntry
} from "./history-core.js";

(() => {
  const SESSION_KEY = "is-soru-cozum-session-v1";
  const HISTORY_KEY = "is-soru-cozum-history-v1";
  const byId = (id) => document.getElementById(id);
  const views = ["loading-view", "home-view", "quiz-view", "results-view", "history-review-view", "error-view"];
  const ui = {
    app: byId("app"), loading: byId("loading-view"), homeButton: byId("home-button"),
    unitFilter: byId("unit-filter"), shuffle: byId("shuffle"), shuffleOptions: byId("shuffle-options"), start: byId("start-button"),
    resume: byId("resume-button"), questionTotal: byId("question-total"), filterHint: byId("filter-hint"),
    quizUnit: byId("quiz-unit"), progressText: byId("progress-text"), progressTrack: byId("progress-track"),
    questionNumber: byId("question-number"), questionStatus: byId("question-status"),
    prompt: byId("question-prompt"), options: byId("options-list"), feedback: byId("feedback"),
    check: byId("check-button"), previous: byId("previous-button"), next: byId("next-button"),
    endWarning: byId("end-warning"), endWarningText: byId("end-warning-text"),
    finishAnyway: byId("finish-anyway-button"), returnToIncomplete: byId("return-to-incomplete-button"),
    questionNav: byId("question-nav"), questionMap: byId("question-map"), questionMapList: byId("question-map-list"),
    wrongReviewNav: byId("wrong-review-nav"),
    wrongReviewPrevious: byId("wrong-review-previous"), wrongReviewNext: byId("wrong-review-next"),
    wrongReviewReturn: byId("wrong-review-return"), wrongReviewPosition: byId("wrong-review-position"),
    wrongReviewSection: byId("wrong-review-section"), wrongReviewList: byId("wrong-review-list"),
    solvedCount: byId("solved-count"), resultSummary: byId("result-summary"), resultStats: byId("result-stats"),
    retry: byId("retry-button"), review: byId("review-button"), newRound: byId("new-round-button"),
    historySection: byId("history-section"), historyTotals: byId("history-totals"),
    historyEmpty: byId("history-empty"), historyList: byId("history-list"),
    clearHistory: byId("clear-history-button"),
    historyReviewHeading: byId("history-review-heading"), historyReviewSummary: byId("history-review-summary"),
    historyReviewMessage: byId("history-review-message"), historyReviewDetail: byId("history-review-detail"),
    historyReviewList: byId("history-review-question-list"), historyReviewBack: byId("history-review-back"),
    historyReviewPreviousWrong: byId("history-review-previous-wrong"),
    historyReviewNextWrong: byId("history-review-next-wrong"),
    historyReviewWrongPosition: byId("history-review-wrong-position"),
    storageNotice: byId("storage-notice"), error: byId("error-view")
  };

  let data;
  let questionById = new Map();
  let session = null;
  let unitsById = new Map();
  let historyEntries = [];
  let historyLimitNotice = false;
  let wrongReviewIds = [];
  let wrongReviewIndex = 0;
  let reviewMode = false;
  let historyReviewEntry = null;
  let historyReviewWrongIds = [];
  let historyReviewWrongIndex = 0;

  function showView(viewId) {
    for (const id of views) byId(id).classList.toggle("hidden", id !== viewId);
    ui.homeButton.classList.toggle("hidden", viewId === "home-view" || viewId === "loading-view" || viewId === "error-view");
  }

  function showStorageNotice(message) {
    if (!ui.storageNotice) return;
    ui.storageNotice.textContent = message;
    ui.storageNotice.classList.toggle("hidden", !message);
  }

  function clearStorageNotice() {
    if (!historyLimitNotice) showStorageNotice("");
  }

  function createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    return "session-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function loadSavedSession() {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return null;
      const restored = restoreSession(JSON.parse(stored), questionById);
      if (!restored) return null;
      const migrated = ensureHistoryIdentity(restored, createId);
      if (migrated.historyId !== restored.historyId || migrated.startedAt !== restored.startedAt) {
        session = migrated;
        saveSession();
      }
      return migrated;
    } catch {
      showStorageNotice("Bu tarayıcıdaki oturum okunamadı; yeni cevaplar kaydedilmeyebilir.");
      return null;
    }
  }

  function saveSession() {
    if (!session) return false;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return true;
    } catch {
      showStorageNotice("Oturum bu tarayıcıya kaydedilemedi.");
      return false;
    }
  }

  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      const cleaned = sanitizeHistory(parsed);
      if (!Array.isArray(parsed)) {
        showStorageNotice("Geçmiş verisi okunamadı; yeni kayıtlar bu tarayıcıda tutulabilir.");
      } else if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) {
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned));
        } catch {
          showStorageNotice("Geçmiş temizlendi ancak bu tarayıcıya yazılamadı.");
        }
      }
      return cleaned;
    } catch {
      showStorageNotice("Geçmiş verisi okunamadı; yeni kayıtlar bu tarayıcıda tutulabilir.");
      return [];
    }
  }

  function writeHistory(nextEntries) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextEntries));
      historyEntries = nextEntries;
      return true;
    } catch {
      showStorageNotice("Geçmiş bu tarayıcıya kaydedilemedi.");
      return false;
    }
  }
  function populateUnits() {
    const units = Array.isArray(data.units) ? data.units.slice().sort((a, b) => Number(a.id) - Number(b.id)) : [];
    unitsById = new Map(units.map((unit) => [Number(unit.id), unit]));
    for (const unit of units) {
      const option = document.createElement("option");
      option.value = String(unit.id);
      option.textContent = unit.title;
      ui.unitFilter.append(option);
    }
  }

  function filteredQuestions() {
    const selectedUnit = ui.unitFilter.value;
    return data.questions.filter((question) => question.type === "test" && (selectedUnit === "all" || String(question.unit) === selectedUnit));
  }

  function updateHistoryView() {
    if (!ui.historySection) return;
    ui.historyList.replaceChildren();
    const totals = historyEntries.reduce((result, entry) => {
      result.sessions += 1;
      result.correct += entry.correct;
      result.incorrect += entry.incorrect;
      result.unanswered += entry.unanswered;
      return result;
    }, { sessions: 0, correct: 0, incorrect: 0, unanswered: 0 });

    const totalLine = document.createElement("p");
    totalLine.className = "history-totals-line";
    totalLine.textContent = totals.sessions + " oturum · " + totals.correct + " doğru · " + totals.incorrect + " yanlış · " + totals.unanswered + " boş";
    ui.historyTotals.replaceChildren(totalLine);
    ui.historyEmpty.classList.toggle("hidden", historyEntries.length > 0);
    ui.clearHistory.disabled = historyEntries.length === 0;

    const dateFormat = new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short"
    });
    for (const entry of historyEntries) {
      const item = document.createElement("li");
      item.className = "history-item";
      const heading = document.createElement("div");
      heading.className = "history-item-heading";
      const unit = document.createElement("strong");
      unit.textContent = entry.unit;
      const date = document.createElement("time");
      date.dateTime = entry.startedAt;
      date.textContent = dateFormat.format(new Date(entry.startedAt));
      const details = document.createElement("p");
      details.textContent = entry.total + " soru · " + entry.correct + " doğru · " + entry.incorrect + " yanlış · " + entry.unanswered + " boş";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "button secondary history-open-button";
      openButton.textContent = "İncele";
      openButton.setAttribute("aria-label", "Bu oturumun sorularını incele: " + entry.unit + ", " + date.textContent);
      openButton.addEventListener("click", () => openHistoryEntry(entry.id));
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "button secondary history-delete-button";
      removeButton.textContent = "Sil";
      removeButton.setAttribute("aria-label", "Bu kaydı sil: " + entry.unit + ", " + date.textContent);
      removeButton.addEventListener("click", () => deleteHistoryEntry(entry.id));
      heading.append(unit, date);
      item.append(heading, details, openButton, removeButton);
      ui.historyList.append(item);
    }
  }

  function openHistoryEntry(entryId) {
    const entry = historyEntries.find((item) => item.id === entryId);
    if (!entry) return;
    let answers;
    if (session && session.historyId === entry.id) {
      const current = createHistoryEntry(session, historyUnit(), undefined, questionById);
      answers = current && current.questions ? current.questions : null;
      historyReviewEntry = current || { ...entry };
    } else {
      answers = resolveHistoryQuestions(entry, null, questionById);
      historyReviewEntry = { ...entry, ...(answers ? { questions: answers } : {}) };
    }
    historyReviewWrongIds = answers
      ? answers.filter((answer) => answer.checked && answer.correct === false).map((answer) => answer.id)
      : [];
    historyReviewWrongIndex = 0;
    renderHistoryReview();
    showView("history-review-view");
    if (historyReviewWrongIds.length) focusHistoryWrong(0);
    else ui.historyReviewHeading.focus();
  }

  function historyAnswerStatus(answer) {
    if (!answer.checked) return answer.selected ? "Kontrol edilmedi" : "Boş";
    return answer.correct ? "Doğru" : "Yanlış";
  }

  function renderHistoryReview() {
    const entry = historyReviewEntry;
    if (!entry) return;
    ui.historyReviewSummary.textContent = entry.unit + " · " + entry.total + " soru · " + entry.correct + " doğru · " + entry.incorrect + " yanlış · " + entry.unanswered + " boş";
    ui.historyReviewList.replaceChildren();
    const answers = Array.isArray(entry.questions) ? entry.questions : null;
    ui.historyReviewDetail.classList.toggle("hidden", !answers);
    ui.historyReviewMessage.classList.toggle("hidden", Boolean(answers));
    if (!answers) {
      ui.historyReviewMessage.textContent = "Bu eski kayıt yalnızca toplam sonuçları içeriyor; soru yanıtları kaydedilmediği için ayrıntılar gösterilemiyor.";
      ui.historyReviewWrongPosition.textContent = "";
      ui.historyReviewPreviousWrong.disabled = true;
      ui.historyReviewNextWrong.disabled = true;
      return;
    }

    ui.historyReviewMessage.textContent = "";
    const orderedAnswers = entry.questions;
    historyReviewWrongIds = orderedAnswers
      .filter((answer) => answer.checked && answer.correct === false)
      .map((answer) => answer.id);
    for (let index = 0; index < orderedAnswers.length; index += 1) {
      const answer = orderedAnswers[index];
      const question = questionById.get(answer.id);
      const item = document.createElement("li");
      item.className = "history-review-question";
      item.id = "history-review-question-" + (index + 1);
      item.tabIndex = -1;
      if (answer.checked && answer.correct === false) item.classList.add("is-wrong");
      if (answer.checked && answer.correct === true) item.classList.add("is-correct");

      const heading = document.createElement("h3");
      heading.textContent = "Soru " + (question ? question.number : index + 1) + " · " + historyAnswerStatus(answer);
      item.append(heading);
      if (!question) {
        const missing = document.createElement("p");
        missing.textContent = "Bu sorunun metni mevcut soru dosyasında bulunmuyor.";
        item.append(missing);
        ui.historyReviewList.append(item);
        continue;
      }

      const prompt = document.createElement("p");
      prompt.className = "history-review-prompt";
      prompt.textContent = question.prompt;
      const optionText = (key) => {
        const option = (question.options || []).find((candidate) => candidate.key === key);
        return option ? key + " — " + option.text : key;
      };
      const selected = document.createElement("p");
      selected.textContent = answer.selected ? "Seçimin: " + optionText(answer.selected) : "Yanıt: boş";
      item.append(prompt, selected);
      if (canRevealHistoryAnswer(answer) && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
        const accepted = document.createElement("p");
        accepted.textContent = "Kabul edilen: " + question.acceptedAnswers.map(optionText).join(" · ");
        item.append(accepted);
      }
      if (canRevealHistoryAnswer(answer) && question.explanation) {
        const explanation = document.createElement("p");
        explanation.className = "history-review-explanation";
        explanation.textContent = question.explanation;
        item.append(explanation);
      }
      if (question.source && question.source.title) {
        const source = document.createElement("p");
        source.className = "history-review-source";
        source.textContent = question.source.title + " · PDF s. " + question.source.pdfPage + (question.source.bookPage ? " · Kitap s. " + question.source.bookPage : "");
        item.append(source);
      }
      ui.historyReviewList.append(item);
    }

    ui.historyReviewWrongPosition.textContent = historyReviewWrongIds.length
      ? "Yanlış " + (historyReviewWrongIndex + 1) + " / " + historyReviewWrongIds.length
      : "Yanlış soru yok";
    ui.historyReviewPreviousWrong.disabled = historyReviewWrongIndex <= 0;
    ui.historyReviewNextWrong.disabled = historyReviewWrongIndex >= historyReviewWrongIds.length - 1;
  }

  function moveHistoryReviewWrong(direction) {
    const nextIndex = historyReviewWrongIndex + direction;
    if (nextIndex < 0 || nextIndex >= historyReviewWrongIds.length) return;
    historyReviewWrongIndex = nextIndex;
    renderHistoryReview();
    focusHistoryWrong(nextIndex);
  }

  function focusHistoryWrong(wrongIndex) {
    const answerIndex = historyReviewEntry.questions.findIndex((answer) => answer.id === historyReviewWrongIds[wrongIndex]);
    const target = byId("history-review-question-" + (answerIndex + 1));
    if (target) {
      target.scrollIntoView({ block: "nearest" });
      target.focus();
    }
  }

  function closeHistoryReview() {
    historyReviewEntry = null;
    historyReviewWrongIds = [];
    historyReviewWrongIndex = 0;
    updateHome();
    showView("home-view");
    byId("history-heading").focus();
  }

  function deleteHistoryEntry(entryId) {
    const entry = historyEntries.find((item) => item.id === entryId);
    if (!entry || !window.confirm("“" + entry.unit + "” geçmiş kaydı silinsin mi?")) return;
    const matchesActiveSession = Boolean(session && session.historyId === entryId);
    const previousSuppressed = matchesActiveSession ? session.historySuppressed : false;
    const previousDeleted = matchesActiveSession ? session.historyDeleted : false;
    if (matchesActiveSession) {
      session.historyDeleted = true;
      if (!saveSession()) {
        session.historyDeleted = previousDeleted;
        session.historySuppressed = previousSuppressed;
        return;
      }
    }

    const remaining = removeHistoryEntry(historyEntries, entryId);
    if (!writeHistory(remaining)) {
      if (matchesActiveSession) {
        session.historyDeleted = previousDeleted;
        session.historySuppressed = previousSuppressed;
        saveSession();
      }
      return;
    }
    historyLimitNotice = false;
    clearStorageNotice();
    updateHistoryView();
    if (historyEntries.length) ui.clearHistory.focus();
    else byId("history-heading").focus();
  }
  function updateHome() {
    const count = filteredQuestions().length;
    ui.questionTotal.textContent = count + " soru";
    ui.start.disabled = count === 0;
    ui.start.classList.toggle("is-disabled", count === 0);
    ui.filterHint.textContent = count ? "" : "Bu ünite için test sorusu bulunmuyor.";
    ui.resume.classList.toggle("hidden", !session);
    ui.resume.textContent = session && session.status === "complete" ? "Son oturumu incele" : "Devam et";
    updateHistoryView();
  }

  function mix(items) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function beginSession(questions, config) {
    reviewMode = false;
    wrongReviewIds = [];
    wrongReviewIndex = 0;
    const questionIds = questions.map((question) => question.id);
    if (!questionIds.length) return;
    session = {
      questionIds,
      originalIds: questionIds.slice(),
      optionOrders: Object.fromEntries(questions.map((question) => [question.id,
        config.optionOrders && Array.isArray(config.optionOrders[question.id])
          ? config.optionOrders[question.id].slice()
          : config.shuffleOptions ? shuffleOptionKeys(question.options) : question.options.map((option) => option.key)
      ])),
      index: 0,
      answers: {},
      status: "active",
      historyId: createId(),
      startedAt: new Date().toISOString(),
      historySuppressed: false,
      noHistory: Boolean(config.noHistory),
      config: { unit: config.unit || "all", shuffle: Boolean(config.shuffle), shuffleOptions: Boolean(config.shuffleOptions) }
    };
    saveSession();
    renderQuestion();
    showView("quiz-view");
    ui.prompt.focus();
  }

  function currentQuestion() {
    const questionId = reviewMode ? wrongReviewIds[wrongReviewIndex] : session.questionIds[session.index];
    return questionById.get(questionId);
  }
  function unitTitle(question) {
    const unit = unitsById.get(Number(question.unit));
    return unit ? unit.title : "Ünite " + question.unit;
  }

  function historyUnit() {
    const configUnit = session && session.config ? String(session.config.unit) : "all";
    if (configUnit === "all") return "Tüm üniteler";
    const unit = unitsById.get(Number(configUnit));
    return unit ? unit.title : "Ünite " + configUnit;
  }

  function answerRecord(question) {
    return session.answers[question.id] || {};
  }

  function completedCount() {
    return summarizeSession(session.questionIds, session.answers).completed;
  }

  function recordHistory() {
    if (!session) return false;
    if (!shouldRecordHistory(session)) return true;
    session = ensureHistoryIdentity(session, createId);
    const existing = historyEntries.some((entry) => entry.id === session.historyId);
    if (!existing && completedCount() === 0) return true;
    const entry = createHistoryEntry(session, historyUnit(), undefined, questionById);
    const nextEntries = upsertHistoryEntry(historyEntries, entry);
    const isAtLimit = !existing && historyEntries.length >= HISTORY_LIMIT;
    if (!writeHistory(nextEntries)) return false;
    if (isAtLimit) {
      historyLimitNotice = true;
      showStorageNotice("Geçmişte en fazla 200 oturum tutulur; en eski kayıtlar kaldırılır.");
    }
    updateHistoryView();
    return true;
  }

  function renderQuestion() {
    const question = currentQuestion();
    if (!question) return;
    ui.endWarning.classList.add("hidden");
    const record = answerRecord(question);
    const total = reviewMode ? wrongReviewIds.length : session.questionIds.length;
    const position = reviewMode ? wrongReviewIndex : session.index;
    const done = completedCount();
    ui.quizUnit.textContent = unitTitle(question);
    ui.questionNumber.textContent = "Soru " + (question.number || session.index + 1);
    ui.prompt.textContent = question.prompt;
    ui.progressText.textContent = reviewMode
      ? "Yanlış " + (position + 1) + " / " + total
      : done + " / " + total;
    ui.progressTrack.max = total;
    ui.progressTrack.value = reviewMode ? position + 1 : done;
    ui.solvedCount.textContent = done + " / " + session.questionIds.length + " kontrol edildi";
    ui.questionNav.classList.toggle("hidden", reviewMode);
    ui.questionMap.classList.toggle("hidden", reviewMode);
    ui.wrongReviewNav.classList.toggle("hidden", !reviewMode);
    ui.previous.disabled = session.index === 0;
    ui.previous.classList.toggle("is-disabled", session.index === 0);
    ui.next.textContent = session.index === session.questionIds.length - 1 ? "Sonuçlar" : "Sonraki";
    ui.wrongReviewPosition.textContent = "Yanlış " + (wrongReviewIndex + 1) + " / " + wrongReviewIds.length;
    ui.wrongReviewPrevious.disabled = wrongReviewIndex === 0;
    ui.wrongReviewNext.disabled = wrongReviewIndex === wrongReviewIds.length - 1;
    renderQuestionMap();
    ui.options.replaceChildren();
    const legend = document.createElement("legend");
    legend.className = "sr-only";
    legend.textContent = "Cevap seçenekleri";
    ui.options.append(legend);

    const chosen = record.selected;
    const options = Array.isArray(question.options) ? question.options : [];
    const order = session.optionOrders && session.optionOrders[question.id];
    const optionByKey = new Map(options.map((option) => [option.key, option]));
    const renderedOptions = Array.isArray(order) ? order.map((key) => optionByKey.get(key)).filter(Boolean) : options;
    for (const option of renderedOptions) {
      const label = document.createElement("label");
      label.className = "option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "answer";
      radio.value = option.key;
      radio.checked = chosen === option.key;
      radio.disabled = Boolean(record.checked);
      const key = document.createElement("span");
      key.className = "option-key";
      key.textContent = option.key;
      const copy = document.createElement("span");
      copy.className = "option-text";
      copy.textContent = option.text;
      label.append(radio, key, copy);

      const optionState = classifyOption(question, option.key, chosen, Boolean(record.checked));
      if (optionState === "selected-correct") {
        label.classList.add("is-correct");
        addOptionMarker(copy, "Doğru cevap", "correct");
      } else if (optionState === "selected-wrong") {
        label.classList.add("is-wrong");
        addOptionMarker(copy, "Yanlış", "wrong");
      } else if (optionState === "accepted-alternative") {
        label.classList.add("is-accepted");
        addOptionMarker(copy, "Kabul edilen cevap", "accepted");
      }

      radio.addEventListener("change", () => {
        if (record.checked || reviewMode) return;
        ui.endWarning.classList.add("hidden");
        session.answers[question.id] = { ...record, selected: radio.value, checked: false };
        saveSession();
        renderQuestionMap();
        recordHistory();
      });
      ui.options.append(label);
    }

    ui.feedback.className = "feedback hidden";
    ui.feedback.replaceChildren();
    ui.check.classList.toggle("hidden", Boolean(record.checked));
    ui.questionStatus.className = "status-pill";
    ui.questionStatus.textContent = record.checked ? (record.correct ? "Doğru" : "Yanlış") : "";
    if (record.checked) {
      ui.questionStatus.classList.add(record.correct ? "correct" : "incorrect");
      renderFeedback(question);
    }
  }

  function renderQuestionMap() {
    if (!session || reviewMode || !ui.questionMapList) return;
    ui.questionMapList.replaceChildren();
    session.questionIds.forEach((questionId, index) => {
      const question = questionById.get(questionId);
      if (!question) return;
      const state = classifyQuestionMapItem(question, session.answers[questionId]);
      const item = document.createElement("li");
      const button = document.createElement("button");
      const description = describeQuestionMapItem(index, unitTitle(question), question.number, state);
      button.type = "button";
      button.className = "question-map-item map-status-" + state;
      button.textContent = description.displayNumber;
      button.setAttribute("aria-label", description.accessibleLabel);
      if (index === session.index) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => {
        session.index = index;
        saveSession();
        renderQuestion();
        ui.prompt.focus();
      });
      item.append(button);
      ui.questionMapList.append(item);
    });
  }
  function addOptionMarker(optionText, text, state) {
    const marker = document.createElement("span");
    marker.className = "answer-marker " + state;
    marker.textContent = text;
    optionText.append(marker);
  }

  function renderFeedback(question) {
    const record = answerRecord(question);
    const isCorrect = gradeAnswer(question, record.selected);
    ui.feedback.className = "feedback " + (isCorrect ? "is-correct" : "is-incorrect");
    ui.feedback.replaceChildren();

    const heading = document.createElement("strong");
    heading.className = "feedback-heading " + (isCorrect ? "is-correct" : "is-incorrect");
    heading.textContent = isCorrect ? "Doğru." : "Yanlış.";
    ui.feedback.append(heading);

    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    const acceptedText = accepted.map((key) => {
      const option = (question.options || []).find((item) => item.key === key);
      return option ? key + " — " + option.text : key;
    });
    const answerLine = document.createElement("span");
    answerLine.textContent = "Kabul edilen cevap" + (accepted.length > 1 ? "lar" : "") + ": " + acceptedText.join(" · ");
    ui.feedback.append(answerLine);

    if (question.bookAnswer) {
      const bookLine = document.createElement("span");
      const bookOption = (question.options || []).find((item) => item.key === question.bookAnswer);
      bookLine.textContent = "Kitap anahtarı: " + question.bookAnswer + (bookOption ? " — " + bookOption.text : "");
      ui.feedback.append(bookLine);
    }
    if (question.conflictNote) {
      const note = document.createElement("span");
      note.textContent = question.conflictNote;
      ui.feedback.append(note);
    }
    if (question.explanation) {
      const explanation = document.createElement("p");
      explanation.className = "feedback-explanation";
      explanation.textContent = question.explanation;
      ui.feedback.append(explanation);
    }
    if (question.source && question.source.title) {
      const source = document.createElement("span");
      source.className = "source";
      source.textContent = question.source.title + " · PDF s. " + question.source.pdfPage + (question.source.bookPage ? " · Kitap s. " + question.source.bookPage : "");
      ui.feedback.append(source);
    }
    ui.feedback.classList.remove("hidden");
  }

  function updateWrongReviewList(questionIds) {
    ui.wrongReviewList.replaceChildren();
    ui.wrongReviewSection.classList.toggle("hidden", questionIds.length === 0);
    for (const questionId of questionIds) {
      const question = questionById.get(questionId);
      if (!question) continue;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wrong-review-item";
      const prompt = String(question.prompt || "").replace(/\s+/g, " ").trim();
      button.textContent = unitTitle(question) + " · Soru " + (question.number || "") + " · " + (prompt.length > 105 ? prompt.slice(0, 102) + "…" : prompt);
      button.addEventListener("click", () => openWrongReview(questionId));
      item.append(button);
      ui.wrongReviewList.append(item);
    }
  }

  function openWrongReview(questionId) {
    if (!session) return;
    wrongReviewIds = summarizeSession(session.questionIds, session.answers).wrongIds;
    wrongReviewIndex = wrongReviewIds.indexOf(questionId);
    if (wrongReviewIndex < 0) return;
    reviewMode = true;
    showView("quiz-view");
    renderQuestion();
    ui.prompt.focus();
  }

  function moveWrongReview(direction) {
    const nextIndex = wrongReviewIndex + direction;
    if (nextIndex < 0 || nextIndex >= wrongReviewIds.length) return;
    wrongReviewIndex = nextIndex;
    renderQuestion();
    ui.prompt.focus();
  }

  function returnToResults() {
    reviewMode = false;
    showView("results-view");
    byId("results-heading").focus();
  }

  function checkAnswer() {
    const question = currentQuestion();
    const selected = ui.options.querySelector('input[type="radio"]:checked');
    if (!selected) {
      ui.endWarning.classList.add("hidden");
      ui.feedback.className = "feedback is-info";
      ui.feedback.textContent = "Bir cevap seç.";
      return;
    }
    ui.endWarning.classList.add("hidden");
    const correct = gradeAnswer(question, selected.value);
    session.answers[question.id] = { selected: selected.value, checked: true, correct };
    if (!session.noHistory && !session.historyDeleted) session.historySuppressed = false;
    session = ensureHistoryIdentity(session, createId);
    const sessionSaved = saveSession();
    const historySaved = recordHistory();
    if (sessionSaved && historySaved && !historyLimitNotice) clearStorageNotice();
    renderQuestion();
  }

  function finishSession() {
    const { pendingIds, blankIds } = summarizePendingAnswers(session.questionIds, session.answers);
    if (pendingIds.length || blankIds.length) {
      const messages = [];
      if (pendingIds.length) {
        messages.push(pendingIds.length + " işaretli yanıt kontrol edilmedi. Bitir seçeneği bunları otomatik değerlendirecek.");
      }
      if (blankIds.length) {
        messages.push(blankIds.length + " soru boş bırakıldı ve boş kalacak.");
      }
      ui.endWarningText.textContent = messages.join(" ");
      ui.returnToIncomplete.textContent = blankIds.length
        ? "Boşlara dön (" + blankIds.length + ")"
        : "İşaretli yanıtlara dön (" + pendingIds.length + ")";
      ui.endWarning.classList.remove("hidden");
      ui.finishAnyway.disabled = false;
      ui.finishAnyway.focus();
      return;
    }
    finalizeSession();
  }

  function returnToIncomplete() {
    const { pendingIds, blankIds } = summarizePendingAnswers(session.questionIds, session.answers);
    const targetId = blankIds[0] || pendingIds[0];
    if (!targetId) return;
    session.index = session.questionIds.indexOf(targetId);
    ui.endWarning.classList.add("hidden");
    saveSession();
    renderQuestion();
    ui.prompt.focus();
  }

  function finalizeSession() {
    ui.finishAnyway.disabled = true;
    const graded = gradePendingAnswers(session.questionIds, session.answers, questionById);
    session.answers = graded.answers;
    const summary = summarizeSession(session.questionIds, session.answers);
    session.status = summary.unanswered === 0 ? "complete" : "active";
    const sessionSaved = saveSession();
    const historySaved = recordHistory();
    if (sessionSaved && historySaved && !historyLimitNotice) clearStorageNotice();
    ui.endWarning.classList.add("hidden");
    showView("results-view");
    byId("results-heading").focus();
    ui.resultSummary.textContent = summary.unanswered
      ? summary.total + " soruluk tur tamamlandı. " + summary.unanswered + " soru boş kaldı."
      : summary.total + " soruluk tur tamamlandı.";
    ui.resultStats.replaceChildren();
    for (const [value, label] of [[summary.correct, "Doğru"], [summary.incorrect, "Yanlış"], [summary.unanswered, "Boş"]]) {
      const stat = document.createElement("div");
      stat.className = "stat";
      const amount = document.createElement("strong");
      amount.textContent = String(value);
      const caption = document.createElement("span");
      caption.textContent = label;
      stat.append(amount, caption);
      ui.resultStats.append(stat);
    }
    updateWrongReviewList(summary.wrongIds);
    ui.retry.classList.toggle("hidden", summary.wrongIds.length === 0);
  }
  function retryWrong() {
    const wrong = session.questionIds
      .filter((id) => {
        const record = session.answers[id];
        return record && record.checked && !record.correct;
      })
      .map((id) => questionById.get(id));
    if (wrong.length) beginSession(wrong, { unit: session.config.unit, shuffle: false, shuffleOptions: session.config.shuffleOptions, optionOrders: session.optionOrders, noHistory: true });
  }

  function returnToFirstUnansweredOrStart() {
    if (!session) return;
    reviewMode = false;
    const firstUnanswered = session.questionIds.findIndex((id) => !session.answers[id] || !session.answers[id].checked);
    session.index = firstUnanswered >= 0 ? firstUnanswered : 0;
    session.status = "active";
    saveSession();
    showView("quiz-view");
    renderQuestion();
    ui.prompt.focus();
  }

  async function init() {
    try {
      if (ui.storageNotice && ui.storageNotice.parentElement) {
        ui.app.insertBefore(ui.storageNotice, ui.loading.nextSibling);
      }
      const response = await fetch("./questions.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      data = await response.json();
      if (!Array.isArray(data.questions) || !Array.isArray(data.units)) throw new Error("Soru dosyasının biçimi beklenen yapıyla uyuşmuyor.");
      data.questions = data.questions.filter((question) => question && question.type === "test" && question.id);
      questionById = new Map(data.questions.map((question) => [question.id, question]));
      populateUnits();
      session = loadSavedSession();
      historyEntries = loadHistory();
      if (session && shouldRecordHistory(session) && completedCount() > 0 && !historyEntries.some((entry) => entry.id === session.historyId)) {
        recordHistory();
      }
      updateHome();
      showView("home-view");

      ui.unitFilter.addEventListener("change", updateHome);
      ui.start.addEventListener("click", () => {
        confirmFreshStart(session, () => window.confirm("Devam eden oturumdaki cevaplanmamış sorular kaybolacak. Yeni teste başlamak istiyor musun?"), () => {
          const questions = filteredQuestions();
          const ordered = ui.shuffle.checked ? mix(questions) : questions;
          beginSession(ordered, { unit: ui.unitFilter.value, shuffle: ui.shuffle.checked, shuffleOptions: ui.shuffleOptions.checked });
        });
      });
      ui.resume.addEventListener("click", returnToFirstUnansweredOrStart);
      ui.homeButton.addEventListener("click", () => { reviewMode = false; updateHome(); showView("home-view"); });
      ui.check.addEventListener("click", checkAnswer);
      ui.finishAnyway.addEventListener("click", finalizeSession);
      ui.returnToIncomplete.addEventListener("click", returnToIncomplete);
      ui.previous.addEventListener("click", () => {
        if (reviewMode || session.index === 0) return;
        session.index -= 1;
        saveSession();
        renderQuestion();
        ui.prompt.focus();
      });
      ui.next.addEventListener("click", () => {
        if (reviewMode) return;
        if (session.index < session.questionIds.length - 1) {
          session.index += 1;
          saveSession();
          renderQuestion();
          ui.prompt.focus();
        } else {
          finishSession();
        }
      });
      ui.retry.addEventListener("click", retryWrong);
      ui.wrongReviewPrevious.addEventListener("click", () => moveWrongReview(-1));
      ui.wrongReviewNext.addEventListener("click", () => moveWrongReview(1));
      ui.wrongReviewReturn.addEventListener("click", returnToResults);
      ui.review.addEventListener("click", returnToFirstUnansweredOrStart);
      ui.newRound.addEventListener("click", () => {
        ui.unitFilter.value = session && session.config ? session.config.unit : "all";
        ui.shuffle.checked = Boolean(session && session.config && session.config.shuffle);
        ui.shuffleOptions.checked = Boolean(session && session.config && session.config.shuffleOptions);
        updateHome();
        showView("home-view");
        ui.start.focus();
      });
      ui.clearHistory.addEventListener("click", () => {
        if (historyEntries.length && !window.confirm("Geçmişi silmek istiyor musun?")) return;
        if (!writeHistory([])) return;
        historyLimitNotice = false;
        let sessionSaved = true;
        if (session) {
          session.historySuppressed = true;
          sessionSaved = saveSession();
        }
        if (sessionSaved) clearStorageNotice();
        updateHistoryView();
      });
      ui.historyReviewBack.addEventListener("click", closeHistoryReview);
      ui.historyReviewPreviousWrong.addEventListener("click", () => moveHistoryReviewWrong(-1));
      ui.historyReviewNextWrong.addEventListener("click", () => moveHistoryReviewWrong(1));
    } catch {
      ui.error.textContent = "Sorular yüklenemedi. Bağlantını kontrol edip sayfayı yenile.";
      showView("error-view");
    }
  }

  init();
})();
