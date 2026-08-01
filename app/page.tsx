import marketData from "./data/market-data.json";
import { MarketDashboard } from "./market-dashboard";

export default function Home() {
  return <MarketDashboard data={marketData} />;
}
