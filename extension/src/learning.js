// Learning module: tracks which words have actually appeared as
// skribbl.io answers, persists counts across sessions via
// chrome.storage.local, and computes a ranking weight per word.
//
// Ranking model:
//   - Base weight by source: skribbl-list words rank above common
//     English words, since they're drawn from the game's own pool.
//   - Each confirmed sighting of a word (revealed as the round's
//     answer) bumps its learned count. Weight adds log(1 + count) so
//     frequently-seen words rise but don't fully dominate over
//     never-seen words from the skribbl list.
//   - A word learned from gameplay that wasn't in either static list
//     gets added to the library with the skribbl base weight, since it
//     came directly from a real skribbl.io round.

(function (root) {
  "use strict";

  const STORAGE_KEY = "skribblGuesserLearnedWords";
  const BASE_WEIGHT_SKRIBBL = 100;
  const BASE_WEIGHT_COMMON = 10;
  const BASE_WEIGHT_LEARNED_NEW = 100; // treated like a confirmed skribbl word

  /**
   * Computes the ranking weight for a word given its source and how
   * many times it's been confirmed as an actual answer.
   */
  function computeWeight(baseWeight, learnedCount) {
    return baseWeight + Math.log(1 + (learnedCount || 0)) * 25;
  }

  /**
   * Builds the full weighted word list by merging the static skribbl
   * and common lists with learned counts.
   *
   * @param {string[]} skribblWords
   * @param {string[]} commonWords
   * @param {Object<string, number>} learnedCounts - word -> times seen
   * @returns {Array<{word: string, weight: number}>}
   */
  function buildWeightedEntries(skribblWords, commonWords, learnedCounts) {
    learnedCounts = learnedCounts || {};
    const seen = new Set();
    const entries = [];

    for (const word of skribblWords) {
      const key = word.toLowerCase();
      seen.add(key);
      entries.push({
        word: key,
        weight: computeWeight(BASE_WEIGHT_SKRIBBL, learnedCounts[key]),
      });
    }

    for (const word of commonWords) {
      const key = word.toLowerCase();
      if (seen.has(key)) continue; // already added at higher base weight
      seen.add(key);
      entries.push({
        word: key,
        weight: computeWeight(BASE_WEIGHT_COMMON, learnedCounts[key]),
      });
    }

    // Words learned from real games that aren't in either static list.
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
    BASE_WEIGHT_SKRIBBL,
    BASE_WEIGHT_COMMON,
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
