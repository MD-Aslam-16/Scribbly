// Word matching logic: filters a word list against a hint pattern.
// Exposed as window.SkribblMatcher so it can be used from the content
// script and also required directly in Node for unit tests.

(function (root) {
  "use strict";

  /**
   * Parses a raw hint string (e.g. "_ _ e _" or "a _ p l e") into a
   * normalized pattern: an array of characters, where a letter means
   * "known" and null means "blank".
   */
  function parseHintPattern(hintText) {
    if (!hintText) return null;
    const tokens = hintText
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return null;

    const pattern = tokens.map((tok) => {
      if (tok === "_" || tok === "-") return null;
      const letter = tok.replace(/[^a-zA-Z]/g, "");
      return letter.length === 1 ? letter.toLowerCase() : null;
    });
    return pattern;
  }

  /**
   * Returns true if `word` (lowercase, no spaces) could match `pattern`
   * (array of lowercase letters or null for blank), given a set of
   * letters already guessed wrong (excluded from blanks).
   */
  function wordMatchesPattern(word, pattern, excludedLetters) {
    if (word.length !== pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const expected = pattern[i];
      const actual = word[i];
      if (expected !== null) {
        if (actual !== expected) return false;
      } else if (excludedLetters && excludedLetters.has(actual)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Finds candidate words matching the hint pattern.
   *
   * @param {string[]} words - flat lowercase word list, priority-ordered
   *   (earlier entries rank higher when frequency is otherwise equal).
   * @param {string} hintText - raw hint string from the page.
   * @param {Set<string>|string[]} [excludedLetters] - letters known NOT
   *   to be in the word (e.g. from wrong guesses), only applied to blanks.
   * @param {number} [limit=10] - max results to return.
   * @returns {string[]} candidate words, best guesses first.
   */
  function findCandidates(words, hintText, excludedLetters, limit) {
    limit = limit || 10;
    const pattern = parseHintPattern(hintText);
    if (!pattern) return [];
    const excluded =
      excludedLetters instanceof Set
        ? excludedLetters
        : new Set(excludedLetters || []);

    const results = [];
    for (const raw of words) {
      const word = raw.toLowerCase();
      // Multi-word phrases ("six pack") collapse spaces for length/letter
      // matching against skribbl's hint, which blanks every letter but
      // keeps spaces visible as gaps.
      const compact = word.replace(/\s+/g, "");
      if (wordMatchesPattern(compact, pattern, excluded)) {
        results.push(word);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  const api = { parseHintPattern, wordMatchesPattern, findCandidates };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SkribblMatcher = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
