import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentMarket } from "@/lib/current-market";

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
    const { config } = getCurrentMarket();
    return NextResponse.json({
      status: "initializing",
      fetchedAt: null,
      filter: { city: config.city.name, state: config.city.state, maximumPrice: 500000, status: "for sale" },
      source: { name: "Zillow via Apify", url: `https://www.zillow.com/${config.zillowPath}/` },
      listings: [],
    }, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }
}
