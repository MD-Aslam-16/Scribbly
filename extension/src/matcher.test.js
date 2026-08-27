const assert = require("assert");
const { parseHintPattern, wordMatchesPattern, findCandidates } = require("./matcher.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function entries(words, weight) {
  return words.map((word) => ({ word, weight: weight || 1 }));
}

test("parseHintPattern: all blanks", () => {
  assert.deepStrictEqual(parseHintPattern("_ _ _"), [null, null, null]);
});

test("parseHintPattern: mixed known letters", () => {
  assert.deepStrictEqual(parseHintPattern("a _ p l e"), [
    "a",
    null,
    "p",
    "l",
    "e",
  ]);
});

test("parseHintPattern: empty input", () => {
  assert.strictEqual(parseHintPattern(""), null);
  assert.strictEqual(parseHintPattern(null), null);
});

test("parseHintPattern: contiguous string (no spaces) as skribbl actually renders it", () => {
  assert.deepStrictEqual(parseHintPattern("___g_"), [
    null,
    null,
    null,
    "g",
    null,
  ]);
});

test("wordMatchesPattern: length mismatch", () => {
  assert.strictEqual(wordMatchesPattern("cat", [null, null], null), false);
});

test("wordMatchesPattern: known letters must match", () => {
  assert.strictEqual(
    wordMatchesPattern("apple", ["a", null, "p", "l", "e"], null),
    true
  );
  assert.strictEqual(
    wordMatchesPattern("angle", ["a", null, "p", "l", "e"], null),
    false
  );
});

test("wordMatchesPattern: excluded letter matching a blank position fails", () => {
  const excluded = new Set(["p"]);
  assert.strictEqual(
    wordMatchesPattern("apple", ["a", null, "p", "l", "e"], excluded),
    false
  );
});

test("wordMatchesPattern: excluded letter only checked at blank positions", () => {
  const excluded = new Set(["x"]);
  assert.strictEqual(
    wordMatchesPattern("apple", ["a", null, "p", "l", "e"], excluded),
    true
  );
});

test("findCandidates: sorts by weight descending", () => {
  const words = [
    { word: "apple", weight: 5 },
    { word: "angle", weight: 10 },
    { word: "ample", weight: 1 },
  ];
  const results = findCandidates(words, "a _ _ l e", null, 10);
  assert.deepStrictEqual(results, ["angle", "apple", "ample"]);
});

test("findCandidates: respects limit after sorting", () => {
  const words = entries(["cat", "car", "can", "cap"]);
  const results = findCandidates(words, "c a _", null, 2);
  assert.strictEqual(results.length, 2);
});

test("findCandidates: no hint returns empty", () => {
  assert.deepStrictEqual(findCandidates(entries(["cat"]), "", null, 10), []);
});

test("findCandidates: matches against contiguous (no-space) hint", () => {
  const words = [
    { word: "dough", weight: 2 },
    { word: "tough", weight: 1 },
    { word: "cat", weight: 100 },
  ];
  const results = findCandidates(words, "___g_", null, 10);
  assert.deepStrictEqual(results, ["dough", "tough"]);
});

test("parseHintPattern: double space marks a word boundary", () => {
  // "e" then word break then "ice" (3 blanks)
  assert.deepStrictEqual(parseHintPattern("_ _ e  _ _ _"), [
    null,
    null,
    "e",
    " ",
    null,
    null,
    null,
  ]);
});

test("findCandidates: single-word hint does NOT match a multi-word candidate", () => {
  const words = entries(["six pack"]); // compact length 7
  const hint = "_______"; // 7 blanks, single word, no space marker
  const results = findCandidates(words, hint, null, 10);
  assert.deepStrictEqual(results, []);
});

test("findCandidates: multi-word hint matches a multi-word candidate with the same word lengths", () => {
  const words = entries(["six pack", "sixpack"]);
  // "six" (3) + break + "pack" (4)
  const hint = "___  ____";
  const results = findCandidates(words, hint, null, 10);
  assert.deepStrictEqual(results, ["six pack"]);
});

test("findCandidates: multi-word hint does NOT match a single-word candidate of the same total length", () => {
  const words = entries(["sevenup"]); // 7 letters, no space
  const hint = "___  ___"; // 3 + break + 3 = 7 chars but has a word break
  const results = findCandidates(words, hint, null, 10);
  assert.deepStrictEqual(results, []);
});

test("findCandidates: multi-word hint requires word break at the same position", () => {
  const words = entries(["ice cream"]); // 3 + break + 5
  const wrongSplitHint = "____  ____"; // 4 + break + 4, wrong split
  assert.deepStrictEqual(
    findCandidates(words, wrongSplitHint, null, 10),
    []
  );
  const rightSplitHint = "___  _____"; // 3 + break + 5, correct split
  assert.deepStrictEqual(
    findCandidates(words, rightSplitHint, null, 10),
    ["ice cream"]
  );
});

test("findCandidates: excludeWords omits already-tried words entirely", () => {
  const words = [
    { word: "cat", weight: 10 },
    { word: "car", weight: 5 },
    { word: "can", weight: 1 },
  ];
  const results = findCandidates(words, "c a _", null, 10, new Set(["cat"]));
  assert.deepStrictEqual(results, ["car", "can"]);
});

test("findCandidates: excludeWords accepts a plain array too", () => {
  const words = entries(["cat", "car"]);
  const results = findCandidates(words, "c a _", null, 10, ["cat"]);
  assert.deepStrictEqual(results, ["car"]);
});
