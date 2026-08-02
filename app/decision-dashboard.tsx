"use client";

import { useMemo } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowSquareOut, Info } from "@phosphor-icons/react";
import { LiveListings } from "@/components/live-listings";
import { SiteHeader } from "@/components/site-header";
import { scoreAffordabilityStress, scoreBand, scoreBudgetReach, scoreBuyNowWait, scoreBuyRentHurdle, scoreOfferLeverage } from "@/lib/calculations";
import { currency, monthLabel, type MarketData } from "@/lib/market-data";

export type DecisionKind = "offer" | "budget" | "stress" | "rent" | "wait";

type TrendPoint = { date: string; score: number; context: number };

function ScorePanel({ score, label, description, low, middle, high }: { score: number; label: string; description: string; low: string; middle: string; high: string }) {
  return (
    <div className="score-panel decision-score">
      <div className="score-heading"><span>Current custom score</span><Info size={17} /></div>
      <div className="score-row"><strong>{score.toFixed(0)}</strong><span>/100</span></div>
      <h2>{label}</h2>
      <p>{description}</p>
      <div className="scale"><i /><i /><i /><span style={{ left: `${score}%` }} /></div>
      <div className="scale-labels"><span>{low}</span><span>{middle}</span><span>{high}</span></div>
      <small className="score-disclaimer">Calculated by this dashboard. Zillow does not publish this score.</small>
    </div>
  );
}

function TrendTooltip({ active, payload, contextLabel, contextFormat }: { active?: boolean; payload?: Array<{ payload: TrendPoint }>; contextLabel: string; contextFormat: (value: number) => string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><strong>{monthLabel(point.date, true)}</strong><div><span>Custom score</span><b>{point.score.toFixed(0)} / 100</b></div><div><span>{contextLabel}</span><b>{contextFormat(point.context)}</b></div></div>;
}

function ScoreTrend({ title, description, data, contextLabel, contextFormat, contextDomain }: { title: string; description: string; data: TrendPoint[]; contextLabel: string; contextFormat: (value: number) => string; contextDomain?: [number, number] }) {
  return (
    <section className="chart-section decision-chart" aria-labelledby="decision-history-title">
      <div className="section-heading"><div><h2 id="decision-history-title">{title}</h2><p>{description}</p></div></div>
      <div className="legend"><span><i className="legend-market" /> Custom score</span><span><i className="legend-rate" /> {contextLabel}</span></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 4, bottom: 2, left: 0 }}>
            <defs><linearGradient id="decisionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#de6248" stopOpacity={0.22} /><stop offset="100%" stopColor="#de6248" stopOpacity={0.01} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" />
            <XAxis dataKey="date" ticks={data.filter((point) => point.date.endsWith("-01")).map((point) => point.date)} tickFormatter={(value) => value.slice(0, 4)} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis yAxisId="score" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis yAxisId="context" orientation="right" domain={contextDomain || ["auto", "auto"]} tickFormatter={contextFormat} axisLine={false} tickLine={false} width={56} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip content={<TrendTooltip contextLabel={contextLabel} contextFormat={contextFormat} />} cursor={{ stroke: "var(--text)", strokeOpacity: 0.2 }} />
            <Area yAxisId="score" type="monotone" dataKey="score" stroke="#de6248" strokeWidth={2.5} fill="url(#decisionFill)" dot={false} isAnimationActive={false} />
            <Line yAxisId="context" type="monotone" dataKey="context" stroke="#167f82" strokeWidth={2.25} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-axis-labels"><span>0 = less of this signal</span><span>100 = more of this signal</span></div>
    </section>
  );
}

function Metrics({ items }: { items: Array<{ label: string; value: string; note: string }> }) {
  return <section className={`metrics decision-metrics metrics-${items.length}`} aria-label="Latest indicator inputs">{items.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.note}</p></article>)}</section>;
}

