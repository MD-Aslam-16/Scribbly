const assert = require("assert");
const {
  BASE_WEIGHT_MIN,
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

test("computeWeight: no sightings equals base weight (floored)", () => {
  assert.strictEqual(computeWeight(100, 0), 100);
  assert.strictEqual(computeWeight(100, undefined), 100);
  assert.strictEqual(computeWeight(0, 0), BASE_WEIGHT_MIN);
});

test("computeWeight: more sightings increases weight monotonically", () => {
  const w1 = computeWeight(100, 1);
  const w5 = computeWeight(100, 5);
  const w20 = computeWeight(100, 20);
  assert.ok(w1 > 100);
  assert.ok(w5 > w1);
  assert.ok(w20 > w5);
});

test("buildWeightedEntries: higher 'picked' count ranks a word higher with no learning", () => {
  const entries = buildWeightedEntries(
    [
      { word: "popular", picked: 40 },
      { word: "rare", picked: 2 },
    ],
    {}
  );
  const popular = entries.find((e) => e.word === "popular");
  const rare = entries.find((e) => e.word === "rare");
  assert.ok(popular.weight > rare.weight);
});

test("buildWeightedEntries: word not in bundled bank is added from learned counts", () => {
  const entries = buildWeightedEntries([], { newword: 3 });
  const found = entries.find((e) => e.word === "newword");
  assert.ok(found);
  assert.strictEqual(
    found.weight,
    computeWeight(BASE_WEIGHT_LEARNED_NEW, 3)
  );
});

test("buildWeightedEntries: learned count on an existing bank word boosts its weight", () => {
  const withoutLearning = buildWeightedEntries(
    [{ word: "apple", picked: 5 }],
    {}
  );
  const withLearning = buildWeightedEntries(
    [{ word: "apple", picked: 5 }],
    { apple: 10 }
  );
  const w1 = withoutLearning.find((e) => e.word === "apple").weight;
  const w2 = withLearning.find((e) => e.word === "apple").weight;
  assert.ok(w2 > w1);
});

test("buildWeightedEntries: a bank word with picked=0 still ranks via the base floor", () => {
  const entries = buildWeightedEntries([{ word: "unpicked", picked: 0 }], {});
  const found = entries.find((e) => e.word === "unpicked");
  assert.strictEqual(found.weight, BASE_WEIGHT_MIN);
});
