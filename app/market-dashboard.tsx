"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowSquareOut, ArrowUp, Clock, DownloadSimple, Info, MapPin, TrendUp } from "@phosphor-icons/react";

type Observation = {
  date: string;
  inventory: number;
  newListings: number;
  countyDaysPending: number;
  mortgageRate: number;
};

type MarketData = {
  fetchedAt: string;
  geography: { city: string; county: string; state: string; zillowRegionId: number };
  sources: Record<string, string>;
  notes: Record<string, string>;
  observations: Observation[];
};

type ScoredObservation = Observation & {
  stockFlow: number;
  inventoryYoy: number;
  supplyScore: number;
  scarcityScore: number;
  velocityScore: number;
  marketScore: number;
};

type Listing = {
  id: string;
  url: string;
  image: string | null;
  address: string;
  price: number;
  priceFormatted: string;
  beds: number | null;
  baths: number | null;
  area: number | null;
  daysOnZillow: number | null;
  homeType: string;
  statusText: string;
  priceReduction: string | null;
  broker: string | null;
};

type ListingsPayload = {
  status: "ready" | "initializing";
  fetchedAt: string | null;
  listings: Listing[];
};

const rangeOptions = [
  { label: "3Y", months: 36 },
  { label: "5Y", months: 60 },
  { label: "All", months: Infinity },
];

