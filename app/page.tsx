import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { MarketDashboard } from "./market-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "Buyer/Seller Market Indicator", description: `A transparent ${config.city.name} buyer-versus-seller market signal built from official Zillow Research and FRED/Freddie Mac observations.` };
}

export default function Home() {
  const { data } = getCurrentMarket();
  return <MarketDashboard data={data} />;
}
