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

test("findCandidates: multi-word phrases match on compact length", () => {
  const words = entries(["six pack"]);
  const hint = "_ _ _ _ _ _ _";
  const results = findCandidates(words, hint, null, 10);
  assert.deepStrictEqual(results, ["six pack"]);
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
