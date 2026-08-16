import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { validateForecastArchive, validateMarketData } from "./validate-data-lib.mjs";

const execFileAsync = promisify(execFile);
const ZILLOW = "https://files.zillowstatic.com/research/public_csvs/";
const configUrl = new URL("../config/markets.json", import.meta.url);
const forecastArchiveUrl = new URL("../app/data/forecast-vintages.json", import.meta.url);
const marketConfigs = JSON.parse(await readFile(configUrl, "utf8"));

const townFlag = process.argv.indexOf("--town");
const requestedTown = townFlag === -1 ? "all" : process.argv[townFlag + 1];
if (!requestedTown || (requestedTown !== "all" && !marketConfigs[requestedTown])) {
  throw new Error(`--town must be one of all, ${Object.keys(marketConfigs).join(", ")}`);
}
const targets = Object.entries(marketConfigs).filter(([slug]) => requestedTown === "all" || requestedTown === slug);

const sources = {
  inventory: `${ZILLOW}invt_fs/City_invt_fs_uc_sfrcondo_sm_month.csv`,
  newListingsCity: `${ZILLOW}new_listings/City_new_listings_uc_sfrcondo_sm_month.csv`,
  newListingsCounty: `${ZILLOW}new_listings/County_new_listings_uc_sfrcondo_sm_month.csv`,
  daysPending: `${ZILLOW}med_doz_pending/County_med_doz_pending_uc_sfrcondo_sm_month.csv`,
  priceCuts: `${ZILLOW}perc_listings_price_cut/City_perc_listings_price_cut_uc_sfrcondo_sm_month.csv`,
  zhviMiddle: `${ZILLOW}zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
  zhviBottom: `${ZILLOW}zhvi/City_zhvi_uc_sfrcondo_tier_0.0_0.33_sm_sa_month.csv`,
  saleToListMean: `${ZILLOW}mean_sale_to_list/County_mean_sale_to_list_uc_sfrcondo_sm_month.csv`,
  saleToListMedian: `${ZILLOW}median_sale_to_list/County_median_sale_to_list_uc_sfrcondo_sm_month.csv`,
  totalMonthlyPayment: `${ZILLOW}total_monthly_payment/Metro_total_monthly_payment_downpayment_0.20_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
  incomeNeeded: `${ZILLOW}new_homeowner_income_needed/Metro_new_homeowner_income_needed_downpayment_0.20_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
  zori: `${ZILLOW}zori/Metro_zori_uc_sfrcondomfr_sm_month.csv`,
  zhvf: `${ZILLOW}zhvf_growth/Metro_zhvf_growth_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
  mortgage: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US",
};

const sourceGeography = {
  inventory: "city",
  newListingsCity: "city",
  newListingsCounty: "countyProxy",
  priceCuts: "city",
  zhviMiddle: "city",
  zhviBottom: "city",
  daysPending: "countyProxy",
  saleToListMean: "countyProxy",
  saleToListMedian: "countyProxy",
  totalMonthlyPayment: "metroProxy",
  incomeNeeded: "metroProxy",
  zori: "metroProxy",
  zhvf: "metroProxy",
};

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("Unterminated quoted CSV cell");
  cells.push(cell.replace(/\r$/, ""));
  return cells;
}

async function download(url, path) {
  await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--compressed", "--retry", "5", "--retry-all-errors", "--retry-delay", "2", "--max-time", "300", "--output", path, url]);
}

function rowMatches(row, geography, key) {
  const expectedType = key === "city" ? "city" : key === "countyProxy" ? "county" : "msa";
  return row.RegionID === String(geography.zillowRegionId)
    && row.RegionName === geography.name
    && row.RegionType === expectedType
    && (row.StateName === geography.state || row.State === geography.state);
}

async function extractRows(path, name, geographyKey) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers;
  const matches = new Map();
  for await (const line of lines) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/, ""));
      if (!headers.includes("RegionID") || !headers.includes("RegionName") || !headers.some((header) => /^\d{4}-\d{2}-\d{2}$/.test(header))) {
        throw new Error(`${name}: unexpected Zillow CSV schema`);
      }
      continue;
    }
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`${name}: malformed CSV row`);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    for (const [slug, config] of targets) {
      if (!rowMatches(row, config[geographyKey], geographyKey)) continue;
      if (matches.has(slug)) throw new Error(`${name}: duplicate expected geography for ${slug}`);
      matches.set(slug, row);
    }
  }
  for (const [slug] of targets) {
    if (!matches.has(slug)) throw new Error(`${name}: expected geography was not found for ${slug}`);
  }
  return matches;
}

