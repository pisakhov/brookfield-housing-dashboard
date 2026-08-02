import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { validateMarketData } from "./validate-data-lib.mjs";

const execFileAsync = promisify(execFile);
const ZILLOW = "https://files.zillowstatic.com/research/public_csvs/";
const outputUrl = new URL("../app/data/market-data.json", import.meta.url);

const sources = {
  inventory: `${ZILLOW}invt_fs/City_invt_fs_uc_sfrcondo_sm_month.csv`,
  newListings: `${ZILLOW}new_listings/City_new_listings_uc_sfrcondo_sm_month.csv`,
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

const geographyChecks = {
  inventory: city,
  newListings: city,
  priceCuts: city,
  zhviMiddle: city,
  zhviBottom: city,
  daysPending: county,
  saleToListMean: county,
  saleToListMedian: county,
  totalMonthlyPayment: metro,
  incomeNeeded: metro,
  zori: metro,
  zhvf: metro,
};

function city(row) {
  return row.RegionID === "23843" && row.RegionName === "Brookfield" && row.RegionType === "city" && (row.StateName === "CT" || row.State === "CT");
}

function county(row) {
  return row.RegionID === "2694" && row.RegionName === "Fairfield County" && row.RegionType === "county" && (row.StateName === "CT" || row.State === "CT");
}

function metro(row) {
  return row.RegionID === "394415" && row.RegionName === "Bridgeport, CT" && row.RegionType === "msa" && row.StateName === "CT";
}

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
  await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--retry", "3", "--retry-all-errors", "--max-time", "300", "--output", path, url]);
}

async function extractRow(path, predicate, name) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers;
  let match;
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
    if (!predicate(row)) continue;
    if (match) throw new Error(`${name}: duplicate expected geography`);
    match = row;
  }
  if (!match) throw new Error(`${name}: expected geography was not found`);
  return match;
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

async function readPrevious() {
  try {
    await access(outputUrl);
    return JSON.parse(await readFile(outputUrl, "utf8"));
  } catch {
    return null;
  }
}

function preventRegression(previous, next) {
  if (!previous?.series) return;
  const checks = ["market", "priceCuts", "homeValues", "saleToList", "ownership"];
  for (const key of checks) {
    const before = previous.series[key];
    const after = next.series[key];
    if (!Array.isArray(before) || !Array.isArray(after)) continue;
    if (after.length < before.length) throw new Error(`${key}: unexplained history shrinkage ${before.length} -> ${after.length}`);
    if (after.at(-1).date < before.at(-1).date) throw new Error(`${key}: latest month regressed ${before.at(-1).date} -> ${after.at(-1).date}`);
  }
  if (previous.forecast?.baseDate && next.forecast.baseDate < previous.forecast.baseDate) {
    throw new Error(`forecast base date regressed ${previous.forecast.baseDate} -> ${next.forecast.baseDate}`);
  }
}

const workDir = await mkdir(join(tmpdir(), `brookfield-data-${process.pid}`), { recursive: true }).then(() => join(tmpdir(), `brookfield-data-${process.pid}`));
const extracted = {};
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
      extracted.mortgage = [...buckets.entries()].map(([date, values]) => ({ date, value: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((a, b) => a.date.localeCompare(b.date));
    } else {
      const row = await extractRow(path, geographyChecks[name], name);
      extracted[name] = monthlySeries(row, name);
      if (name === "zhvf") extracted.forecastBaseDate = row.BaseDate;
    }
    await rm(path, { force: true });
  }

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
  const payload = {
    schemaVersion: 2,
    fetchedAt: new Date().toISOString(),
    geography: {
      city: { name: "Brookfield", state: "CT", zillowRegionId: 23843 },
      countyProxy: { name: "Fairfield County", state: "CT", zillowRegionId: 2694 },
      metroProxy: { name: "Bridgeport, CT", state: "CT", zillowRegionId: 394415 },
    },
    sources,
    notes: {
      city: "Brookfield city data is used wherever Zillow publishes the required series.",
      county: "Fairfield County is used only for days-to-pending and sale-to-list ratios because Brookfield city history is not published with sufficient coverage.",
      metro: "Bridgeport, CT is Zillow's metropolitan proxy for payment, income-needed, rent, and forecast series; these are not Brookfield-specific estimates.",
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

  validateMarketData(payload);
  preventRegression(await readPrevious(), payload);
  await mkdir(new URL("../app/data/", import.meta.url), { recursive: true });
  const temporaryUrl = new URL("../app/data/market-data.json.tmp", import.meta.url);
  await writeFile(temporaryUrl, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryUrl, outputUrl);
  console.log(`Wrote validated data: market ${payload.series.market[0].date} through ${payload.series.market.at(-1).date}; forecast base ${payload.forecast.baseDate}.`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
