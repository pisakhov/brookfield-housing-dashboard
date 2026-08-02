import type { Metadata } from "next";
import marketData from "./data/market-data.json";
import { MarketDashboard } from "./market-dashboard";

export const metadata: Metadata = { title: "Buyer/Seller Market Indicator", description: "A transparent Brookfield buyer-versus-seller market signal built from official Zillow Research and FRED/Freddie Mac observations." };

export default function Home() {
  return <MarketDashboard data={marketData} />;
}
