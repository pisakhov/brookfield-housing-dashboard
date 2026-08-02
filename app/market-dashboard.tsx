"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, DownloadSimple, Info } from "@phosphor-icons/react";
import { LiveListings } from "@/components/live-listings";
import { SiteHeader } from "@/components/site-header";
import { scoreMarket, type MarketScore } from "@/lib/calculations";
import { monthLabel, type MarketData } from "@/lib/market-data";

const rangeOptions = [{ label: "3Y", months: 36 }, { label: "5Y", months: 60 }, { label: "All", months: Infinity }];

function marketLabel(score: number) {
  if (score >= 61) return "Seller's market";
  if (score <= 39) return "Buyer's market";
  return "Balanced market";
}

function MetricDelta({ value, suffix = "", inverted = false }: { value: number; suffix?: string; inverted?: boolean }) {
  const up = value > 0;
  const positive = inverted ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return <span className={positive ? "delta positive" : "delta negative"}><Icon size={13} weight="bold" /> {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MarketScore }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{monthLabel(point.date, true)}</strong>
      <div><span>Market balance</span><b>{point.score.toFixed(0)} / 100, {marketLabel(point.score)}</b></div>
      <div><span>30-year mortgage</span><b>{point.mortgageRate.toFixed(2)}%</b></div>
      <div><span>Inventory</span><b>{point.inventory} homes</b></div>
      <div><span>New listings</span><b>{point.newListings}</b></div>
      <div><span>Days to pending</span><b>{point.countyDaysPending} days</b></div>
    </div>
  );
}