function monthlySeries(row, name) {
  const seen = new Set();
  return Object.entries(row)
    .filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && value !== "")
    .map(([key, value]) => {
      const date = key.slice(0, 7);
      const numeric = Number(value);
      if (seen.has(date)) throw new Error(`${name}: duplicate month ${date}`);
      if (!Number.isFinite(numeric)) throw new Error(`${name}: non-finite value at ${date}`);
      seen.add(date);
      return { date, value: numeric };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function toMap(series) {
  return new Map(series.map((point) => [point.date, point.value]));
}

function commonDates(...series) {
  const maps = series.map(toMap);
  return [...maps[0].keys()].filter((date) => maps.every((map) => map.has(date))).sort();
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

async function readJsonIfPresent(url) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function preventRegression(previous, next) {
  if (!previous?.series) return;
  for (const key of ["market", "priceCuts", "homeValues", "saleToList", "ownership"]) {
    const before = previous.series[key];
    const after = next.series[key];
    if (!Array.isArray(before) || !Array.isArray(after)) continue;
    if (after.length < before.length) throw new Error(`${next.geography.city.name} ${key}: unexplained history shrinkage ${before.length} -> ${after.length}`);
    if (after.at(-1).date < before.at(-1).date) throw new Error(`${next.geography.city.name} ${key}: latest month regressed ${before.at(-1).date} -> ${after.at(-1).date}`);
  }
  if (previous.forecast?.baseDate && next.forecast.baseDate < previous.forecast.baseDate) {
    throw new Error(`${next.geography.city.name}: forecast base date regressed ${previous.forecast.baseDate} -> ${next.forecast.baseDate}`);
  }
}

function buildPayload(config, extracted, fetchedAt) {
  const inventory = toMap(extracted.inventory);
  const newListings = toMap(extracted.newListings);
  const daysPending = toMap(extracted.daysPending);
  const mortgage = toMap(extracted.mortgage);
  const marketDates = commonDates(extracted.inventory, extracted.newListings, extracted.daysPending, extracted.mortgage);

  const middle = toMap(extracted.zhviMiddle);
  const bottom = toMap(extracted.zhviBottom);
  const homeValueDates = commonDates(extracted.zhviMiddle, extracted.zhviBottom);

  const saleMean = toMap(extracted.saleToListMean);
  const saleMedian = toMap(extracted.saleToListMedian);
  const saleDates = commonDates(extracted.saleToListMean, extracted.saleToListMedian);

  const payment = toMap(extracted.totalMonthlyPayment);
  const income = toMap(extracted.incomeNeeded);
  const rent = toMap(extracted.zori);
  const ownershipDates = commonDates(extracted.totalMonthlyPayment, extracted.incomeNeeded, extracted.zori, extracted.zhviMiddle, extracted.mortgage);

  const forecast = extracted.zhvf.map((point) => ({ date: point.date, growthPct: round(point.value, 3) }));
  const publicSources = { ...sources, newListings: config.newListingsGeography === "city" ? sources.newListingsCity : sources.newListingsCounty };
  delete publicSources.newListingsCity;
  delete publicSources.newListingsCounty;
  return {
    schemaVersion: 2,
    fetchedAt,
    geography: {
      city: config.city,
      countyProxy: config.countyProxy,
      metroProxy: config.metroProxy,
      newListings: config[config.newListingsGeography],
    },
    sources: publicSources,
    notes: {
      city: `${config.city.name} city data is used wherever Zillow publishes the required series.`,
      county: `${config.countyProxy.name} is used for days-to-pending and sale-to-list ratios because ${config.city.name} city history is not published with sufficient coverage.`,
      newListings: config.newListingsGeography === "city" ? `${config.city.name} city new-listings history is used directly.` : `${config.countyProxy.name} new listings are a disclosed flow proxy because Zillow's ${config.city.name} city series begins only in 2026 and cannot support a historical 12-month market score.`,
      metro: `${config.metroProxy.name} is Zillow's metropolitan proxy for payment, income-needed, rent, and forecast series; these are not ${config.city.name}-specific estimates.`,
      mortgage: "Monthly arithmetic mean computed from Freddie Mac's weekly U.S. 30-year fixed-rate series distributed by FRED (MORTGAGE30US).",
    },
    series: {
      market: marketDates.map((date) => ({
        date,
        inventory: inventory.get(date),
        newListings: newListings.get(date),
        countyDaysPending: daysPending.get(date),
        mortgageRate: round(mortgage.get(date), 3),
      })),
      priceCuts: extracted.priceCuts.map(({ date, value }) => ({ date, share: round(value, 6) })),
      homeValues: homeValueDates.map((date) => ({ date, middle: round(middle.get(date), 2), bottom: round(bottom.get(date), 2) })),
      saleToList: saleDates.map((date) => ({ date, mean: round(saleMean.get(date), 6), median: round(saleMedian.get(date), 6) })),
      ownership: ownershipDates.map((date) => ({
        date,
        totalMonthlyPayment: round(payment.get(date), 2),
        incomeNeeded: round(income.get(date), 2),
        zori: round(rent.get(date), 2),
        middleZhvi: round(middle.get(date), 2),
        mortgageRate: round(mortgage.get(date), 3),
      })),
    },
    forecast: {
      baseDate: String(extracted.forecastBaseDate || "").slice(0, 10),
      observations: forecast,
    },
  };
}

function mergeForecastArchive(previous, forecast, metroRegionId) {
  const byBaseDate = new Map((previous?.vintages || []).map((vintage) => [vintage.baseDate, vintage]));
  byBaseDate.set(forecast.baseDate, forecast);
  return {
    schemaVersion: 1,
    metroRegionId,
    vintages: [...byBaseDate.values()].sort((left, right) => left.baseDate.localeCompare(right.baseDate)),
  };
}

const workDir = join(tmpdir(), `housing-market-data-${process.pid}`);
await mkdir(workDir, { recursive: true });
const extractedByTown = Object.fromEntries(targets.map(([slug]) => [slug, {}]));
const previousByTown = Object.fromEntries(await Promise.all(targets.map(async ([slug, config]) => [slug, await readJsonIfPresent(new URL(`../${config.dataFile}`, import.meta.url))])));
const previousArchive = await readJsonIfPresent(forecastArchiveUrl);

try {
  for (const [name, url] of Object.entries(sources)) {
    const path = join(workDir, `${name}.csv`);
    console.log(`Downloading ${name}...`);
    await download(url, path);
    if (name === "mortgage") {
      const text = await readFile(path, "utf8");
      const rows = text.trim().split(/\r?\n/).slice(1).map((line) => parseCsvLine(line));
      const buckets = new Map();
      for (const [date, raw] of rows) {
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        const month = date.slice(0, 7);
        const values = buckets.get(month) || [];
        values.push(value);
        buckets.set(month, values);
      }
      const mortgage = [...buckets.entries()].map(([date, values]) => ({ date, value: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((left, right) => left.date.localeCompare(right.date));
      for (const [slug] of targets) extractedByTown[slug].mortgage = mortgage;
    } else {
      const rows = await extractRows(path, name, sourceGeography[name]);
      for (const [slug, row] of rows) {
        const config = marketConfigs[slug];
        if (name === "newListingsCity" && config.newListingsGeography !== "city") continue;
        if (name === "newListingsCounty" && config.newListingsGeography !== "countyProxy") continue;
        const logicalName = name === "newListingsCity" || name === "newListingsCounty" ? "newListings" : name;
        extractedByTown[slug][logicalName] = monthlySeries(row, `${slug} ${logicalName}`);
        if (name === "zhvf") extractedByTown[slug].forecastBaseDate = row.BaseDate;
      }
    }
    await rm(path, { force: true });
  }

  const fetchedAt = new Date().toISOString();
  const payloads = {};
  for (const [slug, config] of targets) {
    const payload = buildPayload(config, extractedByTown[slug], fetchedAt);
    validateMarketData(payload, config);
    preventRegression(previousByTown[slug], payload);
    payloads[slug] = payload;
  }

  const forecasts = Object.values(payloads).map((payload) => JSON.stringify(payload.forecast));
  if (new Set(forecasts).size !== 1) throw new Error("Configured towns resolved to different shared metro forecasts");
  const metroRegionId = targets[0][1].metroProxy.zillowRegionId;
  const forecastArchive = mergeForecastArchive(previousArchive, Object.values(payloads)[0].forecast, metroRegionId);
  validateForecastArchive(forecastArchive, metroRegionId, Object.values(payloads)[0].forecast, previousArchive);

  const writes = [];
  for (const [slug, config] of targets) {
    const outputUrl = new URL(`../${config.dataFile}`, import.meta.url);
    const temporaryUrl = new URL(`${outputUrl.href}.tmp-${process.pid}`);
    await writeFile(temporaryUrl, `${JSON.stringify(payloads[slug], null, 2)}\n`);
    writes.push([temporaryUrl, outputUrl]);
  }
  const temporaryArchiveUrl = new URL(`${forecastArchiveUrl.href}.tmp-${process.pid}`);
  await writeFile(temporaryArchiveUrl, `${JSON.stringify(forecastArchive, null, 2)}\n`);
  writes.push([temporaryArchiveUrl, forecastArchiveUrl]);
  for (const [temporaryUrl, outputUrl] of writes) await rename(temporaryUrl, outputUrl);

  for (const [slug] of targets) {
    const payload = payloads[slug];
    console.log(`Wrote validated ${slug} data: market ${payload.series.market[0].date} through ${payload.series.market.at(-1).date}; forecast base ${payload.forecast.baseDate}.`);
  }
  console.log(`Forecast archive now contains ${forecastArchive.vintages.length} retained vintages.`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
