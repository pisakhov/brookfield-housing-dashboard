import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { DecisionDashboard } from "../decision-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "Buy-Now-versus-Wait Score", description: `A transparent ${config.city.name} synthesis of Zillow forecast direction, offer leverage, $500K reach, and monthly affordability stress.` };
}

export default function BuyNowVsWaitPage() {
  const { data } = getCurrentMarket();
  return <DecisionDashboard kind="wait" data={data} />;
}
