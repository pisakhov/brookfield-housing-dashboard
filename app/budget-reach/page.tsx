import type { Metadata } from "next";
import marketData from "../data/market-data.json";
import { DecisionDashboard } from "../decision-dashboard";

export const metadata: Metadata = { title: "Under-$500K Budget Reach", description: "See how a $500K ceiling compares with Brookfield bottom- and middle-tier Zillow Home Value Index observations." };

export default function BudgetReachPage() {
  return <DecisionDashboard kind="budget" data={marketData} />;
}
