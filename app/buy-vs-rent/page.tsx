import type { Metadata } from "next";
import marketData from "../data/market-data.json";
import { DecisionDashboard } from "../decision-dashboard";

export const metadata: Metadata = { title: "Buy-versus-Rent Hurdle", description: "Compare Bridgeport metro ownership payment and rent with Brookfield home values and the official Zillow forecast." };

export default function BuyVsRentPage() {
  return <DecisionDashboard kind="rent" data={marketData} />;
}
