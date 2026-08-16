# Brookfield and Ridgefield Buyer Decision Suites

Two deployments of one validated Next.js housing decision suite for Fairfield County, Connecticut:

- Brookfield: https://brookfield-market.187.77.218.3.sslip.io
- Ridgefield: https://ridgefield-market.187.77.218.3.sslip.io

Each deployment uses official Zillow Research public CSVs, the FRED/Freddie Mac MORTGAGE30US series, and its own 48-hour snapshot of active Zillow listings under $500K collected through Apify.

## Pages

| Route | Indicator | Score direction |
| --- | --- | --- |
| `/` | Buyer/Seller Market Indicator | 0 buyer-favorable, 100 seller-favorable |
| `/offer-leverage` | Offer Leverage Score | 0 limited leverage, 100 stronger buyer leverage |
| `/budget-reach` | Under-$500K Budget Reach | 0 narrow reach, 100 broader reach |
| `/affordability-stress` | True Monthly Affordability Stress | 0 lower stress, 100 higher stress |
| `/buy-vs-rent` | Buy-versus-Rent Hurdle | 0 lower hurdle, 100 stronger rent cost advantage |
| `/buy-now-vs-wait` | Buy-Now-versus-Wait Score | 0 wait lean, 100 buy-now lean |

Every score is calculated by this project. Zillow publishes the source observations, not these custom scores.

## Methods and geography

The market indicator is 45% supply pressure, 30% inventory scarcity, and 25% market velocity. Offer leverage combines city price cuts with Fairfield County sale-to-list and timing proxies. Budget reach compares a fixed $500K ceiling with direct city bottom- and middle-tier ZHVI. Affordability and buy-versus-rent use plainly labeled Bridgeport metro payment/rent proxies plus direct city ZHVI and the national mortgage-rate series.

Brookfield has sufficient direct city inventory and new-listings history. Zillow's Ridgefield city new-listings row begins only in January 2026, so it cannot support the indicator's historical 12-month calculation. Ridgefield therefore uses direct city inventory and inventory change with Fairfield County new listings as a disclosed flow proxy. Ridgefield inventory, price cuts, and both ZHVI tiers remain direct city observations.

The Buy-Now-versus-Wait score is 30% current one-year Bridgeport metro ZHVF, 25% offer leverage, 20% budget reach, and 25% affordability headroom. Zillow's live ZHVF CSV contains only its current forecast vintage, not an archive. `app/data/forecast-vintages.json` retains genuine vintages beginning June 2026; the historical chart reconstructs only those months using official source history cut off at each base month. Refreshes append and validate vintages immutably. No missing historical forecast is invented.

## Configuration

`config/markets.json` is the source of truth for exact city/county/metro region IDs, direct/proxy new-listings geography, data files, listing bounds, and production URLs. `MARKET_TOWN=brookfield|ridgefield` selects the deployment at runtime. The listing sidecar receives the corresponding city, region ID, Zillow path, and map bounds through Compose environment variables. Each Dokploy compose has a separate persistent `listing_data` volume.

## Local checks

```bash
npm ci
npm run refresh-data
npm run validate-data
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

The data refresh downloads one source at a time, extracts exact configured geographies, validates schemas and IDs, rejects non-finite/domain-invalid values, history shrinkage, latest-date regression, forecast regression, and mutation of archived forecast vintages, then atomically replaces only validated JSON files. Tests cover formulas, directionality, both towns, explicit proxy geography, finite bounded scores, and forecast-history cutoff behavior. Next build concurrency is limited to one CPU for the 2 GiB Headquarters host.

## Listings

Production Compose includes an isolated listing refresher for each town. It runs immediately and every 48 hours, validates exact city/state, active sale status, supported home type, unique IDs, Zillow URLs, and the $500K ceiling, then atomically replaces the town's snapshot. Failures preserve the last valid snapshot. `APIFY_TOKEN` exists only in Dokploy compose environment and must never enter the browser or repository.

## Reliable scheduled refresh

Headquarters invokes `ops/weekly-refresh.sh` under `flock`. Friday at 8:00am America/New_York is the primary run. If Zillow has not yet published the prior calendar month, the job writes a release-pending marker and quiet daily 8:00am retries continue until the month appears.

The wrapper fetches `origin/main` and creates a clean detached temporary Git worktree, so unrelated files in the development checkout cannot block or be reset by automation. The worker:

- refreshes and validates both towns plus the immutable forecast archive;
- compares semantic data while ignoring `fetchedAt`-only changes;
- validates both live listing snapshots and their 72-hour freshness;
- installs locked dependencies in an ephemeral cache, then runs typecheck, tests, production build, and production audit;
- commits only validated data files and pushes with normal fast-forward protection;
- deploys and polls both Dokploy composes;
- verifies all six routes, town branding, disclosures, timing history, and listing APIs; and
- sends one persistent notification for the Friday result, a successful delayed release, or a failure. No-change daily retries are silent.

Logs include ISO timestamps and are bounded by logrotate. Do not disable the scheduled check unless Radi explicitly asks.
