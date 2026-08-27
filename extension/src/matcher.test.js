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
  // pattern's blank is index 1 ('p' in "apple"); excluding 'p' should
  // reject the word even though 'p' also appears at a known position.
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

test("findCandidates: filters and ranks by list order", () => {
  const words = ["apple", "angle", "ample", "zzz"];
  const results = findCandidates(words, "a _ p l e", null, 10);
  assert.deepStrictEqual(results, ["apple", "ample"]);
});

test("findCandidates: respects limit", () => {
  const words = ["cat", "car", "can", "cap"];
  const results = findCandidates(words, "c a _", null, 2);
  assert.strictEqual(results.length, 2);
});

test("findCandidates: multi-word phrases match on compact length", () => {
  const words = ["six pack"];
  // "six pack" compact = "sixpack" (7 letters); hint has 7 blanks
  const hint = "_ _ _ _ _ _ _";
  const results = findCandidates(words, hint, null, 10);
  assert.deepStrictEqual(results, ["six pack"]);
});

test("findCandidates: no hint returns empty", () => {
  assert.deepStrictEqual(findCandidates(["cat"], "", null, 10), []);
});
