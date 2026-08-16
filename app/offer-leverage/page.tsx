import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/current-market";
import { DecisionDashboard } from "../decision-dashboard";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return { title: "Offer Leverage Score", description: `${config.city.name} price cuts and ${config.countyProxy.name} sale-to-list and timing signals combined into a transparent buyer leverage score.` };
}

export default function OfferLeveragePage() {
  const { data } = getCurrentMarket();
  return <DecisionDashboard kind="offer" data={data} />;
}
