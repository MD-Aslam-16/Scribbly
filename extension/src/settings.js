// Settings module: persisted user preferences, stored via
// chrome.storage.local so they survive across sessions.

(function (root) {
  "use strict";

  const STORAGE_KEY = "skribblGuesserSettings";

  const DEFAULTS = {
    enabled: true, // master pause/mute toggle
    autoSubmit: true, // auto-submit the top pick when confident
    // "confident": only auto-submit when computeConfidence clears
    // confidenceThreshold. "always": submit the top candidate as soon
    // as one exists, skipping the confidence check (still respects
    // maxGuessesPerRound and guessDelayMs below).
    autoPlayMode: "confident",
    confidenceThreshold: 0.35, // min score margin (see computeConfidence) to auto-submit
    suggestionCount: 10, // how many candidates to show
    maxGuessesPerRound: 5, // cap on auto-submitted guesses per round
    guessDelayMs: 600, // delay before auto-submitting, so it doesn't look instant
  };

  function load() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(Object.assign({}, DEFAULTS));
        return;
      }
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const stored = (result && result[STORAGE_KEY]) || {};
        resolve(Object.assign({}, DEFAULTS, stored));
      });
    });
  }

  function save(settings) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(settings);
        return;
      }
      chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => resolve(settings));
    });
  }

  function update(partial) {
    return load().then((current) => {
      const next = Object.assign({}, current, partial);
      return save(next);
    });
  }

  const api = { STORAGE_KEY, DEFAULTS, load, save, update };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SkribblSettings = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
