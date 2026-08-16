import brookfieldJson from "@/app/data/market-data.json";
import forecastVintagesJson from "@/app/data/forecast-vintages.json";
import ridgefieldJson from "@/app/data/ridgefield-market-data.json";
import markets from "@/config/markets.json";
import type { MarketData } from "@/lib/market-data";

export type MarketSlug = keyof typeof markets;

export function currentMarketSlug(): MarketSlug {
  const value = (process.env.MARKET_TOWN || "brookfield").toLowerCase();
  if (!(value in markets)) throw new Error(`Unsupported MARKET_TOWN: ${value}`);
  return value as MarketSlug;
}

export function getCurrentMarket() {
  const slug = currentMarketSlug();
  const raw = slug === "ridgefield" ? ridgefieldJson : brookfieldJson;
  const data = { ...raw, forecastHistory: forecastVintagesJson.vintages } as MarketData;
  return { slug, config: markets[slug], data };
}
