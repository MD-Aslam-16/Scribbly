// DOM integration: reads the current hint from skribbl.io's page and
// fills guesses into the chat input. Selectors are centralized here so
// they're easy to patch if skribbl.io changes its markup.

(function (root) {
  "use strict";

  const SELECTORS = {
    gameWord: "#game-word",
    hintText: "#game-word .word, #game-word .hints .container",
    chatInput: "#game-chat .chat-form input",
    chatForm: "#game-chat .chat-form",
    chatContent: "#game-chat .chat-content",
  };

  function getGameWordEl() {
    return document.querySelector(SELECTORS.gameWord);
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
    const el = getGameWordEl();
    if (!el) return null;
    const text = (el.textContent || "").trim();
    if (!text) return null;
    // Only underscores/letters/spaces/dashes are a real hint pattern.
    if (!/^[_a-zA-Z\s-]+$/.test(text)) return null;
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
