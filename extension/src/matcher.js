// Word matching logic: filters a weighted word list against a hint
// pattern and ranks matches by weight. Exposed as window.SkribblMatcher
// so it can be used from the content script and also required directly
// in Node for unit tests.

(function (root) {
  "use strict";

  const WORD_BREAK = " "; // pattern token meaning "a space goes here"

  /**
   * Parses a raw hint string into a normalized pattern: an array of
   * tokens, one per character position, where a letter means "known",
   * null means "blank", and WORD_BREAK (" ") means a required space
   * (multi-word answer boundary).
   *
   * Input format: within a word, characters are separated by single
   * spaces (or none, for a contiguous run like "___g_"); a word
   * boundary is marked by a double space, e.g. "_ _ e   i c e" for a
   * two-word hint (double space between "e" and "i").
   */
  function parseHintPattern(hintText) {
    if (!hintText) return null;
    const trimmed = hintText.trim();
    if (!trimmed) return null;

    // Split on runs of 2+ spaces to get word groups; each group is then
    // parsed into its own single-space-separated (or contiguous) run.
    const wordGroups = trimmed.split(/\s{2,}/).filter((g) => g.length > 0);
    if (wordGroups.length === 0) return null;

    const pattern = [];
    wordGroups.forEach((group, i) => {
      const g = group.trim();
      const tokens = /\s/.test(g)
        ? g.split(/\s+/).filter((t) => t.length > 0)
        : g.split("");
      for (const tok of tokens) {
        if (tok === "_" || tok === "-") {
          pattern.push(null);
        } else {
          const letter = tok.replace(/[^a-zA-Z]/g, "");
          pattern.push(letter.length === 1 ? letter.toLowerCase() : null);
        }
      }
      if (i < wordGroups.length - 1) pattern.push(WORD_BREAK);
    });
    return pattern;
  }

  /**
   * Returns true if `word` (lowercase, spaces preserved at real word
   * boundaries) could match `pattern` (array of lowercase letters,
   * null for blank, or WORD_BREAK for a required space), given a set
   * of letters already guessed wrong (excluded from blanks).
   */
  function wordMatchesPattern(word, pattern, excludedLetters) {
    if (word.length !== pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const expected = pattern[i];
      const actual = word[i];
      if (expected === WORD_BREAK) {
        if (actual !== " ") return false;
      } else if (actual === " ") {
        return false; // word has a space where the pattern doesn't require one
      } else if (expected !== null) {
        if (actual !== expected) return false;
      } else if (excludedLetters && excludedLetters.has(actual)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Finds candidate words matching the hint pattern, ranked by weight
   * (highest first). Word-space positions must match exactly: a
   * multi-word candidate is only shown for a multi-word hint (with
   * matching word-break positions), and a single-word candidate is
   * only shown for a single-word hint.
   *
   * @param {Array<{word: string, weight: number}>} entries - word list
   *   with per-word ranking weight. Higher weight = shown first.
   * @param {string} hintText - raw hint string from the page.
   * @param {Set<string>|string[]} [excludedLetters] - letters known NOT
   *   to be in the word (e.g. from wrong guesses), only applied to blanks.
   * @param {number} [limit=10] - max results to return.
   * @param {Set<string>|string[]} [excludeWords] - exact words to leave
   *   out entirely (e.g. already submitted as a wrong guess this round).
   * @returns {string[]} candidate words, best guesses first.
   */
  function findCandidates(entries, hintText, excludedLetters, limit, excludeWords) {
    limit = limit || 10;
    const pattern = parseHintPattern(hintText);
    if (!pattern) return [];
    const excluded =
      excludedLetters instanceof Set
        ? excludedLetters
        : new Set(excludedLetters || []);
    const excludedWordSet =
      excludeWords instanceof Set ? excludeWords : new Set(excludeWords || []);

    const matches = [];
    for (const entry of entries) {
      const word = entry.word.toLowerCase();
      // Collapse repeated/leading/trailing whitespace but keep single
      // spaces between words so they line up against WORD_BREAK tokens.
      const normalized = word.replace(/\s+/g, " ").trim();
      if (excludedWordSet.has(normalized)) continue;
      if (wordMatchesPattern(normalized, pattern, excluded)) {
        matches.push({ word: normalized, weight: entry.weight || 0 });
      }
    }
    matches.sort((a, b) => b.weight - a.weight);
    return matches.slice(0, limit).map((m) => m.word);
  }

  const api = { WORD_BREAK, parseHintPattern, wordMatchesPattern, findCandidates };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SkribblMatcher = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
