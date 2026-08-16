import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { DecisionDashboard } from "../decision-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "Buy-versus-Rent Hurdle", description: `Compare ${config.metroProxy.name} ownership payment and rent with ${config.city.name} home values and the official Zillow forecast.` };
}

export default function BuyVsRentPage() {
  const { data } = getCurrentMarket();
  return <DecisionDashboard kind="rent" data={data} />;
}
