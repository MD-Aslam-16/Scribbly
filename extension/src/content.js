// Entry point: wires DOM watching, weighted word matching, the
// learning module, and the overlay UI together.

(function () {
  "use strict";

  let bankWords = []; // [{word, picked}], loaded from data/skribbl-words.json
  let weightedEntries = [];
  let lastHintText = null;

  function rebuildEntries(learnedCounts) {
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

  function handlePick(word) {
    window.SkribblDom.fillChatInput(word);
  }

  function refresh() {
    // Pick up any newly revealed answers from chat and learn from them.
    const revealed = window.SkribblDom.readNewlyRevealedWords();
    if (revealed.length > 0) {
      Promise.all(revealed.map((w) => window.SkribblLearning.recordWordSeen(w))).then(
        () => window.SkribblLearning.loadLearnedCounts().then(rebuildEntries)
      );
    }

    const hintText = window.SkribblDom.readHintText();

    if (!hintText) {
      lastHintText = null;
      window.SkribblOverlay.setStatus("Waiting for a round…");
      return;
    }

    if (hintText === lastHintText) return; // no change, skip re-render
    lastHintText = hintText;

    const candidates = window.SkribblMatcher.findCandidates(
      weightedEntries,
      hintText,
      null,
      10
    );
    window.SkribblOverlay.setCandidates(candidates);
  }

  function init() {
    window.SkribblOverlay.ensureOverlay(handlePick);
    loadWordBank()
      .then(() => window.SkribblLearning.loadLearnedCounts())
      .then((counts) => {
        rebuildEntries(counts);
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
