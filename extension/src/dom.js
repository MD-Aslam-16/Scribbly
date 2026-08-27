// DOM integration: reads the current hint from skribbl.io's page and
// fills guesses into the chat input. Selectors are centralized here so
// they're easy to patch if skribbl.io changes its markup.

(function (root) {
  "use strict";

  const SELECTORS = {
    gameWord: "#game-word",
    hintContainer: "#game-word .hints .container",
    hintChars: "#game-word .hints .container .hint",
    wordLength: "#game-word .hints .container .word-length",
    chatInput: "#game-chat .chat-form input",
    chatForm: "#game-chat .chat-form",
    chatContent: "#game-chat .chat-content",
  };

  function getGameWordEl() {
    return document.querySelector(SELECTORS.gameWord);
  }

  function getHintCharEls() {
    // All blank/revealed letters live flat inside a single
    // "#game-word .hints .container" (skribbl.io does NOT split
    // multi-word answers into separate containers - a word boundary
    // is instead one extra un-lettered ".hint" element for the space).
    // A sibling ".word-length" badge in the same container must be
    // excluded. Note: ".word" holds the actual answer (visible only
    // to the current drawer) and must never be used for guessers.
    return Array.from(document.querySelectorAll(SELECTORS.hintChars));
  }

  /**
   * Reads the per-word letter-count split from the ".word-length"
   * badge, e.g. "9 4" for a two-word answer. Returns null if absent
   * or unparseable.
   */
  function getWordLengthSplit() {
    const el = document.querySelector(SELECTORS.wordLength);
    if (!el) return null;
    const text = (el.textContent || "").trim();
    if (!text) return null;
    const parts = text.split(/\s+/).map((n) => parseInt(n, 10));
    if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    return parts;
  }

  /**
   * Splits the flat list of ".hint" elements into per-word groups
   * using the authoritative lengths from the ".word-length" badge.
   * A single extra element between word groups (the space) is
   * dropped rather than assigned to either group.
   *
   * Falls back to treating everything as one word if the badge is
   * missing/unparseable or the element count doesn't add up (letters
   * + one space per boundary), so a markup change degrades gracefully
   * instead of hard-failing on ordinary single-word hints.
   */
  function getHintWordGroups() {
    const hintEls = getHintCharEls();
    if (!hintEls.length) return [];

    const split = getWordLengthSplit();
    if (!split || split.length < 2) return [hintEls];

    const expectedTotal =
      split.reduce((sum, n) => sum + n, 0) + (split.length - 1);
    if (hintEls.length !== expectedTotal) return [hintEls];

    const groups = [];
    let i = 0;
    split.forEach((len, idx) => {
      groups.push(hintEls.slice(i, i + len));
      i += len;
      if (idx < split.length - 1) i += 1; // skip the space element
    });
    return groups;
  }

  function getChatInputEl() {
    return document.querySelector(SELECTORS.chatInput);
  }

  function getChatContentEl() {
    return document.querySelector(SELECTORS.chatContent);
  }

  // Tracks how many chat lines we've already scanned for revealed
  // words, so repeated calls only report newly-added lines.
  let lastChatLineCount = 0;

  /**
   * Scans any chat lines added since the last call for a revealed
   * answer, e.g. "The word was 'penny'". Resets automatically if the
   * chat is shorter than last seen (room change/reload).
   *
   * @returns {string[]} newly revealed words (lowercase), if any.
   */
  function readNewlyRevealedWords() {
    const chatEl = getChatContentEl();
    if (!chatEl) return [];

    const lines = Array.from(chatEl.children).map((el) =>
      (el.textContent || "").trim()
    );
    if (lines.length < lastChatLineCount) {
      lastChatLineCount = 0; // chat was cleared/replaced
    }
    const newLines = lines.slice(lastChatLineCount);
    lastChatLineCount = lines.length;

    const revealed = [];
    const wordWasRe = /the word was ['"]([a-zA-Z][a-zA-Z\s-]*)['"]/i;
    for (const line of newLines) {
      const match = line.match(wordWasRe);
      if (match) revealed.push(match[1].trim().toLowerCase());
    }
    return revealed;
  }

  /**
   * Reads the current hint text from the page, preserving word
   * boundaries: letters/blanks within a word are single-space
   * separated, and words are separated by a double space, e.g.
   * "_ _ e   i c e" for a two-word "___ ice" style hint. Returns null
   * if the hint area isn't present or looks like a non-hint state.
   */
  function readHintText() {
    const groups = getHintWordGroups();
    if (!groups.length) return null;

    const words = [];
    for (const hintEls of groups) {
      if (!hintEls.length) return null;
      const chars = hintEls.map((el) => (el.textContent || "").trim());
      // Each element should be a single letter or "_"; anything else
      // (e.g. a stray badge caught by the selector) means the markup
      // doesn't match what we expect, so bail out rather than guess.
      if (chars.some((c) => c.length !== 1)) return null;
      words.push(chars.join(" "));
    }

    const text = words.join("  "); // double space marks a word boundary
    if (!/[_-]/.test(text)) return null; // no blanks -> not a guessable hint yet
    return text;
  }

  /**
   * Fills the chat input with the given word without submitting it,
   * dispatching input events so skribbl's own JS (character counter,
   * any framework bindings) picks up the change.
   */
  function fillChatInput(word) {
    const input = getChatInputEl();
    if (!input) return false;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    nativeSetter.call(input, word);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    return true;
  }

  /**
   * Fills the chat input with `word` and submits it immediately, the
   * same as the user typing it and pressing Enter.
   */
  function submitGuess(word) {
    if (!fillChatInput(word)) return false;

    const form = document.querySelector(SELECTORS.chatForm);
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    if (form) {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      return true;
    }

    // Fallback: simulate pressing Enter on the input itself.
    const input = getChatInputEl();
    if (!input) return false;
    for (const type of ["keydown", "keypress", "keyup"]) {
      input.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
        })
      );
    }
    return true;
  }

  /**
   * Watches for changes to the hint area and/or chat feed, calling
   * `onChange()` whenever either mutates. Returns a stop() function.
   */
  function watchGameState(onChange) {
    const observer = new MutationObserver(() => onChange());
    const targets = [getGameWordEl(), getChatContentEl()].filter(Boolean);
    for (const target of targets) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    // Selectors may not exist yet at injection time (SPA render timing);
    // also watch body for the game wrapper appearing, then re-attach.
    const bodyObserver = new MutationObserver(() => {
      const newTargets = [getGameWordEl(), getChatContentEl()].filter(Boolean);
      if (newTargets.length && newTargets.length !== targets.length) {
        onChange();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return function stop() {
      observer.disconnect();
      bodyObserver.disconnect();
    };
  }

  root.SkribblDom = {
    SELECTORS,
    getGameWordEl,
    getChatInputEl,
    getChatContentEl,
    readHintText,
    readNewlyRevealedWords,
    fillChatInput,
    submitGuess,
    watchGameState,
  };
})(typeof window !== "undefined" ? window : globalThis);
