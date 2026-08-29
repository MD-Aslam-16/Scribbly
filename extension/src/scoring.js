// English-likelihood scoring: a small tiebreaker signal layered on top of
// weight-based ranking. Scores how plausible a word's letter sequence is
// using bigram frequencies, so that among several equally-weighted (e.g.
// equally "unknown") candidates for the same blanks, the more
// English-like completion is preferred.

(function (root) {
  "use strict";

  // Common English letter bigram frequencies (relative, not exhaustive) -
  // enough to distinguish plausible vs implausible letter sequences
  // without needing a full corpus. Missing pairs score as rare (0).
  const BIGRAM_FREQ = {
    th: 1.52, he: 1.28, in: 0.94, er: 0.94, an: 0.82, re: 0.68, on: 0.71,
    at: 0.59, en: 0.55, nd: 0.63, ti: 0.34, es: 0.59, or: 0.61, te: 0.47,
    of: 0.4, ed: 0.38, is: 0.46, it: 0.43, al: 0.53, ar: 0.43, st: 0.55,
    to: 0.52, nt: 0.34, ng: 0.3, se: 0.45, ha: 0.36, as: 0.39, ou: 0.44,
    io: 0.35, le: 0.38, ve: 0.34, co: 0.32, me: 0.35, de: 0.4, hi: 0.24,
    ri: 0.27, ro: 0.29, ic: 0.28, ne: 0.36, ea: 0.37, ra: 0.32, ce: 0.36,
    li: 0.23, ch: 0.29, ll: 0.29, be: 0.28, ma: 0.25, si: 0.24, om: 0.22,
    ur: 0.26, ca: 0.28, el: 0.28, ta: 0.26, la: 0.27, ns: 0.19, di: 0.22,
    fo: 0.18, ho: 0.2, pe: 0.18, ec: 0.15, pr: 0.17, no: 0.24, ct: 0.15,
    us: 0.24, ac: 0.18, ot: 0.16, il: 0.19, tr: 0.19, ly: 0.19, wi: 0.15,
  };

  const MIN_SCORE = 0.03; // floor for unseen bigrams, not zero (still a real word)

  /**
   * Scores a fully-known word string (lowercase, spaces allowed) by its
   * average bigram plausibility, normalized to roughly 0-1.
   * @returns {number}
   */
  function scoreWord(word) {
    if (!word) return 0;
    const letters = word.replace(/[^a-z]/g, "");
    if (letters.length < 2) return 1; // too short to judge, don't penalize
    let total = 0;
    let count = 0;
    for (let i = 0; i < letters.length - 1; i++) {
      const bigram = letters[i] + letters[i + 1];
      total += BIGRAM_FREQ[bigram] != null ? BIGRAM_FREQ[bigram] : MIN_SCORE;
      count++;
    }
    if (count === 0) return 1;
    // Normalize against the highest single bigram frequency so the
    // result lands roughly in [0, 1].
    const maxFreq = 1.52;
    return Math.max(0, Math.min(1, total / count / maxFreq));
  }

  root.SkribblScoring = { scoreWord, BIGRAM_FREQ };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { scoreWord, BIGRAM_FREQ };
  }
})(typeof window !== "undefined" ? window : globalThis);
