import type { Metadata } from "next";
import marketData from "../data/market-data.json";
import { DecisionDashboard } from "../decision-dashboard";

export const metadata: Metadata = { title: "Offer Leverage Score", description: "Brookfield price cuts and Fairfield County sale-to-list and timing signals combined into a transparent buyer leverage score." };

export default function OfferLeveragePage() {
  return <DecisionDashboard kind="offer" data={marketData} />;
}
