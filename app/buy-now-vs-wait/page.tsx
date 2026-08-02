import type { Metadata } from "next";
import marketData from "../data/market-data.json";
import { DecisionDashboard } from "../decision-dashboard";

export const metadata: Metadata = { title: "Buy-Now-versus-Wait Score", description: "A transparent synthesis of Zillow forecast direction, offer leverage, $500K reach, and monthly affordability stress." };

export default function BuyNowVsWaitPage() {
  return <DecisionDashboard kind="wait" data={marketData} />;
}
