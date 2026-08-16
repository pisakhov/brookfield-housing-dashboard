import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { DecisionDashboard } from "../decision-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "True Monthly Affordability Stress", description: `A transparent ${config.city.name} housing cost stress score using Zillow total monthly payment and FRED/Freddie Mac mortgage-rate data.` };
}

export default function AffordabilityStressPage() {
  const { data } = getCurrentMarket();
  return <DecisionDashboard kind="stress" data={data} />;
}
