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

function validateForecast(forecast, label, requireCurrent) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(forecast?.baseDate || ""), `${label} baseDate is invalid`);
  const forecastBase = Date.parse(`${forecast.baseDate}T00:00:00Z`);
  invariant(Number.isFinite(forecastBase), `${label} baseDate is invalid`);
  if (requireCurrent) invariant(Date.now() - forecastBase <= 180 * 86_400_000 && forecastBase - Date.now() <= 7 * 86_400_000, `${label} baseDate is stale or implausibly future`);
  invariant(Array.isArray(forecast.observations) && forecast.observations.length >= 3, `${label} needs month, quarter, and year observations`);
  let priorForecast = forecast.baseDate.slice(0, 7);
  for (const point of forecast.observations) {
    invariant(/^\d{4}-\d{2}$/.test(point.date) && point.date > priorForecast, `${label} dates must be unique, increasing, and after baseDate`);
    finite(point.growthPct, `${label} growth at ${point.date}`);
    invariant(point.growthPct >= -50 && point.growthPct <= 50, `${label} growth at ${point.date} is outside a sensible domain`);
    priorForecast = point.date;
  }
}

function exactGeography(actual, expected, label) {
  invariant(actual?.name === expected.name && actual?.state === expected.state && actual?.zillowRegionId === expected.zillowRegionId, `${label} geography mismatch`);
}

export function validateMarketData(data, expected) {
  invariant(data && typeof data === "object", "payload must be an object");
  invariant(data.schemaVersion === 2, "schemaVersion must be 2");
  invariant(expected?.city && expected?.countyProxy && expected?.metroProxy, "expected market configuration is required");
  const fetchedAt = Date.parse(data.fetchedAt);
  invariant(Number.isFinite(fetchedAt) && Math.abs(Date.now() - fetchedAt) < 2 * 86_400_000, "fetchedAt must be current");

  exactGeography(data.geography?.city, expected.city, `${expected.city.name} city`);
  exactGeography(data.geography?.countyProxy, expected.countyProxy, `${expected.city.name} county proxy`);
  exactGeography(data.geography?.metroProxy, expected.metroProxy, `${expected.city.name} metro proxy`);
  exactGeography(data.geography?.newListings, expected[expected.newListingsGeography], `${expected.city.name} new-listings source`);

  const expectedSources = ["inventory", "newListings", "daysPending", "priceCuts", "zhviMiddle", "zhviBottom", "saleToListMean", "saleToListMedian", "totalMonthlyPayment", "incomeNeeded", "zori", "zhvf", "mortgage"];
  for (const source of expectedSources) invariant(/^https:\/\//.test(data.sources?.[source] || ""), `missing HTTPS source ${source}`);

  validateSeries("market", data.series?.market, {
    minimum: 84,
    fields: { inventory: [1, 2_000], newListings: [1, 10_000], countyDaysPending: [0, 365], mortgageRate: [0.1, 20] },
  });
  validateSeries("priceCuts", data.series?.priceCuts, { minimum: 84, fields: { share: [0, 1] } });
  validateSeries("homeValues", data.series?.homeValues, { minimum: 240, fields: { middle: [50_000, 5_000_000], bottom: [25_000, 3_000_000] } });
  validateSeries("saleToList", data.series?.saleToList, { minimum: 84, fields: { mean: [0.5, 1.5], median: [0.5, 1.5] } });
  validateSeries("ownership", data.series?.ownership, {
    minimum: 120,
    fields: { totalMonthlyPayment: [100, 50_000], incomeNeeded: [10_000, 1_000_000], zori: [100, 20_000], middleZhvi: [50_000, 5_000_000], mortgageRate: [0.1, 20] },
  });

  for (const row of data.series.homeValues) invariant(row.bottom < row.middle, `bottom-tier ZHVI must be below middle-tier at ${row.date}`);
  for (const row of data.series.ownership) invariant(Math.abs(row.incomeNeeded - row.totalMonthlyPayment * 40) < 2, `income-needed/payment relationship failed at ${row.date}`);
  validateForecast(data.forecast, "forecast", true);
  return data;
}

export function validateForecastArchive(archive, expectedMetroRegionId, currentForecast, previousArchive = null) {
  invariant(archive?.schemaVersion === 1, "forecast archive schemaVersion must be 1");
  invariant(archive.metroRegionId === expectedMetroRegionId, "forecast archive metro geography mismatch");
  invariant(Array.isArray(archive.vintages) && archive.vintages.length >= 1, "forecast archive must retain at least one vintage");
  let prior = "";
  const byBaseDate = new Map();
  for (const vintage of archive.vintages) {
    validateForecast(vintage, `forecast vintage ${vintage.baseDate || "unknown"}`, false);
    invariant(vintage.baseDate > prior, "forecast archive base dates must be strictly increasing");
    prior = vintage.baseDate;
    byBaseDate.set(vintage.baseDate, vintage);
  }
  invariant(JSON.stringify(archive.vintages.at(-1)) === JSON.stringify(currentForecast), "latest forecast archive vintage must match the current forecast");
  if (previousArchive?.vintages) {
    invariant(archive.vintages.length >= previousArchive.vintages.length, "forecast archive history shrank");
    for (const vintage of previousArchive.vintages) {
      invariant(JSON.stringify(byBaseDate.get(vintage.baseDate)) === JSON.stringify(vintage), `forecast archive mutated retained vintage ${vintage.baseDate}`);
    }
  }
  return archive;
}
