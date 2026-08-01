import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataPath = process.env.LISTINGS_DATA_PATH || "/data/listings.json";

export async function GET() {
  try {
    const payload = JSON.parse(await readFile(dataPath, "utf8"));
    return NextResponse.json(payload, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({
      status: "initializing",
      fetchedAt: null,
      filter: { city: "Brookfield", state: "CT", maximumPrice: 500000, status: "for sale" },
      source: { name: "Zillow via Apify", url: "https://www.zillow.com/brookfield-ct/" },
      listings: [],
    }, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }
}
