// Entry point: wires DOM watching, word matching, and the overlay UI
// together.

(function () {
  "use strict";

  const wordData = window.__SKRIBBL_GUESSER_WORDS__ || { skribbl: [], common: [] };
  // Skribbl-specific words rank first (most likely to be the actual
  // answer), common English words fill in as a fallback.
  const combinedWords = wordData.skribbl.concat(wordData.common);

  let lastHintText = null;

  function handlePick(word) {
    window.SkribblDom.fillChatInput(word);
  }

  function refresh() {
    const hintText = window.SkribblDom.readHintText();

    if (!hintText) {
      lastHintText = null;
      window.SkribblOverlay.setStatus("Waiting for a round…");
      return;
    }

    if (hintText === lastHintText) return; // no change, skip re-render
    lastHintText = hintText;

    const candidates = window.SkribblMatcher.findCandidates(
      combinedWords,
      hintText,
      null,
      10
    );
    window.SkribblOverlay.setCandidates(candidates);
  }

  function init() {
    window.SkribblOverlay.ensureOverlay(handlePick);
    window.SkribblDom.watchGameState(refresh);
    refresh();
    // Fallback poll in case mutation targets aren't attached yet
    // (page structure not fully rendered at injection time).
    setInterval(refresh, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
