import type { Metadata } from "next";
import marketData from "../data/market-data.json";
import { DecisionDashboard } from "../decision-dashboard";

export const metadata: Metadata = { title: "True Monthly Affordability Stress", description: "A transparent housing cost stress score using Zillow total monthly payment and FRED/Freddie Mac mortgage-rate data." };

export default function AffordabilityStressPage() {
  return <DecisionDashboard kind="stress" data={marketData} />;
}
