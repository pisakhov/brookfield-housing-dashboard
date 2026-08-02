# Brookfield Buyer Decision Suite

A six-page, transparent housing decision suite for Brookfield, Connecticut. It uses official Zillow Research public CSVs, the FRED/Freddie Mac MORTGAGE30US series, and a separate live 48-hour snapshot of active Zillow listings under $500K collected through Apify.

Production: https://brookfield-market.187.77.218.3.sslip.io

## Pages

| Route | Indicator | Score direction |
| --- | --- | --- |
| `/` | Buyer/Seller Market Indicator | 0 buyer-favorable, 100 seller-favorable |
| `/offer-leverage` | Offer Leverage Score | 0 limited leverage, 100 stronger buyer leverage |
| `/budget-reach` | Under-$500K Budget Reach | 0 narrow reach, 100 broader reach |
| `/affordability-stress` | True Monthly Affordability Stress | 0 lower stress, 100 higher stress |
| `/buy-vs-rent` | Buy-versus-Rent Hurdle | 0 lower hurdle, 100 stronger rent cost advantage |
| `/buy-now-vs-wait` | Buy-Now-versus-Wait Score | 0 wait lean, 100 buy-now lean |

Every score is calculated by this dashboard. Zillow publishes the source observations, not these custom scores.

## Methods

### Buyer/Seller Market Indicator

- 45% Brookfield supply pressure: active inventory divided by new listings, percentile-ranked and reversed
- 30% Brookfield inventory scarcity: 12-month inventory change, percentile-ranked and reversed
- 25% Fairfield County market velocity: median days to pending, percentile-ranked and reversed

### Offer Leverage Score

- 40% Brookfield share of listings with a price cut, higher is more leverage
- 25% Fairfield County mean sale-to-final-list ratio, lower is more leverage
- 20% Fairfield County median sale-to-final-list ratio, lower is more leverage
- 15% Fairfield County median days to pending, higher is more leverage

The four inputs are percentile-ranked across complete observations since January 2020.

### Under-$500K Budget Reach

- 60% fixed $500K position against Brookfield bottom-tier ZHVI
- 40% fixed $500K position against Brookfield middle-tier ZHVI

The linear, clamped anchors are documented on the page. Live listing cards do not enter the score.

### True Monthly Affordability Stress

- 45% Bridgeport metro total monthly payment level
- 30% 12-month total-payment growth
- 25% FRED/Freddie Mac monthly mortgage-rate level

Inputs are percentile-ranked across complete observations since January 2020. Zillow income needed is displayed as an auditable result and is not double-counted.

### Buy-versus-Rent Hurdle

- 50% Bridgeport metro total owner payment divided by metro ZORI
- 30% Brookfield middle-tier ZHVI divided by annualized metro ZORI
- 20% Bridgeport metro one-year ZHVF opportunity-cost hurdle

The page states the fixed linear anchors and major omitted lifetime-cost variables.

### Buy-Now-versus-Wait Score

- 30% one-year Bridgeport metro ZHVF direction
- 25% latest Offer Leverage Score
- 20% latest Under-$500K Budget Reach
- 25% affordability headroom, defined as 100 minus the stress score

Each component uses its latest valid official observation. Different release lags are disclosed rather than filled with invented values.

## Geography

Brookfield city data is used for inventory, new listings, price-cut share, and middle- and bottom-tier ZHVI. Fairfield County is a plainly labeled proxy for days to pending and mean/median sale-to-list ratios because sufficient Brookfield city history is not published. Zillow's `Bridgeport, CT` metro is a plainly labeled proxy for total monthly payment, income needed, ZORI, and ZHVF. MORTGAGE30US is national context.

## Run

```bash
npm ci
npm run dev
```

The live listing API reads `LISTINGS_DATA_PATH`, defaulting to `/data/listings.json`. Production Compose includes a dedicated refresher that runs immediately and every 48 hours, writes snapshots atomically, and preserves the last valid snapshot on failure. Configure `APIFY_TOKEN` only in the deployment environment. Never expose it to the browser or commit it.

## Refresh and validation

```bash
npm run refresh-data
npm run validate-data
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

`scripts/refresh-data.mjs` downloads each official CSV into a temporary file, extracts only the exact expected geography row, validates schemas and region IDs, and removes the temporary download before moving to the next source. It validates finite values, sensible domains, strictly increasing unique months, minimum history, freshness, tier relationships, and the Zillow payment/income identity. It rejects unexplained history shrinkage or latest-date regression against the committed snapshot. Only a completely validated payload is atomically renamed into `app/data/market-data.json`; a failed run leaves the last valid file untouched.

`npm test` covers score bounds, no NaN or Infinity, monotonic direction checks, edge cases, hand-calculated fixtures, and independently reviewed current raw observations and published scores.

`scripts/listings-refresher.mjs` separately runs the Apify Zillow Search Scraper for Zillow region `23843`. It validates exact Brookfield/CT geography, active for-sale status, supported home types, and a maximum $500K price, then atomically writes a minimal public snapshot without exposing the token.

## Weekly production check

Headquarters runs `ops/weekly-refresh.sh` every Friday at 8:00am America/New_York under `flock`. It:

- refreshes and validates every Zillow/FRED series;
- compares semantic geography, source, notes, series, and forecast content while ignoring `fetchedAt`-only changes;
- rejects history shrinkage, latest-month regression, and forecast-base regression;
- verifies that the production listing snapshot is less than 72 hours old;
- installs locked dependencies on demand, runs typecheck, calculation tests, production build, and production dependency audit before deploying changed source history;
- removes ephemeral dependencies and Next build cache after the run when it installed them, protecting the space-constrained Headquarters disk;
- commits and pushes only reviewed semantic data changes;
- deploys the existing Dokploy Compose service without replacing its listing volume or environment secrets;
- verifies all six live routes and the listing API after deployment; and
- creates a persistent X Agent Console notification for updated, unchanged, and failed checks.

Do not disable the weekly check unless Radi explicitly asks.
