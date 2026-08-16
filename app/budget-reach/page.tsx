import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { DecisionDashboard } from "../decision-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "Under-$500K Budget Reach", description: `See how a $500K ceiling compares with ${config.city.name} bottom- and middle-tier Zillow Home Value Index observations.` };
}

export default function BudgetReachPage() {
  const { data } = getCurrentMarket();
  return <DecisionDashboard kind="budget" data={data} />;
}
