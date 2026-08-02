export type MarketObservation = {
  date: string;
  inventory: number;
  newListings: number;
  countyDaysPending: number;
  mortgageRate: number;
};

export type PriceCutObservation = { date: string; share: number };
export type HomeValueObservation = { date: string; middle: number; bottom: number };
export type SaleToListObservation = { date: string; mean: number; median: number };
export type OwnershipObservation = {
  date: string;
  totalMonthlyPayment: number;
  incomeNeeded: number;
  zori: number;
  middleZhvi: number;
  mortgageRate: number;
};

export type MarketData = {
  schemaVersion: number;
  fetchedAt: string;
  geography: {
    city: { name: string; state: string; zillowRegionId: number };
    countyProxy: { name: string; state: string; zillowRegionId: number };
    metroProxy: { name: string; state: string; zillowRegionId: number };
  };
  sources: Record<string, string>;
  notes: Record<string, string>;
  series: {
    market: MarketObservation[];
    priceCuts: PriceCutObservation[];
    homeValues: HomeValueObservation[];
    saleToList: SaleToListObservation[];
    ownership: OwnershipObservation[];
  };
  forecast: {
    baseDate: string;
    observations: Array<{ date: string; growthPct: number }>;
  };
};

export function monthLabel(date: string, long = false) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function currency(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}
