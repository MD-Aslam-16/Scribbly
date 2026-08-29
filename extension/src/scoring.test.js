const assert = require("assert");
const { scoreWord } = require("./scoring.js");

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

test("scoreWord: empty/null input scores 0", () => {
  assert.strictEqual(scoreWord(""), 0);
  assert.strictEqual(scoreWord(null), 0);
});

test("scoreWord: single letter is not penalized", () => {
  assert.strictEqual(scoreWord("a"), 1);
});

test("scoreWord: common English word scores higher than an implausible letter run", () => {
  const common = scoreWord("the");
  const implausible = scoreWord("zqx");
  assert.ok(common > implausible);
});

test("scoreWord: result stays within [0, 1]", () => {
  const s = scoreWord("thermometer");
  assert.ok(s >= 0 && s <= 1);
});

test("scoreWord: multi-word phrases (spaces) are scored using letters only", () => {
  const s = scoreWord("the cat");
  assert.ok(s > 0);
});
