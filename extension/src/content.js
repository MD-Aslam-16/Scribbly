// Entry point: wires DOM watching, weighted word matching, the
// learning module, settings, and the overlay UI together.

(function () {
  "use strict";

  let bankWords = []; // [{word, picked}], loaded from data/skribbl-words.json
  let weightedEntries = [];
  let lastHintText = null;
  let settings = null;
  let learnedCounts = {};
  // Words we've already submitted as a guess for the current round,
  // so we never suggest (or resubmit) the same wrong answer twice.
  // Also absorbs other players' wrong chat guesses (see refresh()), so
  // the candidate pool shrinks using guesses we didn't even make.
  let triedWords = new Set();
  let guessesThisRound = 0;
  let autoSubmitTimer = null;

  function rebuildEntries() {
    weightedEntries = window.SkribblLearning.buildWeightedEntries(
      bankWords,
      learnedCounts
    );
  }

  function loadWordBank() {
    const url = chrome.runtime.getURL("data/skribbl-words.json");
    return fetch(url)
      .then((res) => res.json())
      .then((data) => {
        bankWords = Array.isArray(data) ? data : [];
      })
      .catch(() => {
        bankWords = [];
        window.SkribblOverlay.setStatus("Failed to load word list.");
      });
  }

  function submitGuess(word) {
    triedWords.add(word.toLowerCase());
    guessesThisRound += 1;
    window.SkribblDom.submitGuess(word);
  }

  function handlePick(word) {
    submitGuess(word); // manual click always submits, regardless of settings
  }

  function handleSettingsChange(partial) {
    window.SkribblSettings.update(partial).then((next) => {
      settings = next;
      window.SkribblOverlay.renderSettings(settings);
      lastHintText = null; // force a re-render with the new settings applied
      refresh();
    });
  }

  function handleResetLearning() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.remove([window.SkribblLearning.STORAGE_KEY], () => {
      learnedCounts = {};
      rebuildEntries();
      window.SkribblOverlay.renderStats(learnedCounts);
    });
  }

  function refresh() {
    if (autoSubmitTimer) {
      clearTimeout(autoSubmitTimer);
      autoSubmitTimer = null;
    }

    if (!settings || !settings.enabled) {
      window.SkribblOverlay.setStatus("Paused (see Settings tab).");
      return;
    }

    if (window.SkribblDom.isCurrentPlayerDrawing()) {
      lastHintText = null;
      triedWords = new Set();
      guessesThisRound = 0;
      window.SkribblOverlay.setStatus("You're drawing — no suggestions.");
      return;
    }

    // Pick up any newly revealed answers from chat and learn from them.
    const revealed = window.SkribblDom.readNewlyRevealedWords();
    if (revealed.length > 0) {
      Promise.all(revealed.map((w) => window.SkribblLearning.recordWordSeen(w))).then(
        () =>
          window.SkribblLearning.loadLearnedCounts().then((counts) => {
            learnedCounts = counts;
            rebuildEntries();
            window.SkribblOverlay.renderStats(learnedCounts);
          })
      );
    }

    // Other players' wrong guesses, echoed in chat, are known-bad words
    // for this round even if we never submitted them ourselves.
    const wrongGuesses = window.SkribblDom.readOtherPlayersWrongGuesses();
    for (const w of wrongGuesses) triedWords.add(w);

    const hintText = window.SkribblDom.readHintText();

    if (!hintText) {
      lastHintText = null;
      triedWords = new Set(); // between rounds, clear what we've tried
      guessesThisRound = 0;
      window.SkribblOverlay.setStatus("Waiting for a round…");
      return;
    }

    // Skip re-render only if nothing changed: same hint AND no newly
    // excluded words from other players' wrong guesses this tick.
    if (hintText === lastHintText && wrongGuesses.length === 0) return;
    lastHintText = hintText;

    const ranked = window.SkribblMatcher.findCandidatesDetailed(
      weightedEntries,
      hintText,
      null,
      settings.suggestionCount,
      triedWords,
      window.SkribblScoring.scoreWord
    );

    const confidence = window.SkribblMatcher.computeConfidence(ranked);
    const display = ranked.map((r, i) => ({
      word: r.word,
      weight: r.weight,
      // Only the top pick shows the real computed confidence; the rest
      // are shown relative to it so the bars still read as a ranking.
      confidencePct: i === 0 ? confidence : confidence * (r.weight / (ranked[0].weight || 1)) * 0.8,
    }));
    window.SkribblOverlay.setCandidates(display);

    const withinGuessLimit = guessesThisRound < settings.maxGuessesPerRound;
    if (
      settings.autoSubmit &&
      withinGuessLimit &&
      ranked.length > 0 &&
      confidence >= settings.confidenceThreshold
    ) {
      const topWord = ranked[0].word;
      autoSubmitTimer = setTimeout(() => {
        autoSubmitTimer = null;
        submitGuess(topWord);
      }, settings.guessDelayMs);
    }
  }

  function init() {
    window.SkribblOverlay.ensureOverlay({
      onPick: handlePick,
      onSettingsChange: handleSettingsChange,
      onResetLearning: handleResetLearning,
    });

    Promise.all([
      loadWordBank(),
      window.SkribblSettings.load(),
      window.SkribblLearning.loadLearnedCounts(),
    ]).then(([, loadedSettings, counts]) => {
      settings = loadedSettings;
      learnedCounts = counts;
      rebuildEntries();
      window.SkribblOverlay.renderSettings(settings);
      window.SkribblOverlay.renderStats(learnedCounts);
      refresh();
    });

    window.SkribblDom.watchGameState(refresh);
    // Fallback poll in case mutation targets aren't attached yet
    // (page structure not fully rendered at injection time), and to
    // catch new chat lines promptly for learning.
    setInterval(refresh, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
