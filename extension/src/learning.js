// Learning module: tracks which words have actually appeared as
// skribbl.io answers, persists counts across sessions via
// chrome.storage.local, and computes a ranking weight per word.
//
// Ranking model (skribbl-only word list, no generic English fallback):
//   - Base weight comes from the bundled word bank's "picked" count
//     (how often the word was actually chosen as a skribbl.io answer
//     in the source data), so intrinsically common answers already
//     rank higher out of the box.
//   - Each confirmed sighting during actual play (revealed as the
//     round's answer) bumps a locally-learned count. Weight adds
//     log(1 + count) so frequently-seen words rise but don't fully
//     dominate over never-seen words with a high base "picked" score.
//   - A word learned from gameplay that wasn't in the bundled bank at
//     all gets added to the library with a modest base weight, since
//     it's a real confirmed skribbl.io answer even though the static
//     bank missed it.

(function (root) {
  "use strict";

  const STORAGE_KEY = "skribblGuesserLearnedWords";
  const BASE_WEIGHT_MIN = 10; // floor so a 0-"picked" bank word still ranks above nothing
  const BASE_WEIGHT_LEARNED_NEW = 10; // word seen in-game but absent from the bundled bank

  /**
   * Computes the ranking weight for a word given its bundled base
   * ("picked") score and how many times it's been confirmed as an
   * actual answer during play.
   */
  function computeWeight(baseWeight, learnedCount) {
    const base = Math.max(BASE_WEIGHT_MIN, baseWeight || 0);
    return base + Math.log(1 + (learnedCount || 0)) * 25;
  }

  /**
   * Builds the full weighted word list by merging the bundled skribbl
   * word bank with locally-learned counts.
   *
   * @param {Array<{word: string, picked: number}>} skribblWords - the
   *   bundled skribbl.io word bank.
   * @param {Object<string, number>} learnedCounts - word -> times seen
   *   confirmed as an answer during actual play.
   * @returns {Array<{word: string, weight: number}>}
   */
  function buildWeightedEntries(skribblWords, learnedCounts) {
    learnedCounts = learnedCounts || {};
    const seen = new Set();
    const entries = [];

    for (const entry of skribblWords) {
      const key = entry.word.toLowerCase();
      seen.add(key);
      entries.push({
        word: key,
        weight: computeWeight(entry.picked, learnedCounts[key]),
      });
    }

    // Words learned from real games that aren't in the bundled bank.
    for (const key of Object.keys(learnedCounts)) {
      if (seen.has(key)) continue;
      entries.push({
        word: key,
        weight: computeWeight(BASE_WEIGHT_LEARNED_NEW, learnedCounts[key]),
      });
    }

    return entries;
  }

  /**
   * Loads learned word counts from chrome.storage.local.
   * Resolves to {} if storage is unavailable or empty.
   */
  function loadLearnedCounts() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve((result && result[STORAGE_KEY]) || {});
      });
    });
  }

  /**
   * Records that `word` was confirmed as a round's answer, incrementing
   * its count and persisting the update. Resolves with the new counts
   * map.
   */
  function recordWordSeen(word) {
    const key = word.trim().toLowerCase();
    if (!key) return Promise.resolve(null);

    return loadLearnedCounts().then((counts) => {
      counts[key] = (counts[key] || 0) + 1;
      return new Promise((resolve) => {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
          resolve(counts);
          return;
        }
        chrome.storage.local.set({ [STORAGE_KEY]: counts }, () => resolve(counts));
      });
    });
  }

  const api = {
    STORAGE_KEY,
    BASE_WEIGHT_MIN,
    BASE_WEIGHT_LEARNED_NEW,
    computeWeight,
    buildWeightedEntries,
    loadLearnedCounts,
    recordWordSeen,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SkribblLearning = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