function MethodSources({ formula, steps, bands, sourceItems, freshness }: {
  formula: string;
  steps: Array<{ name: string; text: string }>;
  bands: Array<{ range: string; label: string }>;
  sourceItems: Array<{ title: string; text: string; url?: string; link?: string }>;
  freshness: string;
}) {
  return (
    <>
      <section className="methodology" id="methodology">
        <div className="method-intro"><h2>Methodology you can audit</h2><p>Transparent weights and fixed directionality turn official source observations into a decision aid. It is not an appraisal, underwriting result, or Zillow score.</p></div>
        <div className="formula">
          <div className="formula-line"><span>Calculation</span><strong>{formula}</strong></div>
          <ol>{steps.map((step) => <li key={step.name}><b>{step.name}</b> {step.text}</li>)}</ol>
          <div className="thresholds">{bands.map((band) => <span key={band.range}><b>{band.range}</b>{band.label}</span>)}</div>
        </div>
      </section>
      <section className="sources">
        <h2>Sources, geography, and limitations</h2>
        <div className="source-grid">{sourceItems.map((item) => <div key={item.title}><b>{item.title}</b><p>{item.text}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer">{item.link || "Open official source"} <ArrowSquareOut size={13} /></a>}</div>)}</div>
        <p className="refresh-note">{freshness}</p>
      </section>
    </>
  );
}

function PageFrame({ title, eyebrow, copy, score, label, description, scale, children, footerLabel }: {
  title: string; eyebrow: string; copy: string; score: number; label: string; description: string; scale: [string, string, string]; children: React.ReactNode; footerLabel: string;
}) {
  return (
    <main><SiteHeader /><div className="shell"><section className="hero decision-hero"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="hero-copy">{copy}</p></div><ScorePanel score={score} label={label} description={description} low={scale[0]} middle={scale[1]} high={scale[2]} /></section>{children}</div><footer><span>Brookfield Buyer Decision Suite</span><a href="#methodology">Review {footerLabel}</a></footer></main>
  );
}

function OfferPage({ data }: { data: MarketData }) {
  const scored = useMemo(() => scoreOfferLeverage(data), [data]);
  const latest = scored.at(-1)!;
  const trend = scored.map((point) => ({ date: point.date, score: point.score, context: point.priceCutShare * 100 }));
  return (
    <PageFrame title="How much can an offer push?" eyebrow={`OFFER LEVERAGE SCORE | UPDATED ${monthLabel(latest.date).toUpperCase()}`} copy="Price cuts, closing ratios, and market pace distilled into one negotiation signal." score={latest.score} label={scoreBand(latest.score, "Limited leverage", "Mixed leverage", "Meaningful leverage")} description="Higher scores indicate conditions that offer buyers more room to negotiate." scale={["Limited", "Mixed", "Stronger"]} footerLabel="the leverage method">
      <ScoreTrend title="Buyer leverage through time" description="The score uses only months where every city and county input is present." data={trend} contextLabel="Brookfield price-cut share" contextFormat={(value) => `${value.toFixed(0)}%`} contextDomain={[0, 35]} />
      <Metrics items={[
        { label: "Listings with a price cut", value: `${(latest.priceCutShare * 100).toFixed(1)}%`, note: "Brookfield city" },
        { label: "Mean sale-to-list", value: `${(latest.meanSaleToList * 100).toFixed(1)}%`, note: "Fairfield County proxy" },
        { label: "Median sale-to-list", value: `${(latest.medianSaleToList * 100).toFixed(1)}%`, note: "Fairfield County proxy" },
        { label: "Days to pending", value: `${latest.daysPending}`, note: "Fairfield County proxy" },
      ]} />
      <MethodSources formula="40% price-cut share + 25% mean sale-to-list + 20% median sale-to-list + 15% days to pending" steps={[
        { name: "Price cuts, 40%.", text: "A higher Brookfield share ranks as more buyer leverage." },
        { name: "Closing ratios, 45% total.", text: "Lower Fairfield County mean and median sale-to-final-list ratios rank as more leverage." },
        { name: "Time, 15%.", text: "More county days to pending ranks as more leverage." },
        { name: "Normalization.", text: "Each input is percentile-ranked across complete monthly observations since January 2020. Scores compare the current market with its own recent history." },
      ]} bands={[{ range: "0-39", label: "Limited" }, { range: "40-60", label: "Mixed" }, { range: "61-100", label: "Meaningful" }]} sourceItems={[
        { title: "Brookfield price cuts", text: "Official Zillow Research city share of listings with a price cut. Small-city counts can make this series volatile.", url: data.sources.priceCuts, link: "Open official city CSV" },
        { title: "Fairfield County mean sale-to-list", text: "The official county mean ratio is a disclosed proxy and can differ from Brookfield transactions.", url: data.sources.saleToListMean, link: "Open official mean CSV" },
        { title: "Fairfield County median sale-to-list", text: "The official county median ratio provides a less outlier-sensitive closing reference.", url: data.sources.saleToListMedian, link: "Open official median CSV" },
        { title: "Fairfield County timing", text: "County median days to pending is used because Brookfield city history lacks sufficient coverage.", url: data.sources.daysPending, link: "Open official timing CSV" },
        { title: "Interpretation", text: "A higher score supports asking for concessions or a price discussion. It does not estimate the discount on a specific property." },
      ]} freshness={`Data checked ${new Date(data.fetchedAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}. The latest complete cross-series month is ${monthLabel(latest.date, true)}.`} />
    </PageFrame>
  );
}

function BudgetPage({ data }: { data: MarketData }) {
  const scored = useMemo(() => scoreBudgetReach(data.series.homeValues), [data.series.homeValues]);
  const latest = scored.at(-1)!;
  const trend = scored.map((point) => ({ date: point.date, score: point.score, context: point.bottom }));
  return (
    <PageFrame title="What does $500K reach?" eyebrow={`UNDER-$500K BUDGET REACH | UPDATED ${monthLabel(latest.date).toUpperCase()}`} copy="A fixed-budget view of Brookfield's bottom and middle home-value tiers, plus live options." score={latest.score} label={scoreBand(latest.score, "Narrow reach", "Selective reach", "Broader reach")} description="Higher scores mean a $500K ceiling reaches further into Zillow's city value tiers." scale={["Narrow", "Selective", "Broader"]} footerLabel="the budget method">
      <ScoreTrend title="$500K reach through time" description="A fixed $500K ceiling is compared with Brookfield city ZHVI tiers; it is not a listing-price distribution." data={trend} contextLabel="Bottom-tier ZHVI" contextFormat={(value) => currency(value, true)} />
      <Metrics items={[
        { label: "Bottom-tier ZHVI", value: currency(latest.bottom), note: "Brookfield 5th-35th percentile" },
        { label: "Budget headroom", value: currency(500_000 - latest.bottom), note: "Against bottom-tier ZHVI" },
        { label: "Middle-tier ZHVI", value: currency(latest.middle), note: "Brookfield 35th-65th percentile" },
        { label: "Budget vs middle tier", value: `${((500_000 / latest.middle) * 100).toFixed(0)}%`, note: "Value-index ratio, not inventory share" },
      ]} />
      <LiveListings compact />
      <MethodSources formula="60% bottom-tier reach + 40% middle-tier reach, measured against a fixed $500K ceiling" steps={[
        { name: "Bottom-tier reach, 60%.", text: "The component runs from 0 when $500K is 75% or less of bottom-tier ZHVI to 100 when it is 125% or more." },
        { name: "Middle-tier reach, 40%.", text: "The component runs from 0 when $500K is 65% or less of middle-tier ZHVI to 100 when it is 115% or more." },
        { name: "Fixed anchors.", text: "Clamped linear ranges keep the calculation interpretable and prevent extreme values from creating false precision." },
        { name: "Live listings.", text: "Current under-$500K cards are useful evidence but do not enter the official-data score." },
      ]} bands={[{ range: "0-39", label: "Narrow" }, { range: "40-60", label: "Selective" }, { range: "61-100", label: "Broader" }]} sourceItems={[
        { title: "Brookfield bottom-tier ZHVI", text: "Official Zillow Research typical value for homes in roughly the 5th-35th percentile. ZHVI is not a count of homes available below $500K.", url: data.sources.zhviBottom, link: "Open official bottom-tier CSV" },
        { title: "Brookfield middle-tier ZHVI", text: "Official Zillow Research typical value for the 35th-65th percentile. Both value series have direct Brookfield city coverage.", url: data.sources.zhviMiddle, link: "Open official middle-tier CSV" },
        { title: "Live listing distinction", text: "Cards come from a separate 48-hour Zillow search snapshot via Apify. They are not Zillow Research data and are excluded from the score." },
        { title: "Interpretation", text: "The score describes budget position against value tiers, not home quality, closing costs, taxes, condition, or the probability of winning an offer." },
      ]} freshness={`Official ZHVI data checked ${new Date(data.fetchedAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })} and current through ${monthLabel(latest.date, true)}. Live listing freshness appears above the cards.`} />
    </PageFrame>
  );
}

function StressPage({ data }: { data: MarketData }) {
  const scored = useMemo(() => scoreAffordabilityStress(data.series.ownership), [data.series.ownership]);
  const latest = scored.at(-1)!;
  const trend = scored.map((point) => ({ date: point.date, score: point.score, context: point.totalMonthlyPayment }));
  return (
    <PageFrame title="How hard is the monthly carry?" eyebrow={`TRUE MONTHLY AFFORDABILITY STRESS | UPDATED ${monthLabel(latest.date).toUpperCase()}`} copy="Mortgage, tax, insurance, maintenance, and recent payment acceleration in one stress signal." score={latest.score} label={scoreBand(latest.score, "Lower stress", "Elevated stress", "High stress")} description="Higher scores mean the metro ownership cost is more strained versus post-2020 history." scale={["Lower", "Elevated", "High"]} footerLabel="the stress method">
      <ScoreTrend title="Ownership stress through time" description="Zillow's total payment includes more than principal and interest; the score adds payment growth and the national mortgage-rate backdrop." data={trend} contextLabel="Total monthly payment" contextFormat={(value) => currency(value, true)} />
      <Metrics items={[
        { label: "Total monthly payment", value: currency(latest.totalMonthlyPayment), note: "Bridgeport metro, 20% down" },
        { label: "Income needed", value: currency(latest.incomeNeeded), note: "Annual income at under 30% burden" },
        { label: "Payment change", value: `${latest.paymentYoy >= 0 ? "+" : ""}${latest.paymentYoy.toFixed(1)}%`, note: "12-month change" },
        { label: "30-year mortgage", value: `${latest.mortgageRate.toFixed(2)}%`, note: "U.S. monthly average" },
      ]} />
      <MethodSources formula="45% total-payment level + 30% 12-month payment growth + 25% mortgage-rate level" steps={[
        { name: "Payment level, 45%.", text: "Higher Zillow total monthly payment ranks as more stress." },
        { name: "Payment acceleration, 30%.", text: "Faster 12-month growth in total payment ranks as more stress." },
        { name: "Mortgage backdrop, 25%.", text: "A higher FRED/Freddie Mac monthly average ranks as more stress." },
        { name: "Normalization.", text: "Inputs are percentile-ranked across complete monthly observations since January 2020. Income needed is shown as an auditable output, not double-counted in the score." },
      ]} bands={[{ range: "0-39", label: "Lower" }, { range: "40-60", label: "Elevated" }, { range: "61-100", label: "High" }]} sourceItems={[
        { title: "Zillow total monthly payment", text: "Official Bridgeport metro estimate for a typical middle-tier home with 20% down. It includes mortgage, region-specific tax and insurance estimates, and maintenance equal to 0.5% of value.", url: data.sources.totalMonthlyPayment, link: "Open official payment CSV" },
        { title: "Zillow income needed", text: "Official Bridgeport metro annual income required to keep the same total payment below 30% of monthly income.", url: data.sources.incomeNeeded, link: "Open official income CSV" },
        { title: "FRED / Freddie Mac", text: "Official national weekly 30-year fixed rate, averaged by month here. It is not a personal quote.", url: "https://fred.stlouisfed.org/series/MORTGAGE30US", link: "Open official FRED series" },
        { title: "Metro limitation", text: "Zillow does not publish these payment series for Brookfield city. Bridgeport metro costs can differ materially from a specific Brookfield property and borrower." },
      ]} freshness={`Source snapshot checked ${new Date(data.fetchedAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}. The complete payment, rent, ZHVI, and rate history runs through ${monthLabel(latest.date, true)}.`} />
    </PageFrame>
  );
}

function BuyRentChart({ data }: { data: MarketData }) {
  const rows = data.series.ownership.filter((point) => point.date >= "2020-01");
  return <section className="chart-section decision-chart"><div className="section-heading"><div><h2>Ownership payment versus rent</h2><p>Both lines are Zillow metro estimates. The gap is a hurdle, not a complete lifetime return calculation.</p></div></div><div className="legend"><span><i className="legend-market" /> Total owner payment</span><span><i className="legend-rate" /> ZORI rent</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 2, left: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" /><XAxis dataKey="date" ticks={rows.filter((point) => point.date.endsWith("-01")).map((point) => point.date)} tickFormatter={(value) => value.slice(0, 4)} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} /><YAxis domain={[0, "auto"]} tickFormatter={(value) => currency(value, true)} axisLine={false} tickLine={false} width={54} tick={{ fill: "var(--muted)", fontSize: 11 }} /><Tooltip formatter={(value) => currency(Number(value))} labelFormatter={(value) => monthLabel(String(value), true)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} /><Line type="monotone" dataKey="totalMonthlyPayment" name="Owner payment" stroke="#de6248" strokeWidth={2.5} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="zori" name="ZORI rent" stroke="#167f82" strokeWidth={2.25} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></section>;
}

function RentPage({ data }: { data: MarketData }) {
  const latest = scoreBuyRentHurdle(data);
  return (
    <PageFrame title="How high is the buy hurdle?" eyebrow={`BUY-VERSUS-RENT HURDLE | UPDATED ${monthLabel(latest.date).toUpperCase()}`} copy="The monthly ownership premium, price-to-rent relationship, and one-year value forecast." score={latest.score} label={scoreBand(latest.score, "Lower hurdle", "Meaningful hurdle", "High hurdle")} description="Higher scores mean renting has a stronger near-term cost advantage over buying." scale={["Lower", "Meaningful", "High"]} footerLabel="the buy-versus-rent method">
      <BuyRentChart data={data} />
      <Metrics items={[
        { label: "Total owner payment", value: currency(latest.totalMonthlyPayment), note: "Bridgeport metro, 20% down" },
        { label: "Typical rent", value: currency(latest.zori), note: "Bridgeport metro ZORI" },
        { label: "Ownership premium", value: `${latest.ownershipPremium.toFixed(2)}x`, note: "Payment divided by rent" },
        { label: "1-year ZHVF", value: `${latest.forecastGrowth >= 0 ? "+" : ""}${latest.forecastGrowth.toFixed(1)}%`, note: `Forecast based ${monthLabel(data.forecast.baseDate)}` },
      ]} />
      <MethodSources formula="50% ownership-payment premium + 30% price-to-annual-rent + 20% forecast opportunity-cost hurdle" steps={[
        { name: "Payment premium, 50%.", text: "A payment equal to rent scores 0; twice rent or more scores 100, with linear values between." },
        { name: "Price-to-rent, 30%.", text: "A ratio of 12 or less scores 0; 24 or more scores 100." },
        { name: "Forecast hurdle, 20%.", text: "ZHVF growth of +5% scores 0 because waiting carries more price risk; -5% scores 100. Values are clamped." },
        { name: "Scope.", text: "The score is a current hurdle screen. It does not model transaction costs, investment returns, rent increases, tax deductions, maintenance surprises, or holding period." },
      ]} bands={[{ range: "0-39", label: "Lower" }, { range: "40-60", label: "Meaningful" }, { range: "61-100", label: "High" }]} sourceItems={[
        { title: "Zillow ownership payment", text: "Official Bridgeport metro total monthly payment for a typical middle-tier home with 20% down.", url: data.sources.totalMonthlyPayment, link: "Open official payment CSV" },
        { title: "Zillow rent index", text: "Official Bridgeport metro ZORI estimates the typical observed market rent across the rental stock.", url: data.sources.zori, link: "Open official ZORI CSV" },
        { title: "Brookfield ZHVI", text: "Direct city middle-tier ZHVI enters the price-to-rent ratio, while rent remains a metro proxy.", url: data.sources.zhviMiddle, link: "Open official city ZHVI" },
        { title: "Zillow forecast", text: "Bridgeport metro one-year ZHVF is Zillow's forecast, but this hurdle score is ours. Forecasts can be wrong and metro outcomes can differ from Brookfield.", url: data.sources.zhvf, link: "Open official ZHVF CSV" },
      ]} freshness={`Observed inputs are current through ${monthLabel(latest.date, true)}. ZHVF base date is ${new Date(`${data.forecast.baseDate}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}; its one-year horizon ends ${monthLabel(data.forecast.observations.at(-1)!.date, true)}.`} />
    </PageFrame>
  );
}

function WaitComposition({ score }: { score: ReturnType<typeof scoreBuyNowWait> }) {
  const rows = [
    { name: "Forecast", value: score.forecastScore },
    { name: "Leverage", value: score.leverageScore },
    { name: "$500K reach", value: score.budgetScore },
    { name: "Affordability", value: score.affordabilityScore },
  ];
  return <section className="chart-section decision-chart"><div className="section-heading"><div><h2>What is driving the decision?</h2><p>Four bounded subscores are shown before weighting. Higher values lean toward acting now.</p></div></div><div className="chart-wrap composition-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 12, right: 24, bottom: 8, left: 12 }}><CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="2 5" /><XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} /><YAxis type="category" dataKey="name" width={92} axisLine={false} tickLine={false} tick={{ fill: "var(--text)", fontSize: 12 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(0)} / 100`} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} /><Bar dataKey="value" name="Subscore" fill="#de6248" radius={[0, 5, 5, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></section>;
}

function WaitPage({ data }: { data: MarketData }) {
  const latest = scoreBuyNowWait(data);
  return (
    <PageFrame title="Buy now, or wait?" eyebrow={`BUY-NOW-VERSUS-WAIT SCORE | BASED ${monthLabel(latest.date).toUpperCase()}`} copy="A disciplined synthesis of forecast, leverage, budget reach, and carrying-cost stress." score={latest.score} label={scoreBand(latest.score, "Wait leans", "Close call", "Buy-now lean")} description="Higher scores mean current evidence leans toward acting; middle scores admit uncertainty." scale={["Wait", "Close", "Buy now"]} footerLabel="the timing method">
      <WaitComposition score={latest} />
      <Metrics items={[
        { label: "1-year ZHVF", value: `${latest.forecastGrowth >= 0 ? "+" : ""}${latest.forecastGrowth.toFixed(1)}%`, note: "Bridgeport metro forecast" },
        { label: "Offer leverage", value: latest.leverageScore.toFixed(0), note: "Latest complete negotiation score" },
        { label: "$500K reach", value: latest.budgetScore.toFixed(0), note: "Latest Brookfield ZHVI" },
        { label: "Affordability headroom", value: latest.affordabilityScore.toFixed(0), note: "100 minus monthly stress" },
      ]} />
      <MethodSources formula="30% ZHVF direction + 25% offer leverage + 20% $500K reach + 25% affordability headroom" steps={[
        { name: "Forecast, 30%.", text: "The one-year Bridgeport metro ZHVF maps linearly from -5% = 0 to +5% = 100. Higher expected values make waiting riskier." },
        { name: "Offer leverage, 25%.", text: "More current negotiating room supports buying now." },
        { name: "Budget reach, 20%.", text: "Broader reach against Brookfield value tiers supports acting without overextending the ceiling." },
        { name: "Affordability, 25%.", text: "This is 100 minus the monthly affordability stress score, so lower carrying-cost stress supports acting now." },
        { name: "Different release lags.", text: "Each subscore uses its latest valid official observation. The component dates are disclosed on their pages; no missing month is invented." },
      ]} bands={[{ range: "0-39", label: "Wait leans" }, { range: "40-60", label: "Close call" }, { range: "61-100", label: "Buy-now lean" }]} sourceItems={[
        { title: "Zillow forecast", text: "Bridgeport metro one-year ZHVF is the only forward-looking source. This composite score is not published by Zillow.", url: data.sources.zhvf, link: "Open official forecast CSV" },
        { title: "Brookfield price-cut input", text: "The direct city price-cut series feeds the latest offer-leverage component.", url: data.sources.priceCuts, link: "Open official city price cuts" },
        { title: "Brookfield value tiers", text: "Direct city bottom- and middle-tier ZHVI feed budget reach.", url: data.sources.zhviBottom, link: "Open official bottom-tier ZHVI" },
        { title: "Fairfield County proxy", text: "County sale-to-list and days-to-pending series feed offer leverage because sufficient Brookfield history is not published.", url: data.sources.saleToListMean, link: "Open official sale-to-list CSV" },
        { title: "Bridgeport metro payment", text: "Metro total monthly payment feeds affordability stress. It does not exactly represent a Brookfield property or borrower.", url: data.sources.totalMonthlyPayment, link: "Open official payment CSV" },
        { title: "Decision limitation", text: "This is a structured snapshot, not a prediction of mortgage rates or a recommendation to buy. Personal time horizon, cash reserves, property condition, and life plans can dominate the score." },
      ]} freshness={`All source files were checked ${new Date(data.fetchedAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}. Forecast base: ${data.forecast.baseDate}. Latest offer input: ${scoreOfferLeverage(data).at(-1)!.date}. Latest ZHVI and payment input: ${data.series.ownership.at(-1)!.date}.`} />
    </PageFrame>
  );
}

export function DecisionDashboard({ kind, data }: { kind: DecisionKind; data: MarketData }) {
  if (kind === "offer") return <OfferPage data={data} />;
  if (kind === "budget") return <BudgetPage data={data} />;
  if (kind === "stress") return <StressPage data={data} />;
  if (kind === "rent") return <RentPage data={data} />;
  return <WaitPage data={data} />;
}
