function invariant(condition, message) {
  if (!condition) throw new Error(`Data validation failed: ${message}`);
}

function finite(value, label) {
  invariant(typeof value === "number" && Number.isFinite(value), `${label} must be finite`);
}

function validateSeries(name, rows, { minimum, fields, latestWithinDays = 180 }) {
  invariant(Array.isArray(rows), `${name} must be an array`);
  invariant(rows.length >= minimum, `${name} needs at least ${minimum} observations; found ${rows.length}`);
  let prior = "";
  const dates = new Set();
  for (const [index, row] of rows.entries()) {
    invariant(/^\d{4}-\d{2}$/.test(row.date), `${name}[${index}] has invalid month`);
    invariant(row.date > prior, `${name} dates must be strictly increasing`);
    invariant(!dates.has(row.date), `${name} has duplicate month ${row.date}`);
    prior = row.date;
    dates.add(row.date);
    for (const [field, [minimumValue, maximumValue]] of Object.entries(fields)) {
      finite(row[field], `${name}.${field} at ${row.date}`);
      invariant(row[field] >= minimumValue && row[field] <= maximumValue, `${name}.${field} at ${row.date} is outside ${minimumValue}-${maximumValue}`);
    }
  }
  const latestTime = Date.parse(`${rows.at(-1).date}-01T00:00:00Z`);
  invariant(Date.now() - latestTime <= latestWithinDays * 86_400_000, `${name} latest month ${rows.at(-1).date} is stale`);
}

export function validateMarketData(data) {
  invariant(data && typeof data === "object", "payload must be an object");
  invariant(data.schemaVersion === 2, "schemaVersion must be 2");
  const fetchedAt = Date.parse(data.fetchedAt);
  invariant(Number.isFinite(fetchedAt) && Math.abs(Date.now() - fetchedAt) < 2 * 86_400_000, "fetchedAt must be current");

  invariant(data.geography?.city?.name === "Brookfield" && data.geography.city.state === "CT" && data.geography.city.zillowRegionId === 23843, "Brookfield geography mismatch");
  invariant(data.geography?.countyProxy?.name === "Fairfield County" && data.geography.countyProxy.zillowRegionId === 2694, "Fairfield County proxy mismatch");
  invariant(data.geography?.metroProxy?.name === "Bridgeport, CT" && data.geography.metroProxy.zillowRegionId === 394415, "Bridgeport metro proxy mismatch");

  const expectedSources = ["inventory", "newListings", "daysPending", "priceCuts", "zhviMiddle", "zhviBottom", "saleToListMean", "saleToListMedian", "totalMonthlyPayment", "incomeNeeded", "zori", "zhvf", "mortgage"];
  for (const source of expectedSources) invariant(/^https:\/\//.test(data.sources?.[source] || ""), `missing HTTPS source ${source}`);

  validateSeries("market", data.series?.market, {
    minimum: 84,
    fields: { inventory: [1, 2_000], newListings: [1, 1_000], countyDaysPending: [0, 365], mortgageRate: [0.1, 20] },
  });
  validateSeries("priceCuts", data.series?.priceCuts, { minimum: 84, fields: { share: [0, 1] } });
  validateSeries("homeValues", data.series?.homeValues, { minimum: 240, fields: { middle: [50_000, 5_000_000], bottom: [25_000, 3_000_000] } });
  validateSeries("saleToList", data.series?.saleToList, { minimum: 84, fields: { mean: [0.5, 1.5], median: [0.5, 1.5] } });
  validateSeries("ownership", data.series?.ownership, {
    minimum: 120,
    fields: { totalMonthlyPayment: [100, 50_000], incomeNeeded: [10_000, 1_000_000], zori: [100, 20_000], middleZhvi: [50_000, 5_000_000], mortgageRate: [0.1, 20] },
  });

  for (const row of data.series.homeValues) invariant(row.bottom < row.middle, `bottom-tier ZHVI must be below middle-tier at ${row.date}`);
  for (const row of data.series.ownership) {
    invariant(Math.abs(row.incomeNeeded - row.totalMonthlyPayment * 40) < 2, `income-needed/payment relationship failed at ${row.date}`);
  }

  invariant(/^\d{4}-\d{2}-\d{2}$/.test(data.forecast?.baseDate || ""), "forecast baseDate is invalid");
  const forecastBase = Date.parse(`${data.forecast.baseDate}T00:00:00Z`);
  invariant(Number.isFinite(forecastBase) && Date.now() - forecastBase <= 180 * 86_400_000 && forecastBase - Date.now() <= 7 * 86_400_000, "forecast baseDate is stale or implausibly future");
  invariant(Array.isArray(data.forecast.observations) && data.forecast.observations.length >= 3, "forecast needs month, quarter, and year observations");
  let priorForecast = data.forecast.baseDate.slice(0, 7);
  for (const point of data.forecast.observations) {
    invariant(/^\d{4}-\d{2}$/.test(point.date) && point.date > priorForecast, "forecast dates must be unique, increasing, and after baseDate");
    finite(point.growthPct, `forecast growth at ${point.date}`);
    invariant(point.growthPct >= -50 && point.growthPct <= 50, `forecast growth at ${point.date} is outside a sensible domain`);
    priorForecast = point.date;
  }

  return data;
}
