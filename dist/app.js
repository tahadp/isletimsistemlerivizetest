import { gradeAnswer, restoreSession, summarizeSession } from "./quiz-core.js";
"use strict";

(() => {
  const STORAGE_KEY = "is-soru-cozum-session-v1";
  const byId = (id) => document.getElementById(id);
  const views = ["loading-view", "home-view", "quiz-view", "results-view", "error-view"];
  const ui = {
    homeButton: byId("home-button"), unitFilter: byId("unit-filter"), shuffle: byId("shuffle"),
    start: byId("start-button"), resume: byId("resume-button"), questionTotal: byId("question-total"),
    filterHint: byId("filter-hint"), quizUnit: byId("quiz-unit"), progressText: byId("progress-text"),
    progressFill: byId("progress-fill"), progressTrack: document.querySelector(".progress-track"), questionNumber: byId("question-number"), questionStatus: byId("question-status"),
    prompt: byId("question-prompt"), options: byId("options-list"), feedback: byId("feedback"),
    check: byId("check-button"), previous: byId("previous-button"), next: byId("next-button"),
    solvedCount: byId("solved-count"), resultSummary: byId("result-summary"), resultStats: byId("result-stats"),
    retry: byId("retry-button"), review: byId("review-button"), newRound: byId("new-round-button"), error: byId("error-view")
  };

  let data;
  let questionById = new Map();
  let session = null;
  let unitsById = new Map();

  function showView(viewId) {
    for (const id of views) byId(id).classList.toggle("hidden", id !== viewId);
    ui.homeButton.classList.toggle("hidden", viewId === "home-view" || viewId === "loading-view" || viewId === "error-view");
  }

  function loadSavedSession() {
    try {
      return restoreSession(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"), questionById);
    } catch {
      return null;
    }
  }

  function saveSession() {
    if (!session) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // The quiz remains usable when browser storage is unavailable.
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

  function updateHome() {
    const count = filteredQuestions().length;
    ui.questionTotal.textContent = count + " soru";
    ui.start.disabled = count === 0;
    ui.start.classList.toggle("is-disabled", count === 0);
    ui.filterHint.textContent = count ? "" : "Bu ünite için test sorusu bulunmuyor.";
    ui.resume.classList.toggle("hidden", !session);
    ui.resume.textContent = session && session.status === "complete" ? "Son oturumu incele" : "Kaldığım yerden devam et";
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
    const questionIds = questions.map((question) => question.id);
    if (!questionIds.length) return;
    session = {
      questionIds,
      originalIds: questionIds.slice(),
      index: 0,
      answers: {},
      status: "active",
      config: { unit: config.unit || "all", shuffle: Boolean(config.shuffle) }
    };
    saveSession();
    renderQuestion();
    showView("quiz-view");
    ui.prompt.focus();
  }

  function currentQuestion() {
    return questionById.get(session.questionIds[session.index]);
  }

  function unitTitle(question) {
    const unit = unitsById.get(Number(question.unit));
    return unit ? unit.title : "Ünite " + question.unit;
  }

  function answerRecord(question) {
    return session.answers[question.id] || {};
  }

  function completedCount() {
    return session.questionIds.reduce((total, id) => {
      const record = session.answers[id];
      return total + (record && record.checked ? 1 : 0);
    }, 0);
  }

  function renderQuestion() {
    const question = currentQuestion();
    if (!question) return;
    const record = answerRecord(question);
    const total = session.questionIds.length;
    ui.quizUnit.textContent = unitTitle(question);
    ui.questionNumber.textContent = "SORU " + (question.number || session.index + 1);
    ui.prompt.textContent = question.prompt;
    const done = completedCount();
    ui.progressText.textContent = done + " / " + total;
    ui.progressFill.style.width = ((done / total) * 100) + "%";
    ui.progressTrack.setAttribute("aria-valuemax", String(total));
    ui.progressTrack.setAttribute("aria-valuenow", String(done));
    ui.solvedCount.textContent = done + " / " + total + " kontrol edildi";
    ui.previous.disabled = session.index === 0;
    ui.previous.classList.toggle("is-disabled", session.index === 0);
    ui.next.textContent = session.index === total - 1 ? "Sonuçları gör ✓" : "Sonraki →";
    ui.options.replaceChildren();
    const legend = document.createElement("legend");
    legend.className = "sr-only";
    legend.textContent = "Cevap seçenekleri";
    ui.options.append(legend);

    const chosen = record.selected;
    const acceptedAnswers = record.checked && Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    for (const option of (Array.isArray(question.options) ? question.options : [])) {
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

      if (record.checked && acceptedAnswers.includes(option.key)) {
        label.classList.add("is-correct");
        const marker = document.createElement("span");
        marker.className = "answer-marker";
        marker.textContent = "✓ Kabul edilen cevap";
        copy.append(marker);
      } else if (record.checked && chosen === option.key) {
        label.classList.add("is-wrong");
      }

      radio.addEventListener("change", () => {
        if (record.checked) return;
        session.answers[question.id] = { ...record, selected: radio.value, checked: false };
        saveSession();
      });
      ui.options.append(label);
    }

    ui.feedback.classList.toggle("hidden", !record.checked);
    ui.check.classList.toggle("hidden", Boolean(record.checked));
    ui.questionStatus.className = "status-pill";
    ui.questionStatus.textContent = "Yanıt bekleniyor";
    if (record.checked) {
      const isCorrect = Boolean(record.correct);
      ui.questionStatus.classList.add(isCorrect ? "correct" : "incorrect");
      ui.questionStatus.textContent = isCorrect ? "Doğru" : "Tekrar bak";
      renderFeedback(question);
    } else {
      ui.feedback.replaceChildren();
    }
  }

  function renderFeedback(question) {
    const record = answerRecord(question);
    ui.feedback.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = record.correct ? "Doğru yanıt." : "Bu seçim doğru değil.";
    ui.feedback.append(heading);

    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    const acceptedText = accepted.map((key) => {
      const option = (question.options || []).find((item) => item.key === key);
      return option ? key + " — " + option.text : key;
    });
    const answerLine = document.createElement("span");
    answerLine.textContent = "Kabul edilen yanıt" + (accepted.length > 1 ? "lar" : "") + ": " + acceptedText.join(" · ");
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
      explanation.textContent = question.explanation;
      explanation.style.margin = "8px 0 0";
      ui.feedback.append(explanation);
    }
    if (question.source && question.source.title) {
      const source = document.createElement("span");
      source.className = "source";
      source.textContent = question.source.title + " · PDF s. " + question.source.pdfPage + (question.source.bookPage ? " · Kitap s. " + question.source.bookPage : "");
      ui.feedback.append(source);
    }
  }

  function checkAnswer() {
    const question = currentQuestion();
    const selected = ui.options.querySelector('input[type="radio"]:checked');
    if (!selected) {
      ui.feedback.replaceChildren();
      ui.feedback.textContent = "Devam etmeden önce bir seçenek işaretle.";
      ui.feedback.classList.remove("hidden");
      return;
    }
    const correct = gradeAnswer(question, selected.value);
    session.answers[question.id] = { selected: selected.value, checked: true, correct };
    saveSession();
    renderQuestion();
  }

  function finishSession() {
    const summary = summarizeSession(session.questionIds, session.answers);
    session.status = summary.unanswered === 0 ? "complete" : "active";
    saveSession();
    showView("results-view");
    byId("results-heading").focus();
    ui.resultSummary.textContent = summary.unanswered
      ? summary.total + " soruluk turda " + summary.completed + " soruyu kontrol ettin. Kalan sorular oturumunda duruyor; ana sayfadan devam edebilirsin."
      : summary.total + " soruluk turu tamamladın. Yanlışlarını tekrar çözerek konuları pekiştirebilirsin.";
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
    ui.retry.classList.toggle("hidden", summary.wrongIds.length === 0);
  }
  function retryWrong() {
    const wrong = session.questionIds
      .filter((id) => {
        const record = session.answers[id];
        return record && record.checked && !record.correct;
      })
      .map((id) => questionById.get(id));
    if (wrong.length) beginSession(wrong, { unit: session.config.unit, shuffle: false });
  }

  async function init() {
    try {
      const response = await fetch("./questions.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Sorular yüklenemedi (HTTP " + response.status + ").");
      data = await response.json();
      if (!Array.isArray(data.questions) || !Array.isArray(data.units)) throw new Error("Soru dosyasının biçimi beklenen yapıyla uyuşmuyor.");
      data.questions = data.questions.filter((question) => question && question.type === "test" && question.id);
      questionById = new Map(data.questions.map((question) => [question.id, question]));
      populateUnits();
      session = loadSavedSession();
      updateHome();
      showView("home-view");

      ui.unitFilter.addEventListener("change", updateHome);
      ui.start.addEventListener("click", () => {
        const questions = filteredQuestions();
        const ordered = ui.shuffle.checked ? mix(questions) : questions;
        beginSession(ordered, { unit: ui.unitFilter.value, shuffle: ui.shuffle.checked });
      });
      ui.resume.addEventListener("click", () => {
        if (!session) return;
        const firstUnanswered = session.questionIds.findIndex((id) => !session.answers[id] || !session.answers[id].checked);
        session.index = firstUnanswered >= 0 ? firstUnanswered : Math.min(session.index, session.questionIds.length - 1);
        session.status = "active";
        saveSession();
        showView("quiz-view");
        renderQuestion();
        ui.prompt.focus();
      });
      ui.homeButton.addEventListener("click", () => { updateHome(); showView("home-view"); });
      ui.check.addEventListener("click", checkAnswer);
      ui.previous.addEventListener("click", () => {
        if (session.index > 0) {
          session.index -= 1;
          saveSession();
          renderQuestion();
          ui.prompt.focus();
        }
      });
      ui.next.addEventListener("click", () => {
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
      ui.review.addEventListener("click", () => {
        if (!session) return;
        const firstUnanswered = session.questionIds.findIndex((id) => !session.answers[id] || !session.answers[id].checked);
        session.index = firstUnanswered >= 0 ? firstUnanswered : 0;
        session.status = "active";
        saveSession();
        showView("quiz-view");
        renderQuestion();
        ui.prompt.focus();
      });
      ui.newRound.addEventListener("click", () => {
        ui.unitFilter.value = session && session.config ? session.config.unit : "all";
        ui.shuffle.checked = Boolean(session && session.config && session.config.shuffle);
        updateHome();
        showView("home-view");
        ui.start.focus();
      });
    } catch (error) {
      ui.error.textContent = "Sorular yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.";
      showView("error-view");
    }
  }

  init();
})();