function percentileRank(values: number[], value: number) {
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return values.length <= 1 ? 0.5 : (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
}

function scoreObservations(raw: Observation[]): ScoredObservation[] {
  const enriched = raw.map((point, index) => {
    const lag = raw[index - 12];
    return {
      ...point,
      stockFlow: point.inventory / Math.max(point.newListings, 1),
      inventoryYoy: lag ? (point.inventory / lag.inventory - 1) * 100 : Number.NaN,
    };
  }).filter((point) => point.date >= "2020-01" && Number.isFinite(point.inventoryYoy));

  const stockFlowValues = enriched.map((point) => point.stockFlow);
  const yoyValues = enriched.map((point) => point.inventoryYoy);
  const daysValues = enriched.map((point) => point.countyDaysPending);

  return enriched.map((point) => {
    const supplyScore = 100 * (1 - percentileRank(stockFlowValues, point.stockFlow));
    const scarcityScore = 100 * (1 - percentileRank(yoyValues, point.inventoryYoy));
    const velocityScore = 100 * (1 - percentileRank(daysValues, point.countyDaysPending));
    return {
      ...point,
      supplyScore,
      scarcityScore,
      velocityScore,
      marketScore: 0.45 * supplyScore + 0.30 * scarcityScore + 0.25 * velocityScore,
    };
  });
}

function marketLabel(score: number) {
  if (score >= 61) return "Seller's market";
  if (score <= 39) return "Buyer's market";
  return "Balanced market";
}

function monthLabel(date: string, long = false) {
  const [year, month] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function MetricDelta({ value, suffix = "", inverted = false }: { value: number; suffix?: string; inverted?: boolean }) {
  const up = value > 0;
  const positive = inverted ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={positive ? "delta positive" : "delta negative"}>
      <Icon size={13} weight="bold" /> {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScoredObservation }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{monthLabel(point.date, true)}</strong>
      <div><span>Market balance</span><b>{point.marketScore.toFixed(0)} · {marketLabel(point.marketScore)}</b></div>
      <div><span>30-year mortgage</span><b>{point.mortgageRate.toFixed(2)}%</b></div>
      <div><span>Inventory</span><b>{point.inventory} homes</b></div>
      <div><span>New listings</span><b>{point.newListings}</b></div>
      <div><span>Days to pending</span><b>{point.countyDaysPending} days</b></div>
    </div>
  );
}

export function MarketDashboard({ data }: { data: MarketData }) {
  const scored = useMemo(() => scoreObservations(data.observations), [data.observations]);
  const [range, setRange] = useState(60);
  const [listings, setListings] = useState<ListingsPayload | null>(null);
  const [listingsError, setListingsError] = useState(false);
  const visible = range === Infinity ? scored : scored.slice(-range);
  const latest = scored.at(-1)!;
  const priorYear = scored.find((point) => point.date === `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`);
  const scoreDelta = priorYear ? latest.marketScore - priorYear.marketScore : 0;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/listings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Listings returned ${response.status}`);
        const payload = await response.json() as ListingsPayload;
        if (active) {
          setListings(payload);
          setListingsError(false);
        }
      } catch {
        if (active) setListingsError(true);
      }
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function downloadCsv() {
    const header = "date,market_score,mortgage_rate,inventory,new_listings,stock_to_flow,inventory_yoy_pct,county_days_pending";
    const rows = scored.map((p) => [p.date, p.marketScore.toFixed(1), p.mortgageRate.toFixed(3), p.inventory, p.newListings, p.stockFlow.toFixed(3), p.inventoryYoy.toFixed(1), p.countyDaysPending].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brookfield-market-balance.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Brookfield Market Balance home">
          <span className="brand-mark"><TrendUp size={18} weight="bold" /></span>
          <span>Market Balance</span>
        </a>
        <div className="location"><MapPin size={16} weight="fill" /> Brookfield, CT</div>
      </header>

      <div className="shell" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">LOCAL HOUSING SIGNAL · UPDATED {monthLabel(latest.date).toUpperCase()}</p>
            <h1>Who has the<br />upper hand?</h1>
            <p className="hero-copy">A transparent read on Brookfield housing conditions, with mortgage rates in the same view.</p>
          </div>
          <div className={`score-panel ${latest.marketScore >= 61 ? "seller" : latest.marketScore <= 39 ? "buyer" : "balanced"}`}>
            <div className="score-heading"><span>Current signal</span><Info size={17} /></div>
            <div className="score-row"><strong>{latest.marketScore.toFixed(0)}</strong><span>/100</span></div>
            <h2>{marketLabel(latest.marketScore)}</h2>
            <p>{scoreDelta >= 0 ? "More seller-favorable" : "More buyer-favorable"} than one year earlier.</p>
            <MetricDelta value={scoreDelta} suffix=" pts YoY" />
            <div className="scale" aria-label="Market scale from buyer to seller"><i /><i /><i /><span style={{ left: `${latest.marketScore}%` }} /></div>
            <div className="scale-labels"><span>Buyer</span><span>Balanced</span><span>Seller</span></div>
          </div>
        </section>

        <section className="chart-section" aria-labelledby="history-title">
          <div className="section-heading">
            <div>
              <h2 id="history-title">Market balance over time</h2>
              <p>The composite local signal is shown against the monthly average 30-year fixed mortgage rate.</p>
            </div>
            <div className="range-control" aria-label="Chart date range">
              {rangeOptions.map((option) => <button key={option.label} className={range === option.months ? "active" : ""} onClick={() => setRange(option.months)}>{option.label}</button>)}
            </div>
          </div>
          <div className="legend"><span><i className="legend-market" /> Market balance</span><span><i className="legend-rate" /> 30-year mortgage</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visible} margin={{ top: 16, right: 4, bottom: 2, left: 0 }}>
                <defs>
                  <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#de6248" stopOpacity={0.24} /><stop offset="100%" stopColor="#de6248" stopOpacity={0.01} /></linearGradient>
                </defs>
                <ReferenceArea y1={61} y2={100} fill="#de6248" fillOpacity={0.035} />
                <ReferenceArea y1={0} y2={39} fill="#167f82" fillOpacity={0.035} />
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" />
                <XAxis dataKey="date" ticks={visible.filter((point) => point.date.endsWith("-01")).map((point) => point.date)} tickFormatter={(value) => value.slice(0, 4)} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis yAxisId="market" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 9]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} width={38} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--text)", strokeOpacity: 0.2 }} />
                <Area yAxisId="market" type="monotone" dataKey="marketScore" stroke="#de6248" strokeWidth={2.5} fill="url(#marketFill)" dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#de6248", stroke: "var(--surface)", strokeWidth: 2 }} />
                <Line yAxisId="rate" type="monotone" dataKey="mortgageRate" stroke="#167f82" strokeWidth={2.25} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#167f82", stroke: "var(--surface)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-axis-labels"><span>0 = buyer-favorable</span><span>100 = seller-favorable</span></div>
        </section>

        <section className="metrics" aria-label="Latest market inputs">
          <article>
            <span>For-sale inventory</span>
            <strong>{latest.inventory}</strong>
            <p>Brookfield homes</p>
            <MetricDelta value={latest.inventoryYoy} suffix="% YoY" />
          </article>
          <article>
            <span>New listings</span>
            <strong>{latest.newListings}</strong>
            <p>Brookfield, monthly</p>
            {priorYear && <MetricDelta value={(latest.newListings / priorYear.newListings - 1) * 100} suffix="% YoY" />}
          </article>
          <article>
            <span>Median days to pending</span>
            <strong>{latest.countyDaysPending}</strong>
            <p>Fairfield County proxy</p>
            {priorYear && <MetricDelta value={latest.countyDaysPending - priorYear.countyDaysPending} suffix=" days YoY" inverted />}
          </article>
          <article>
            <span>30-year mortgage</span>
            <strong>{latest.mortgageRate.toFixed(2)}%</strong>
            <p>Monthly average</p>
            {priorYear && <MetricDelta value={latest.mortgageRate - priorYear.mortgageRate} suffix=" pts YoY" inverted />}
          </article>
        </section>

        <section className="listings-section" aria-labelledby="listings-title">
          <div className="listings-heading">
            <div>
              <h2 id="listings-title">Homes under $500K right now</h2>
              <p>Active Brookfield listings, refreshed every 48 hours and linked to their Zillow source.</p>
            </div>
            {listings?.status === "ready" && <div className="listings-freshness"><Clock size={15} /> Checked {new Date(listings.fetchedAt!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>}
          </div>

          {!listings && !listingsError && <div className="listing-skeletons" aria-label="Loading current listings"><i /><i /><i /></div>}
          {(listingsError || listings?.status === "initializing") && <div className="listings-empty"><strong>{listingsError ? "Current listings are temporarily unavailable." : "The first listing refresh is running."}</strong><p>The market dashboard remains available. The previous good snapshot will be retained after future refresh failures.</p></div>}
          {listings?.status === "ready" && listings.listings.length > 0 && (
            <>
              <div className="listing-count"><strong>{listings.listings.length}</strong> matching homes found</div>
              <div className="listing-grid">
                {listings.listings.map((listing) => (
                  <a className="listing-card" href={listing.url} target="_blank" rel="noopener noreferrer" key={listing.id}>
                    <div className="listing-image">
                      {listing.image ? <img src={listing.image} alt={`Listing at ${listing.address}`} loading="lazy" referrerPolicy="no-referrer" /> : <span>Photo unavailable</span>}
                      <em>{listing.statusText}</em>
                    </div>
                    <div className="listing-body">
                      <div className="listing-price"><strong>{listing.priceFormatted}</strong><ArrowSquareOut size={18} /></div>
                      <p>{listing.address}</p>
                      <div className="listing-facts">
                        {listing.beds != null && <span><b>{listing.beds}</b> bd</span>}
                        {listing.baths != null && <span><b>{listing.baths}</b> ba</span>}
                        {listing.area != null && <span><b>{listing.area.toLocaleString()}</b> sq ft</span>}
                      </div>
                      <div className="listing-meta"><span>{listing.daysOnZillow == null ? "New listing" : `${listing.daysOnZillow} ${listing.daysOnZillow === 1 ? "day" : "days"} on Zillow`}</span><span>{listing.broker || "Broker listed"}</span></div>
                    </div>
                  </a>
                ))}
              </div>
              <p className="listing-disclaimer">Listings are collected from publicly visible Zillow search results through Apify. Availability, price, details, and photos can change; verify everything on the linked source before acting. Zillow and listing photos belong to their respective owners.</p>
            </>
          )}
        </section>

        <section className="methodology" id="methodology">
          <div className="method-intro">
            <h2>Methodology you can audit</h2>
            <p>This is a comparative indicator, not a Zillow-published index. The browser computes every monthly score from the raw observations bundled with this app.</p>
            <button onClick={downloadCsv}><DownloadSimple size={18} weight="bold" /> Download scored CSV</button>
          </div>
          <div className="formula">
            <div className="formula-line"><span>Market balance</span><strong>45% supply pressure + 30% inventory scarcity + 25% market velocity</strong></div>
            <ol>
              <li><b>Supply pressure, 45%.</b> Brookfield active inventory divided by new listings. A lower stock-to-flow ratio is more seller-favorable.</li>
              <li><b>Inventory scarcity, 30%.</b> Brookfield inventory's 12-month percentage change. Faster contraction is more seller-favorable.</li>
              <li><b>Market velocity, 25%.</b> Fairfield County median days to pending. Fewer days is more seller-favorable.</li>
              <li><b>Normalization.</b> Each input is converted to its percentile rank across complete monthly observations since January 2020, reversed where lower means stronger seller conditions, then weighted.</li>
            </ol>
            <div className="thresholds"><span><b>0–39</b> Buyer</span><span><b>40–60</b> Balanced</span><span><b>61–100</b> Seller</span></div>
          </div>
        </section>

        <section className="sources">
          <h2>Sources and limitations</h2>
          <div className="source-grid">
            <div><b>Zillow Research</b><p>Smoothed monthly inventory and new-listing series for Brookfield, plus county days to pending.</p><a href="https://www.zillow.com/research/data/" target="_blank" rel="noreferrer">Open Zillow data</a></div>
            <div><b>FRED / Freddie Mac</b><p>Weekly U.S. 30-year fixed mortgage rate, averaged by calendar month in the data refresh script.</p><a href="https://fred.stlouisfed.org/series/MORTGAGE30US" target="_blank" rel="noreferrer">Open FRED series</a></div>
            <div><b>Current Zillow listings via Apify</b><p>A hosted Zillow search scraper refreshes active Brookfield homes under $500K every 48 hours. The last valid snapshot survives failed refreshes.</p><a href="https://apify.com/maxcopell/zillow-scraper" target="_blank" rel="noreferrer">Review the scraper</a></div>
            <div><b>Important context</b><p>Brookfield's small sample can be volatile. Zillow suppresses most city-level days-to-pending history, so Fairfield County is the disclosed velocity proxy. Listings are unofficial scraped results and must be verified at source. This is decision support, not an appraisal or forecast.</p></div>
          </div>
          <p className="refresh-note">Raw snapshot refreshed {new Date(data.fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}. Common observations run through {monthLabel(latest.date, true)}.</p>
        </section>
      </div>
      <footer><span>Brookfield Market Balance</span><a href="#methodology">Review the method</a></footer>
    </main>
  );
}
