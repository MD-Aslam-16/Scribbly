// DOM integration: reads the current hint from skribbl.io's page and
// fills guesses into the chat input. Selectors are centralized here so
// they're easy to patch if skribbl.io changes its markup. Hint-reading
// also has a heuristic fallback (see findHintContainerHeuristically)
// that self-discovers the hint row by shape rather than class name, so
// a skribbl.io markup change degrades to "still works" instead of
// "stuck on Waiting for a round..." until someone patches a selector.

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

  /**
   * A node "looks like" a single hint character if it has no element
   * children and its own text is at most one character (a letter or
   * "_"). This is the heuristic used to self-discover the hint row
   * without depending on skribbl.io's current class names.
   */
  function looksLikeHintChar(el) {
    if (el.children.length !== 0) return false;
    const text = (el.textContent || "").trim();
    return text.length <= 1;
  }

  /**
   * Finds the container element whose direct children mostly look like
   * hint characters, searching under `root` (default: the whole
   * document). Falls back to null if nothing scores at least 3 blanks
   * worth of confidence, since a container with only 1-2 candidate
   * children is too likely to be a false positive elsewhere on the page.
   */
  function findHintContainerHeuristically(root) {
    root = root || document.body;
    let best = null;
    let bestScore = 0;
    const candidates = root.querySelectorAll("*");
    for (const el of candidates) {
      if (el.children.length < 3) continue;
      let score = 0;
      for (const child of el.children) {
        if (looksLikeHintChar(child)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return bestScore >= 3 ? best : null;
  }

  function getHintCharEls() {
    // Primary path: skribbl.io's known markup has all blank/revealed
    // letters flat inside a single "#game-word .hints .container"
    // (multi-word answers do NOT get separate containers - a word
    // boundary is one extra un-lettered ".hint" element for the
    // space). A sibling ".word-length" badge in the same container
    // must be excluded, which the ".hint" class filter already does.
    const primary = Array.from(document.querySelectorAll(SELECTORS.hintChars));
    if (primary.length > 0) return primary;

    // Fallback: skribbl.io's markup changed (class names renamed or
    // restructured) and the hardcoded selector no longer matches.
    // Self-discover the hint row by scoring candidate containers, then
    // read straight from that container's matching children instead of
    // depending on any specific class name.
    const gameWord = getGameWordEl();
    const container = findHintContainerHeuristically(gameWord || document.body);
    if (!container) return [];
    return Array.from(container.children).filter(looksLikeHintChar);
  }

  /**
   * Reads the per-word letter-count split from the ".word-length"
   * badge, e.g. "9 4" for a two-word answer. Returns null if absent
   * or unparseable.
   *
   * Falls back to extracting digit runs from the hints container's raw
   * text if the dedicated selector doesn't match (markup changed): the
   * badge's digits are the only digits skribbl.io renders in that
   * area, so stripping non-digit-run tokens out of the full text finds
   * the same numbers without depending on the ".word-length" class.
   */
  function getWordLengthSplit() {
    const el = document.querySelector(SELECTORS.wordLength);
    if (el) {
      const text = (el.textContent || "").trim();
      if (text) {
        const parts = text.split(/\s+/).map((n) => parseInt(n, 10));
        if (!parts.some((n) => !Number.isFinite(n) || n <= 0)) return parts;
      }
    }

    const hintsEl = document.querySelector("#game-word .hints");
    if (!hintsEl) return null;
    const digitMatches = (hintsEl.textContent || "").match(/\d+/g);
    if (!digitMatches || digitMatches.length === 0) return null;
    const parts = digitMatches.map((n) => parseInt(n, 10));
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

  /**
   * Returns true if the current player appears to be the one drawing
   * (not guessing). skribbl.io reveals the actual answer in
   * "#game-word .word" only to the drawer - it's empty/hidden for
   * guessers (confirmed via live inspection). If that element is
   * visible and has real letter content, we're drawing and should
   * suppress guess suggestions rather than show irrelevant/confusing
   * ones. Falls back to false (assume guessing) if undetectable, so
   * an unexpected page state never silently disables the extension.
   */
  function isCurrentPlayerDrawing() {
    const wordEl = document.querySelector("#game-word .word");
    if (!wordEl) return false;
    const style = window.getComputedStyle(wordEl);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const text = (wordEl.textContent || "").trim();
    return /^[a-zA-Z][a-zA-Z\s-]*$/.test(text);
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
    isCurrentPlayerDrawing,
    fillChatInput,
    submitGuess,
    watchGameState,
  };
})(typeof window !== "undefined" ? window : globalThis);
