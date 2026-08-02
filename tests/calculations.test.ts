import assert from "node:assert/strict";
import test from "node:test";

import marketDataJson from "../app/data/market-data.json";
import { clamp, percentileRank, scoreAffordabilityStress, scoreBudgetReach, scoreBuyNowWait, scoreBuyRentHurdle, scoreMarket, scoreOfferLeverage } from "../lib/calculations";
import type { MarketData, OwnershipObservation } from "../lib/market-data";

const marketData = marketDataJson as MarketData;

function monthAt(index: number) {
  const date = new Date(Date.UTC(2020, index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("clamp and percentile helpers handle bounds, ties, and invalid inputs", () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(101), 100);
  assert.equal(clamp(42), 42);
  assert.throws(() => clamp(Number.NaN));
  assert.equal(percentileRank([10, 20, 30], 10), 0);
  assert.equal(percentileRank([10, 20, 30], 20), 0.5);
  assert.equal(percentileRank([10, 20, 30], 30), 1);
  assert.equal(percentileRank([7], 7), 0.5);
});

test("budget reach matches a hand-calculated example and improves as values fall", () => {
  const [example] = scoreBudgetReach([{ date: "2026-01", bottom: 400_000, middle: 500_000 }]);
  assert.equal(example.bottomReach, 100);
  assert.equal(example.middleReach, 70);
  assert.equal(example.score, 88);
  const [harder, easier] = scoreBudgetReach([
    { date: "2026-01", bottom: 480_000, middle: 650_000 },
    { date: "2026-02", bottom: 360_000, middle: 500_000 },
  ]);
  assert.ok(easier.score > harder.score);
  assert.throws(() => scoreBudgetReach([{ date: "2026-01", bottom: 1, middle: 1 }], 0));
});

test("offer leverage moves monotonically with buyer-favorable inputs", () => {
  const fixture = structuredClone(marketData);
  fixture.series.market = [0, 1, 2].map((index) => ({ date: monthAt(index), inventory: 50, newListings: 20, mortgageRate: 5, countyDaysPending: 10 + index * 10 }));
  fixture.series.priceCuts = [0, 1, 2].map((index) => ({ date: monthAt(index), share: 0.1 + index * 0.1 }));
  fixture.series.saleToList = [0, 1, 2].map((index) => ({ date: monthAt(index), mean: 1.02 - index * 0.02, median: 1.01 - index * 0.015 }));
  const scored = scoreOfferLeverage(fixture);
  assert.ok(scored[0].score < scored[1].score && scored[1].score < scored[2].score);
  assert.equal(scored[0].score, 0);
  assert.equal(scored[2].score, 100);
});

test("affordability stress rises when payment, growth, and rates rise", () => {
  const rows: OwnershipObservation[] = Array.from({ length: 30 }, (_, index) => ({
    date: monthAt(index),
    totalMonthlyPayment: 2_000 + index * index * 8,
    incomeNeeded: (2_000 + index * index * 8) * 40,
    zori: 1_500,
    middleZhvi: 400_000,
    mortgageRate: 3 + index * 0.1,
  }));
  const scored = scoreAffordabilityStress(rows);
  assert.ok(scored.at(-1)!.score > scored[0].score);
});

test("buy-versus-rent hurdle matches a hand-calculated example", () => {
  const fixture = structuredClone(marketData);
  fixture.series.ownership = [{ date: "2026-01", totalMonthlyPayment: 4_000, incomeNeeded: 160_000, zori: 2_000, middleZhvi: 480_000, mortgageRate: 6 }];
  fixture.forecast = { baseDate: "2026-01-31", observations: [{ date: "2026-02", growthPct: 0 }, { date: "2026-04", growthPct: 0 }, { date: "2027-01", growthPct: 0 }] };
  const score = scoreBuyRentHurdle(fixture);
  assert.equal(score.paymentHurdle, 100);
  assert.ok(Math.abs(score.priceRentHurdle - 66.6666667) < 1e-6);
  assert.equal(score.forecastHurdle, 50);
  assert.ok(Math.abs(score.score - 80) < 1e-9);
});

test("all published scores are finite and bounded", () => {
  const collections = [scoreMarket(marketData.series.market), scoreOfferLeverage(marketData), scoreBudgetReach(marketData.series.homeValues), scoreAffordabilityStress(marketData.series.ownership)];
  for (const collection of collections) {
    assert.ok(collection.length > 0);
    for (const point of collection) assert.ok(Number.isFinite(point.score) && point.score >= 0 && point.score <= 100);
  }
  for (const score of [scoreBuyRentHurdle(marketData).score, scoreBuyNowWait(marketData).score]) assert.ok(Number.isFinite(score) && score >= 0 && score <= 100);
});

test("current published raw observations and scores match independently reviewed values", () => {
  const market = scoreMarket(marketData.series.market).at(-1)!;
  const offer = scoreOfferLeverage(marketData).at(-1)!;
  const budget = scoreBudgetReach(marketData.series.homeValues).at(-1)!;
  const stress = scoreAffordabilityStress(marketData.series.ownership).at(-1)!;
  const rent = scoreBuyRentHurdle(marketData);
  const wait = scoreBuyNowWait(marketData);

  assert.deepEqual(marketData.series.market.at(-1), { date: "2026-06", inventory: 59, newListings: 30, countyDaysPending: 11, mortgageRate: 6.49 });
  assert.deepEqual(marketData.series.homeValues.at(-1), { date: "2026-06", middle: 591916.53, bottom: 410500.69 });
  assert.deepEqual(marketData.series.ownership.at(-1), { date: "2026-06", totalMonthlyPayment: 4875.68, incomeNeeded: 195027.18, zori: 2869.96, middleZhvi: 591916.53, mortgageRate: 6.49 });
  assert.equal(marketData.forecast.observations.at(-1)!.growthPct, 2.4);

  const reviewed = { market: 62.4026, offer: 49.2763, budget: 71.7401, stress: 72.5974, rent: 53.1112, wait: 55.7177 };
  for (const [actual, expected] of [[market.score, reviewed.market], [offer.score, reviewed.offer], [budget.score, reviewed.budget], [stress.score, reviewed.stress], [rent.score, reviewed.rent], [wait.score, reviewed.wait]]) {
    assert.ok(Math.abs(actual - expected) < 0.001, `${actual} should equal independently reviewed ${expected}`);
  }
});
