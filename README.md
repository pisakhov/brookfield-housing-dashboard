# Brookfield Market Balance

A transparent buyer-versus-seller housing market indicator for Brookfield, Connecticut. The dashboard uses Zillow Research monthly housing data and the FRED/Freddie Mac 30-year mortgage rate.

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

## Refresh raw data

```bash
npm run refresh-data
```

The refresh script downloads the Zillow city/county CSVs and FRED weekly series, computes monthly mortgage averages, and writes only raw common observations to `app/data/market-data.json`. The indicator itself is computed in `app/market-dashboard.tsx`.

## Verify

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```
