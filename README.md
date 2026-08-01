# Brookfield Market Balance

A transparent buyer-versus-seller housing market indicator for Brookfield, Connecticut. The dashboard uses Zillow Research monthly housing data, the FRED/Freddie Mac 30-year mortgage rate, and a live 48-hour snapshot of active Zillow listings under $500K collected through Apify.

## Method

The client computes a 0–100 composite for every complete month since January 2020:

- 45% Brookfield supply pressure: active inventory / new listings, percentile-ranked and reversed
- 30% Brookfield inventory scarcity: 12-month inventory change, percentile-ranked and reversed
- 25% market velocity: Fairfield County median days to pending, percentile-ranked and reversed

Lower underlying values are more seller-favorable for all three components. Scores 0–39 are labeled buyer's market, 40–60 balanced, and 61–100 seller's market. Fairfield County is used only for velocity because Zillow suppresses almost all historical city-level days-to-pending observations for Brookfield.

This is a comparative indicator, not a Zillow-published index, appraisal, or forecast.

## Run

```bash
npm ci
npm run dev
```

The live listing API reads `LISTINGS_DATA_PATH` (default `/data/listings.json`). The production Compose stack includes a dedicated refresher that runs immediately and every 48 hours, writes snapshots atomically to a shared volume, and preserves the last valid snapshot on failure. Configure `APIFY_TOKEN` only in the deployment environment; never expose it to the browser or commit it.

## Refresh raw data

```bash
npm run refresh-data
```

The market-data refresh script downloads the Zillow city/county CSVs and FRED weekly series, computes monthly mortgage averages, and writes only raw common observations to `app/data/market-data.json`. The indicator itself is computed in `app/market-dashboard.tsx`.

`scripts/listings-refresher.mjs` separately runs the Apify Zillow Search Scraper for Zillow region `23843`, validates exact Brookfield/CT geography, active for-sale status, supported home types, and a maximum $500K price, then writes a minimal public snapshot without exposing the Apify token.

## Verify

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```
