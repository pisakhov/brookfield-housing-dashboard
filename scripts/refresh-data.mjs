import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sources = {
  inventory: "https://files.zillowstatic.com/research/public_csvs/invt_fs/City_invt_fs_uc_sfrcondo_sm_month.csv",
  newListings: "https://files.zillowstatic.com/research/public_csvs/new_listings/City_new_listings_uc_sfrcondo_sm_month.csv",
  daysPending: "https://files.zillowstatic.com/research/public_csvs/med_doz_pending/County_med_doz_pending_uc_sfrcondo_sm_month.csv",
  mortgage: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US",
};

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ""; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

async function fetchText(url) {
  const { stdout } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--retry", "3", "--max-time", "180", url], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

function monthlySeries(row) {
  return Object.fromEntries(Object.entries(row)
    .filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && value !== "")
    .map(([key, value]) => [key.slice(0, 7), Number(value)]));
}

const [inventoryText, listingsText, daysText, mortgageText] = await Promise.all(Object.values(sources).map(fetchText));
const inventoryRows = parseCsv(inventoryText);
const listingsRows = parseCsv(listingsText);
const daysRows = parseCsv(daysText);
const mortgageRows = parseCsv(mortgageText);

const brookfield = (row) => row.RegionName === "Brookfield" && row.State === "CT" && row.RegionType === "city";
const fairfield = (row) => row.RegionName === "Fairfield County" && row.State === "CT" && row.RegionType === "county";
const inventory = monthlySeries(inventoryRows.find(brookfield));
const newListings = monthlySeries(listingsRows.find(brookfield));
const daysPending = monthlySeries(daysRows.find(fairfield));

const mortgageBuckets = {};
for (const row of mortgageRows) {
  const value = Number(row.MORTGAGE30US);
  if (!Number.isFinite(value)) continue;
  const month = row.observation_date.slice(0, 7);
  (mortgageBuckets[month] ||= []).push(value);
}
const mortgage = Object.fromEntries(Object.entries(mortgageBuckets).map(([month, values]) => [month, values.reduce((a, b) => a + b, 0) / values.length]));

const dates = Object.keys(inventory).filter((date) => newListings[date] != null && daysPending[date] != null && mortgage[date] != null).sort();
if (!dates.length) throw new Error("No common observations found");
const observations = dates.map((date) => ({
  date,
  inventory: inventory[date],
  newListings: newListings[date],
  countyDaysPending: daysPending[date],
  mortgageRate: Number(mortgage[date].toFixed(3)),
}));

const payload = {
  fetchedAt: new Date().toISOString(),
  geography: { city: "Brookfield", county: "Fairfield County", state: "Connecticut", zillowRegionId: 23843 },
  sources,
  notes: {
    inventory: "Zillow smoothed monthly for-sale inventory, city geography, all homes.",
    newListings: "Zillow smoothed monthly new listings, city geography, all homes.",
    daysPending: "Zillow smoothed median days to pending for Fairfield County; the county proxy is used because Zillow suppresses most historical Brookfield city observations.",
    mortgage: "Monthly arithmetic mean computed from Freddie Mac's weekly 30-year fixed-rate series distributed by FRED (MORTGAGE30US).",
  },
  observations,
};

await mkdir(new URL("../app/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../app/data/market-data.json", import.meta.url), JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${observations.length} common monthly observations (${dates[0]} through ${dates.at(-1)}).`);
