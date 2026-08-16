import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ACTOR_URL = "https://api.apify.com/v2/acts/maxcopell~zillow-scraper/run-sync-get-dataset-items?format=json&clean=true";
const DATA_PATH = process.env.DATA_PATH || "/data/listings.json";
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 48 * 60 * 60 * 1000);
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const CITY = process.env.MARKET_CITY || "Brookfield";
const STATE = process.env.MARKET_STATE || "CT";
const REGION_ID = Number(process.env.ZILLOW_REGION_ID || 23843);
const ZILLOW_PATH = process.env.ZILLOW_PATH || "brookfield-ct";
const MAP_BOUNDS = {
  west: Number(process.env.MAP_WEST || -73.515),
  east: Number(process.env.MAP_EAST || -73.295),
  south: Number(process.env.MAP_SOUTH || 41.405),
  north: Number(process.env.MAP_NORTH || 41.565),
};
const ALLOWED_HOME_TYPES = new Set(["SINGLE_FAMILY", "CONDO", "TOWNHOUSE", "MANUFACTURED", "MULTI_FAMILY"]);

if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN is required");
if (!CITY || !STATE || !Number.isInteger(REGION_ID) || REGION_ID <= 0 || !Object.values(MAP_BOUNDS).every(Number.isFinite)) throw new Error("Market listing configuration is invalid");

function searchUrl() {
  const state = {
    pagination: {},
    isMapVisible: true,
    mapBounds: MAP_BOUNDS,
    regionSelection: [{ regionId: REGION_ID, regionType: 6 }],
    usersSearchTerm: `${CITY}, ${STATE}`,
    filterState: {
      sort: { value: "days" },
      price: { max: 500000 },
      ah: { value: true },
    },
    isListVisible: true,
  };
  return `https://www.zillow.com/${ZILLOW_PATH}/?searchQueryState=${encodeURIComponent(JSON.stringify(state))}`;
}

function normalize(raw) {
  const home = raw.hdpData?.homeInfo || {};
  const address = raw.listingAddress || {};
  const price = Number(raw.listingPrice?.amount ?? raw.unformattedPrice ?? home.price);
  const city = address.city ?? raw.addressCity ?? home.city;
  const state = address.state ?? raw.addressState ?? home.state;
  const status = String(raw.listingStatus ?? raw.statusType ?? home.homeStatus ?? "").toLowerCase();
  const homeType = String(raw.homeType ?? home.homeType ?? "").toUpperCase();
  const fullAddress = address.full ?? raw.address ?? [home.streetAddress, home.city, home.state, home.zipcode].filter(Boolean).join(", ");
  const propertyUrl = raw.propertyUrl ?? raw.detailUrl;
  const image = raw.mainImage ?? raw.imgSrc ?? raw.listingPhotos?.[0]?.url;
  const daysOnZillow = Number(raw.daysOnZillow ?? home.daysOnZillow);

  if (city?.toLowerCase() !== CITY.toLowerCase() || state !== STATE) return null;
  if (!Number.isFinite(price) || price > 500000 || price <= 0) return null;
  if (!status.includes("sale") || !ALLOWED_HOME_TYPES.has(homeType)) return null;
  if (!propertyUrl || !fullAddress) return null;

  return {
    id: String(raw.zpid ?? raw.id ?? home.zpid ?? propertyUrl),
    url: propertyUrl.startsWith("http") ? propertyUrl : `https://www.zillow.com${propertyUrl}`,
    image: image || null,
    address: fullAddress,
    price,
    priceFormatted: raw.listingPrice?.formatted ?? raw.price ?? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price),
    beds: Number(raw.bedrooms ?? raw.beds ?? home.bedrooms) || null,
    baths: Number(raw.bathrooms ?? raw.baths ?? home.bathrooms) || null,
    area: Number(raw.livingArea ?? raw.area ?? home.livingArea) || null,
    daysOnZillow: Number.isFinite(daysOnZillow) && daysOnZillow >= 0 ? daysOnZillow : null,
    homeType,
    statusText: raw.statusText ?? (homeType === "CONDO" ? "Condo for sale" : "Home for sale"),
    priceReduction: raw.priceReduction ?? null,
    broker: raw.broker?.name ?? raw.brokerName ?? null,
  };
}

async function refresh() {
  const response = await fetch(ACTOR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${APIFY_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      searchUrls: [{ url: searchUrl() }],
      extractionMethod: "PAGINATION",
      resultsLimit: 50,
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Apify returned ${response.status}`);
  const raw = await response.json();
  if (!Array.isArray(raw)) throw new Error("Apify returned an unexpected payload");

  const byId = new Map();
  for (const item of raw) {
    const listing = normalize(item);
    if (listing) byId.set(listing.id, listing);
  }
  const listings = [...byId.values()].sort((a, b) => b.price - a.price);
  if (!listings.length) throw new Error(`No validated ${CITY} listings returned; preserving last good snapshot`);

  const payload = {
    status: "ready",
    fetchedAt: new Date().toISOString(),
    filter: { city: CITY, state: STATE, maximumPrice: 500000, status: "for sale" },
    source: { name: "Zillow via Apify", url: `https://www.zillow.com/${ZILLOW_PATH}/` },
    listings,
  };
  await mkdir(dirname(DATA_PATH), { recursive: true });
  const temporaryPath = `${DATA_PATH}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(payload, null, 2) + "\n", { mode: 0o644 });
  await rename(temporaryPath, DATA_PATH);
  console.log(`[listings] wrote ${listings.length} validated homes at ${payload.fetchedAt}`);
}

async function hasSnapshot() {
  try {
    await readFile(DATA_PATH, "utf8");
    return true;
  } catch {
    return false;
  }
}

while (true) {
  try {
    await refresh();
  } catch (error) {
    const preserved = await hasSnapshot();
    console.error(`[listings] refresh failed; last snapshot ${preserved ? "preserved" : "unavailable"}:`, error instanceof Error ? error.message : error);
  }
  await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS));
}
