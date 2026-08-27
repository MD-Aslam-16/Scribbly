// DOM integration: reads the current hint from skribbl.io's page and
// fills guesses into the chat input. Selectors are centralized here so
// they're easy to patch if skribbl.io changes its markup.

(function (root) {
  "use strict";

  const SELECTORS = {
    gameWord: "#game-word",
    hintChars: "#game-word .hints .container .hint",
    chatInput: "#game-chat .chat-form input",
    chatForm: "#game-chat .chat-form",
    chatContent: "#game-chat .chat-content",
  };

  function getGameWordEl() {
    return document.querySelector(SELECTORS.gameWord);
  }

  function getHintCharEls() {
    // Each blank/revealed letter is its own ".hint" element inside
    // "#game-word .hints .container". A sibling ".word-length" badge
    // lives in the same container and must be excluded. Note: ".word"
    // holds the actual answer (visible only to the current drawer) and
    // must never be used to build guesses for guessers.
    return Array.from(document.querySelectorAll(SELECTORS.hintChars));
  }

  function getChatInputEl() {
    return document.querySelector(SELECTORS.chatInput);
  }

  function getChatContentEl() {
    return document.querySelector(SELECTORS.chatContent);
  }

  /**
   * Reads the current hint text from the page, e.g. "_ _ _ e _".
   * Returns null if the hint area isn't present or looks like a
   * non-hint state (e.g. "WAITING").
   */
  function readHintText() {
    const hintEls = getHintCharEls();
    if (!hintEls.length) return null;

    const chars = hintEls.map((el) => (el.textContent || "").trim());
    // Each element should be a single letter or "_"; anything else
    // (e.g. a stray badge caught by the selector) means the markup
    // doesn't match what we expect, so bail out rather than guess.
    if (chars.some((c) => c.length !== 1)) return null;

    const text = chars.join(" ");
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
    fillChatInput,
    watchGameState,
  };
})(typeof window !== "undefined" ? window : globalThis);
