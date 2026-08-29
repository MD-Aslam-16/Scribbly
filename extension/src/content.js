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
  // The word the pending autoSubmitTimer will submit, so an unrelated
  // refresh() (triggered by chat noise/other players' messages, not an
  // actual hint change) doesn't keep cancelling and rescheduling the
  // same pending guess before its delay ever elapses - which otherwise
  // stalls auto-play after the first guess or two once chat gets busy.
  let autoSubmitWord = null;
  // Set whenever triedWords gains an entry (our own guess or another
  // player's), so the next refresh() re-renders even if the hint text
  // itself hasn't changed - otherwise a just-tried word stays visible
  // in the suggestion list until the hint happens to change too.
  let triedWordsDirty = false;
  // Timestamp (Date.now()) of the last submitted guess, so consecutive
  // auto-guesses are spaced out enough to stay under skribbl.io's own
  // chat rate limit ("Spam detected! You're sending messages too
  // quickly.") - guessDelayMs alone only delays a single guess before
  // it fires, it doesn't guarantee spacing between successive guesses.
  let lastGuessAt = 0;
  const MIN_GUESS_INTERVAL_MS = 2200;

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
    triedWordsDirty = true;
    guessesThisRound += 1;
    lastGuessAt = Date.now();
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

  function cancelPendingAutoSubmit() {
    if (autoSubmitTimer) {
      clearTimeout(autoSubmitTimer);
      autoSubmitTimer = null;
      autoSubmitWord = null;
    }
  }

  function refresh() {
    if (!settings || !settings.enabled) {
      cancelPendingAutoSubmit();
      window.SkribblOverlay.setStatus("Paused (see Settings tab).");
      return;
    }

    if (window.SkribblDom.isCurrentPlayerDrawing()) {
      cancelPendingAutoSubmit();
      lastHintText = null;
      triedWords = new Set();
      triedWordsDirty = false;
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
    // for this round even if we never submitted them ourselves. Pass
    // this tick's just-revealed answer(s) so a correct guess that also
    // gets echoed as a plain chat line is never misclassified as wrong.
    const wrongGuesses = window.SkribblDom.readOtherPlayersWrongGuesses(revealed);
    for (const w of wrongGuesses) triedWords.add(w);
    if (wrongGuesses.length > 0) triedWordsDirty = true;

    const hintText = window.SkribblDom.readHintText();

    if (!hintText) {
      cancelPendingAutoSubmit();
      lastHintText = null;
      triedWords = new Set(); // between rounds, clear what we've tried
      triedWordsDirty = false;
      guessesThisRound = 0;
      window.SkribblOverlay.setStatus("Waiting for a round…");
      return;
    }

    // Skip re-render only if nothing changed: same hint AND no newly
    // excluded words (our own tried guesses or other players' wrong
    // guesses) since the last render.
    if (hintText === lastHintText && !triedWordsDirty) return;
    lastHintText = hintText;
    triedWordsDirty = false;

    // Rank against a generously high cap so confidence is computed from
    // the true runner-up, not an artifact of a small suggestionCount
    // (e.g. suggestionCount=1 would otherwise always look "certain"
    // since there'd be no second candidate to compare against).
    const rankedAll = window.SkribblMatcher.findCandidatesDetailed(
      weightedEntries,
      hintText,
      null,
      Math.max(settings.suggestionCount, 50),
      triedWords,
      window.SkribblScoring.scoreWord
    );
    const ranked = rankedAll.slice(0, settings.suggestionCount);

    const confidence = window.SkribblMatcher.computeConfidence(rankedAll);
    const display = ranked.map((r, i) => ({
      word: r.word,
      weight: r.weight,
      // Only the top pick shows the real computed confidence; the rest
      // are shown relative to it so the bars still read as a ranking.
      confidencePct: i === 0 ? confidence : confidence * (r.weight / (rankedAll[0].weight || 1)) * 0.8,
    }));
    window.SkribblOverlay.setCandidates(display);

    const withinGuessLimit = guessesThisRound < settings.maxGuessesPerRound;
    // "always" mode skips the confidence check entirely and submits the
    // top candidate as soon as one exists; "confident" (default) only
    // submits when computeConfidence clears the threshold. Both modes
    // still respect the guess cap and submit delay below.
    const meetsConfidence =
      settings.autoPlayMode === "always" || confidence >= settings.confidenceThreshold;
    if (
      settings.autoSubmit &&
      withinGuessLimit &&
      rankedAll.length > 0 &&
      meetsConfidence
    ) {
      const topWord = rankedAll[0].word;
      // Only (re)schedule if this is a genuinely new target: an
      // unrelated refresh() (chat noise, other players guessing) would
      // otherwise keep re-entering this branch with the same topWord
      // and endlessly restart the timer, so the delay never elapses and
      // auto-play stalls after the first guess or two.
      if (topWord !== autoSubmitWord) {
        cancelPendingAutoSubmit();
        autoSubmitWord = topWord;
        // Never submit sooner than MIN_GUESS_INTERVAL_MS after the
        // previous guess, on top of the configured guessDelayMs, so
        // rapid-fire wrong guesses can't trip skribbl.io's chat rate
        // limiter even when guessDelayMs is set low.
        const sinceLastGuess = Date.now() - lastGuessAt;
        const wait = Math.max(
          settings.guessDelayMs,
          MIN_GUESS_INTERVAL_MS - sinceLastGuess
        );
        autoSubmitTimer = setTimeout(() => {
          autoSubmitTimer = null;
          autoSubmitWord = null;
          submitGuess(topWord);
        }, wait);
      }
    } else {
      cancelPendingAutoSubmit();
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