export function MarketDashboard({ data }: { data: MarketData }) {
  const scored = useMemo(() => scoreMarket(data.series.market), [data.series.market]);
  const [range, setRange] = useState(Infinity);
  const visible = range === Infinity ? scored : scored.slice(-range);
  const latest = scored.at(-1)!;
  const priorYear = scored.find((point) => point.date === `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`);
  const scoreDelta = priorYear ? latest.score - priorYear.score : 0;
  const sellerExtreme = scored.reduce((strongest, point) => point.score > strongest.score ? point : strongest);
  const buyerExtreme = scored.reduce((strongest, point) => point.score < strongest.score ? point : strongest);

  function downloadCsv() {
    const header = "date,market_score,mortgage_rate,inventory,new_listings,stock_to_flow,inventory_yoy_pct,county_days_pending";
    const rows = scored.map((point) => [point.date, point.score.toFixed(1), point.mortgageRate.toFixed(3), point.inventory, point.newListings, point.stockFlow.toFixed(3), point.inventoryYoy.toFixed(1), point.countyDaysPending].join(","));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brookfield-market-balance.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <SiteHeader />
      <div className="shell" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">BUYER / SELLER MARKET INDICATOR | UPDATED {monthLabel(latest.date).toUpperCase()}</p>
            <h1>Who has the<br />upper hand?</h1>
            <p className="hero-copy">A transparent Brookfield market signal, with mortgage rates in the same view.</p>
          </div>
          <div className={`score-panel ${latest.score >= 61 ? "seller" : latest.score <= 39 ? "buyer" : "balanced"}`}>
            <div className="score-heading"><span>Current signal</span><Info size={17} /></div>
            <div className="score-row"><strong>{latest.score.toFixed(0)}</strong><span>/100</span></div>
            <h2>{marketLabel(latest.score)}</h2>
            <p>{scoreDelta >= 0 ? "More seller-favorable" : "More buyer-favorable"} than one year earlier.</p>
            <MetricDelta value={scoreDelta} suffix=" pts YoY" />
            <div className="scale" aria-label="Market scale from buyer to seller"><i /><i /><i /><span style={{ left: `${latest.score}%` }} /></div>
            <div className="scale-labels"><span>Buyer</span><span>Balanced</span><span>Seller</span></div>
          </div>
        </section>

        <section className="chart-section" aria-labelledby="history-title">
          <div className="section-heading">
            <div><h2 id="history-title">Market balance over time</h2><p>The custom local signal is shown against the monthly average 30-year fixed mortgage rate.</p></div>
            <div className="range-control" aria-label="Chart date range">{rangeOptions.map((option) => <button key={option.label} className={range === option.months ? "active" : ""} onClick={() => setRange(option.months)}>{option.label}</button>)}</div>
          </div>
          <div className="legend"><span><i className="legend-market" /> Market balance</span><span><i className="legend-rate" /> 30-year mortgage</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visible} margin={{ top: 16, right: 4, bottom: 2, left: 0 }}>
                <defs><linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#de6248" stopOpacity={0.24} /><stop offset="100%" stopColor="#de6248" stopOpacity={0.01} /></linearGradient></defs>
                <ReferenceArea yAxisId="market" y1={61} y2={100} fill="#de6248" fillOpacity={0.035} />
                <ReferenceArea yAxisId="market" y1={0} y2={39} fill="#167f82" fillOpacity={0.035} />
                <ReferenceLine yAxisId="market" x={sellerExtreme.date} stroke="#de6248" strokeOpacity={0.5} strokeDasharray="3 4" />
                <ReferenceLine yAxisId="market" x={buyerExtreme.date} stroke="#167f82" strokeOpacity={0.5} strokeDasharray="3 4" />
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" />
                <XAxis dataKey="date" ticks={visible.filter((point) => point.date.endsWith("-01")).map((point) => point.date)} tickFormatter={(value) => value.slice(0, 4)} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis yAxisId="market" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 9]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} width={38} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--text)", strokeOpacity: 0.2 }} />
                <Area yAxisId="market" type="monotone" dataKey="score" stroke="#de6248" strokeWidth={2.5} fill="url(#marketFill)" dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#de6248", stroke: "var(--surface)", strokeWidth: 2 }} />
                <Line yAxisId="rate" type="monotone" dataKey="mortgageRate" stroke="#167f82" strokeWidth={2.25} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#167f82", stroke: "var(--surface)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-axis-labels"><span>0 = buyer-favorable</span><span>100 = seller-favorable</span></div>
          <div className="extreme-strip" aria-label="Historical market extremes">
            <div className="extreme buyer-extreme"><span>Most buyer-favorable month</span><div><strong>{monthLabel(buyerExtreme.date, true)}</strong><b>{buyerExtreme.score.toFixed(0)}<small>/100</small></b></div><p>{buyerExtreme.inventory} homes for sale | {buyerExtreme.countyDaysPending} days to pending | {buyerExtreme.mortgageRate.toFixed(2)}% mortgage</p></div>
            <div className="extreme seller-extreme"><span>Most seller-favorable month</span><div><strong>{monthLabel(sellerExtreme.date, true)}</strong><b>{sellerExtreme.score.toFixed(0)}<small>/100</small></b></div><p>{sellerExtreme.inventory} homes for sale | {sellerExtreme.countyDaysPending} days to pending | {sellerExtreme.mortgageRate.toFixed(2)}% mortgage</p></div>
          </div>
          <p className="extreme-note">Extremes use complete scored history from {monthLabel(scored[0].date, true)} through {monthLabel(latest.date, true)}.</p>
        </section>

        <section className="metrics" aria-label="Latest market inputs">
          <article><span>For-sale inventory</span><strong>{latest.inventory}</strong><p>Brookfield homes</p><MetricDelta value={latest.inventoryYoy} suffix="% YoY" /></article>
          <article><span>New listings</span><strong>{latest.newListings}</strong><p>Brookfield, monthly</p>{priorYear && <MetricDelta value={(latest.newListings / priorYear.newListings - 1) * 100} suffix="% YoY" />}</article>
          <article><span>Median days to pending</span><strong>{latest.countyDaysPending}</strong><p>Fairfield County proxy</p>{priorYear && <MetricDelta value={latest.countyDaysPending - priorYear.countyDaysPending} suffix=" days YoY" inverted />}</article>
          <article><span>30-year mortgage</span><strong>{latest.mortgageRate.toFixed(2)}%</strong><p>U.S. monthly average</p>{priorYear && <MetricDelta value={latest.mortgageRate - priorYear.mortgageRate} suffix=" pts YoY" inverted />}</article>
        </section>

        <LiveListings />

        <section className="methodology" id="methodology">
          <div className="method-intro"><h2>Methodology you can audit</h2><p>This is our comparative indicator, not a Zillow-published index. The browser computes each monthly score from bundled raw observations.</p><button onClick={downloadCsv}><DownloadSimple size={18} weight="bold" /> Download scored CSV</button></div>
          <div className="formula">
            <div className="formula-line"><span>Market balance</span><strong>45% supply pressure + 30% inventory scarcity + 25% market velocity</strong></div>
            <ol><li><b>Supply pressure, 45%.</b> Brookfield active inventory divided by new listings. Lower is more seller-favorable.</li><li><b>Inventory scarcity, 30%.</b> Brookfield inventory's 12-month percentage change. Faster contraction is more seller-favorable.</li><li><b>Market velocity, 25%.</b> Fairfield County median days to pending. Fewer days is more seller-favorable.</li><li><b>Normalization.</b> Each input becomes a percentile rank across complete months since January 2020, with direction reversed where needed.</li></ol>
            <div className="thresholds"><span><b>0-39</b> Buyer</span><span><b>40-60</b> Balanced</span><span><b>61-100</b> Seller</span></div>
          </div>
        </section>

        <section className="sources">
          <h2>Sources, freshness, and limitations</h2>
          <div className="source-grid">
            <div><b>Brookfield inventory</b><p>Official Zillow Research smoothed monthly for-sale inventory for Brookfield city. Zillow publishes the observation, not this custom score.</p><a href={data.sources.inventory} target="_blank" rel="noreferrer">Open official inventory CSV</a></div>
            <div><b>Brookfield new listings</b><p>Official Zillow Research smoothed monthly new-listing count for Brookfield city.</p><a href={data.sources.newListings} target="_blank" rel="noreferrer">Open official new-listings CSV</a></div>
            <div><b>Fairfield County proxy</b><p>Median days to pending uses Fairfield County because Brookfield city history is not sufficiently published. County conditions can differ from Brookfield.</p><a href={data.sources.daysPending} target="_blank" rel="noreferrer">Open official days CSV</a></div>
            <div><b>FRED / Freddie Mac</b><p>Weekly U.S. 30-year fixed mortgage rate, averaged by calendar month. It is national context, not a quote for any borrower.</p><a href="https://fred.stlouisfed.org/series/MORTGAGE30US" target="_blank" rel="noreferrer">Open official FRED series</a></div>
            <div><b>Interpret with care</b><p>Brookfield is a small market, monthly inputs can move sharply, and percentile scores are relative to this history. This is decision support, not an appraisal or forecast.</p><a href="https://www.zillow.com/research/data/" target="_blank" rel="noreferrer">Review Zillow Research definitions</a></div>
          </div>
          <p className="refresh-note">Raw snapshot checked {new Date(data.fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}. Complete score inputs run through {monthLabel(latest.date, true)}.</p>
        </section>
      </div>
      <footer><span>Brookfield Buyer Decision Suite</span><a href="#methodology">Review this method</a></footer>
    </main>
  );
}
