import type { HomeValueObservation, MarketData, MarketObservation, OwnershipObservation } from "./market-data";

export function clamp(value: number, minimum = 0, maximum = 100) {
  if (!Number.isFinite(value)) throw new Error("Score input must be finite");
  return Math.min(maximum, Math.max(minimum, value));
}

export function percentileRank(values: number[], value: number) {
  if (!values.length || !values.every(Number.isFinite) || !Number.isFinite(value)) throw new Error("Percentile inputs must be finite and non-empty");
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return values.length <= 1 ? 0.5 : (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
}

export type MarketScore = MarketObservation & {
  stockFlow: number;
  inventoryYoy: number;
  supplyScore: number;
  scarcityScore: number;
  velocityScore: number;
  score: number;
};

export function scoreMarket(raw: MarketObservation[]): MarketScore[] {
  const enriched = raw.map((point, index) => {
    const lag = raw[index - 12];
    return {
      ...point,
      stockFlow: point.inventory / Math.max(point.newListings, 1),
      inventoryYoy: lag ? (point.inventory / lag.inventory - 1) * 100 : Number.NaN,
    };
  }).filter((point) => point.date >= "2020-01" && Number.isFinite(point.inventoryYoy));
  const flow = enriched.map((point) => point.stockFlow);
  const change = enriched.map((point) => point.inventoryYoy);
  const days = enriched.map((point) => point.countyDaysPending);
  return enriched.map((point) => {
    const supplyScore = 100 * (1 - percentileRank(flow, point.stockFlow));
    const scarcityScore = 100 * (1 - percentileRank(change, point.inventoryYoy));
    const velocityScore = 100 * (1 - percentileRank(days, point.countyDaysPending));
    return { ...point, supplyScore, scarcityScore, velocityScore, score: 0.45 * supplyScore + 0.3 * scarcityScore + 0.25 * velocityScore };
  });
}

export type OfferScore = {
  date: string;
  priceCutShare: number;
  meanSaleToList: number;
  medianSaleToList: number;
  daysPending: number;
  priceCutScore: number;
  meanRatioScore: number;
  medianRatioScore: number;
  timeScore: number;
  score: number;
};

export function scoreOfferLeverage(data: MarketData): OfferScore[] {
  const priceCuts = new Map(data.series.priceCuts.map((point) => [point.date, point.share]));
  const sales = new Map(data.series.saleToList.map((point) => [point.date, point]));
  const common = data.series.market.filter((point) => point.date >= "2020-01" && priceCuts.has(point.date) && sales.has(point.date)).map((point) => ({
    date: point.date,
    priceCutShare: priceCuts.get(point.date)!,
    meanSaleToList: sales.get(point.date)!.mean,
    medianSaleToList: sales.get(point.date)!.median,
    daysPending: point.countyDaysPending,
  }));
  const cuts = common.map((point) => point.priceCutShare);
  const means = common.map((point) => point.meanSaleToList);
  const medians = common.map((point) => point.medianSaleToList);
  const days = common.map((point) => point.daysPending);
  return common.map((point) => {
    const priceCutScore = 100 * percentileRank(cuts, point.priceCutShare);
    const meanRatioScore = 100 * (1 - percentileRank(means, point.meanSaleToList));
    const medianRatioScore = 100 * (1 - percentileRank(medians, point.medianSaleToList));
    const timeScore = 100 * percentileRank(days, point.daysPending);
    return { ...point, priceCutScore, meanRatioScore, medianRatioScore, timeScore, score: 0.4 * priceCutScore + 0.25 * meanRatioScore + 0.2 * medianRatioScore + 0.15 * timeScore };
  });
}

function budgetComponent(budget: number, value: number, lowRatio: number, width: number) {
  return clamp(((budget / value - lowRatio) / width) * 100);
}

export type BudgetReachScore = HomeValueObservation & {
  bottomReach: number;
  middleReach: number;
  score: number;
};

export function scoreBudgetReach(rows: HomeValueObservation[], budget = 500_000): BudgetReachScore[] {
  if (!(budget > 0)) throw new Error("Budget must be positive");
  return rows.filter((point) => point.date >= "2020-01").map((point) => {
    const bottomReach = budgetComponent(budget, point.bottom, 0.75, 0.5);
    const middleReach = budgetComponent(budget, point.middle, 0.65, 0.5);
    return { ...point, bottomReach, middleReach, score: 0.6 * bottomReach + 0.4 * middleReach };
  });
}

export type StressScore = OwnershipObservation & {
  paymentYoy: number;
  paymentLevelScore: number;
  paymentGrowthScore: number;
  rateScore: number;
  score: number;
};

export function scoreAffordabilityStress(rows: OwnershipObservation[]): StressScore[] {
  const enriched = rows.map((point, index) => {
    const lag = rows[index - 12];
    return { ...point, paymentYoy: lag ? (point.totalMonthlyPayment / lag.totalMonthlyPayment - 1) * 100 : Number.NaN };
  }).filter((point) => point.date >= "2020-01" && Number.isFinite(point.paymentYoy));
  const payments = enriched.map((point) => point.totalMonthlyPayment);
  const growth = enriched.map((point) => point.paymentYoy);
  const rates = enriched.map((point) => point.mortgageRate);
  return enriched.map((point) => {
    const paymentLevelScore = 100 * percentileRank(payments, point.totalMonthlyPayment);
    const paymentGrowthScore = 100 * percentileRank(growth, point.paymentYoy);
    const rateScore = 100 * percentileRank(rates, point.mortgageRate);
    return { ...point, paymentLevelScore, paymentGrowthScore, rateScore, score: 0.45 * paymentLevelScore + 0.3 * paymentGrowthScore + 0.25 * rateScore };
  });
}

export type BuyRentScore = OwnershipObservation & {
  ownershipPremium: number;
  priceRentRatio: number;
  paymentHurdle: number;
  priceRentHurdle: number;
  forecastHurdle: number;
  forecastGrowth: number;
  score: number;
};

export function scoreBuyRentHurdle(data: MarketData): BuyRentScore {
  const point = data.series.ownership.at(-1)!;
  const forecastGrowth = data.forecast.observations.at(-1)!.growthPct;
  const ownershipPremium = point.totalMonthlyPayment / point.zori;
  const priceRentRatio = point.middleZhvi / (12 * point.zori);
  const paymentHurdle = clamp((ownershipPremium - 1) * 100);
  const priceRentHurdle = clamp(((priceRentRatio - 12) / 12) * 100);
  const forecastHurdle = clamp(((5 - forecastGrowth) / 10) * 100);
  return { ...point, ownershipPremium, priceRentRatio, paymentHurdle, priceRentHurdle, forecastHurdle, forecastGrowth, score: 0.5 * paymentHurdle + 0.3 * priceRentHurdle + 0.2 * forecastHurdle };
}

export type BuyWaitScore = {
  date: string;
  forecastGrowth: number;
  forecastScore: number;
  leverageScore: number;
  budgetScore: number;
  affordabilityScore: number;
  score: number;
};

export function scoreBuyNowWait(data: MarketData): BuyWaitScore {
  const forecastGrowth = data.forecast.observations.at(-1)!.growthPct;
  const forecastScore = clamp(((forecastGrowth + 5) / 10) * 100);
  const offer = scoreOfferLeverage(data).at(-1)!;
  const budget = scoreBudgetReach(data.series.homeValues).at(-1)!;
  const stress = scoreAffordabilityStress(data.series.ownership).at(-1)!;
  const affordabilityScore = 100 - stress.score;
  return {
    date: data.forecast.baseDate.slice(0, 7),
    forecastGrowth,
    forecastScore,
    leverageScore: offer.score,
    budgetScore: budget.score,
    affordabilityScore,
    score: 0.3 * forecastScore + 0.25 * offer.score + 0.2 * budget.score + 0.25 * affordabilityScore,
  };
}

export function scoreBand(score: number, low: string, middle: string, high: string) {
  return score < 40 ? low : score <= 60 ? middle : high;
}
