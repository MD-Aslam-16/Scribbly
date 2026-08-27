const assert = require("assert");
const {
  BASE_WEIGHT_SKRIBBL,
  BASE_WEIGHT_COMMON,
  BASE_WEIGHT_LEARNED_NEW,
  computeWeight,
  buildWeightedEntries,
} = require("./learning.js");

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

test("computeWeight: no sightings equals base weight", () => {
  assert.strictEqual(computeWeight(100, 0), 100);
  assert.strictEqual(computeWeight(100, undefined), 100);
});

test("computeWeight: more sightings increases weight monotonically", () => {
  const w1 = computeWeight(100, 1);
  const w5 = computeWeight(100, 5);
  const w20 = computeWeight(100, 20);
  assert.ok(w1 > 100);
  assert.ok(w5 > w1);
  assert.ok(w20 > w5);
});

test("buildWeightedEntries: skribbl words rank above common words with no learning", () => {
  const entries = buildWeightedEntries(["apple"], ["zebra"], {});
  const apple = entries.find((e) => e.word === "apple");
  const zebra = entries.find((e) => e.word === "zebra");
  assert.ok(apple.weight > zebra.weight);
});

test("buildWeightedEntries: dedupes words present in both lists, keeping skribbl weight", () => {
  const entries = buildWeightedEntries(["cat"], ["cat"], {});
  const matches = entries.filter((e) => e.word === "cat");
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].weight, BASE_WEIGHT_SKRIBBL);
});

test("buildWeightedEntries: a heavily-learned common word can outrank an unlearned skribbl word", () => {
  const entries = buildWeightedEntries(
    ["rareword"],
    ["popularword"],
    { popularword: 50 }
  );
  const rare = entries.find((e) => e.word === "rareword");
  const popular = entries.find((e) => e.word === "popularword");
  assert.ok(popular.weight > rare.weight);
});

test("buildWeightedEntries: learned word not in either static list is added", () => {
  const entries = buildWeightedEntries([], [], { newword: 3 });
  const found = entries.find((e) => e.word === "newword");
  assert.ok(found);
  assert.strictEqual(found.weight, computeWeight(BASE_WEIGHT_LEARNED_NEW, 3));
});

test("buildWeightedEntries: learned count on existing skribbl word boosts its weight", () => {
  const withoutLearning = buildWeightedEntries(["apple"], [], {});
  const withLearning = buildWeightedEntries(["apple"], [], { apple: 10 });
  const w1 = withoutLearning.find((e) => e.word === "apple").weight;
  const w2 = withLearning.find((e) => e.word === "apple").weight;
  assert.ok(w2 > w1);
});
