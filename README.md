# Scribbly

A browser extension that helps you guess words in [skribbl.io](https://skribbl.io/) by matching the revealed hint pattern (blanks + known letters) against a large skribbl-specific word bank — no drawing recognition or AI vision, just pattern matching.

## Features

- **Pattern-based suggestions** — matches the current hint (e.g. `_ _ e   i c e`) against a word bank of 3,700+ skribbl-specific words, correctly respecting word-count/word-length boundaries for multi-word answers.
- **Weighted ranking** — candidates are ranked using each word's known pick frequency, so common skribbl words are suggested first.
- **English-likelihood tiebreaker** — among similarly-weighted candidates, a bigram-based plausibility score (e.g. "th", "in", "er") nudges the more English-like completion higher, without overriding a real weight/frequency advantage.
- **Learning** — when a round ends and the answer is revealed in chat, Scribbly records it and boosts that word's ranking in future rounds. Learned data is stored permanently in the browser (`chrome.storage.local`) and survives restarts.
- **Chat-aware exclusion** — shrinks the candidate pool using guesses you didn't even make: both your own tried words and other players' wrong guesses (read from chat) are excluded from future suggestions, without ever excluding the actual revealed answer.
- **Auto-play, two modes** — "Only when confident" (default) only auto-submits when the top pick is clearly ahead of the runner-up (configurable threshold); "Always guess top pick" submits your best current candidate as soon as one exists, skipping the confidence check.
- **Rate-limit safe** — auto-guesses are spaced at least ~2.2 seconds apart, on top of the configurable submit delay, so auto-play won't trip skribbl.io's own chat spam detector.
- **Guess cooldown** — limits how many auto-guesses it will make per round, and never re-suggests or resubmits a word already tried that round.
- **Drawer detection** — automatically suppresses suggestions when you're the one drawing, not guessing.
- **Self-healing DOM detection** — if skribbl.io changes its page markup, hint-reading falls back to a heuristic detector instead of breaking outright.
- **Settings & stats panel** — a floating, draggable overlay with tabs for suggestions (with confidence bars), learned-word stats, and settings (enable/disable, auto-submit, auto-play mode, confidence threshold, suggestion count, guess cap, submit delay).

## Install

Scribbly works unmodified on any Chromium-based browser: **Chrome, Brave, Edge, Opera**, etc.

1. Download or clone this repository.
2. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
3. Enable **Developer mode** (toggle, usually top-right).
4. Click **Load unpacked** and select the `extension` folder from this repository.
5. Visit [skribbl.io](https://skribbl.io/) and join or start a game — the Scribbly overlay appears in the top-right corner.

Firefox is not currently supported (it requires different extension APIs).

## Usage

- While you're guessing, the **Suggestions** tab lists ranked candidate words with a confidence bar. Click any word to fill and submit it as your guess immediately.
- The **Stats** tab shows every word Scribbly has learned from past rounds, ranked by how often it's seen.
- The **Settings** tab lets you toggle the extension on/off, enable/disable auto-submit, choose the auto-play mode, and tune the confidence threshold, suggestion count, max auto-guesses per round, and submit delay. A **Reset learned word data** button clears everything Scribbly has learned.

## How it works

1. `src/dom.js` reads the current hint from the page (falling back to a heuristic detector if skribbl.io's markup changes), reads confirmed answers out of the chat log, and reads other players' wrong guesses (excluding anything that matches the just-revealed answer).
2. `src/matcher.js` parses the hint into a pattern (letters, blanks, word breaks) and matches it against the word bank, enforcing exact word-count and per-word-length agreement for multi-word hints. An optional plausibility scorer can nudge ranking as a tiebreaker among similarly-weighted candidates.
3. `src/scoring.js` scores how English-like a word's letter sequence is using bigram frequencies, used as that tiebreaker.
4. `src/learning.js` tracks how often each word has been confirmed as an answer and folds that into each word's ranking weight, persisted via `chrome.storage.local`.
5. `src/overlay.js` renders the floating suggestions/stats/settings UI.
6. `src/content.js` wires it all together: on every hint/chat change it re-ranks candidates, updates the UI, and (if enabled and the current auto-play mode's condition is met) auto-submits the top guess, respecting the guess cap and a minimum interval between guesses.

## Development

Run the unit tests (plain Node, no framework required):

```sh
node extension/src/matcher.test.js
node extension/src/learning.test.js
node extension/src/scoring.test.js
```