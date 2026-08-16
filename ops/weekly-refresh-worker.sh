#!/usr/bin/env bash
set -Eeuo pipefail

MODE=${1:-weekly}
PROJECT_DIR=$(git rev-parse --show-toplevel)
SOURCE_REPO=${SOURCE_REPO:-/root/projects/brookfield-housing-dashboard}
STATE_DIR=${STATE_DIR:-/root/.local/state/x-agent-brookfield-market}
PENDING_FILE="$STATE_DIR/release-pending"
NOTIFIER="$SOURCE_REPO/ops/x-agent-console-notify.sh"
BROOKFIELD_COMPOSE_ID=GMbqw9OOkOdn0CX7yz6xs
RIDGEFIELD_COMPOSE_ID=bdTrq5dJarX0rBTPj46ip
DATA_FILES=(app/data/market-data.json app/data/ridgefield-market-data.json app/data/forecast-vintages.json)
npm_cache="$STATE_DIR/npm-cache-$$"
notified=0
pushed=0

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
notify() {
  "$NOTIFIER" "Housing Market Refresh" "$1"
  notified=1
}
finish() {
  local rc=$?
  rm -rf "$npm_cache"
  if [[ $rc -ne 0 && $notified -eq 0 ]]; then
    local state="No production data changed."
    if [[ $pushed -eq 1 ]]; then state="The validated source commit was pushed, but production verification did not finish."; fi
    notify "The Brookfield/Ridgefield refresh failed safely. $state [Open Brookfield](https://brookfield-market.187.77.218.3.sslip.io)" || true
  fi
  trap - EXIT
  exit "$rc"
}
trap finish EXIT

cd "$PROJECT_DIR"
log "Refreshing official Zillow and FRED sources"
node scripts/refresh-data.mjs
node scripts/validate-data.mjs

comparison=$(node <<'NODE'
const fs = require('fs');
const cp = require('child_process');
const files = ['app/data/market-data.json', 'app/data/ridgefield-market-data.json', 'app/data/forecast-vintages.json'];
const current = Object.fromEntries(files.map((file) => [file, JSON.parse(fs.readFileSync(file))]));
const prior = Object.fromEntries(files.map((file) => [file, JSON.parse(cp.execFileSync('git', ['show', `HEAD:${file}`], {encoding: 'utf8'}))]));
const semantic = (file, value) => file.endsWith('forecast-vintages.json') ? value : {geography: value.geography, sources: value.sources, notes: value.notes, series: value.series, forecast: value.forecast};
const changedFiles = files.filter((file) => JSON.stringify(semantic(file, current[file])) !== JSON.stringify(semantic(file, prior[file])));
const markets = [current['app/data/market-data.json'], current['app/data/ridgefield-market-data.json']];
const latestMonths = Object.fromEntries(markets.map((data) => [data.geography.city.name.toLowerCase(), data.series.market.at(-1).date]));
const latest = Object.values(latestMonths).sort()[0];
process.stdout.write(JSON.stringify({changedFiles, changed: changedFiles.length > 0, latest, latestMonths, vintageCount: current['app/data/forecast-vintages.json'].vintages.length}));
NODE
)
changed=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.changed))' "$comparison")
latest=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.latest)' "$comparison")
vintage_count=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.vintageCount))' "$comparison")
expected=$(TZ=America/New_York date -d "$(TZ=America/New_York date +%Y-%m-01) -1 month" +%Y-%m)
if [[ $latest < $expected ]]; then
  printf '%s\n' "$expected" > "$PENDING_FILE"
  release_note="Zillow has not published the complete $expected source month yet; quiet daily retries remain armed."
else
  rm -f "$PENDING_FILE"
  release_note="The expected $expected source month is available."
fi

check_listings() {
  node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const markets = JSON.parse(fs.readFileSync('config/markets.json', 'utf8'));
(async () => {
  const result = {};
  for (const [slug, config] of Object.entries(markets)) {
    const response = await fetch(`${config.productionUrl}/api/listings`, {signal: AbortSignal.timeout(30000), cache: 'no-store'});
    if (!response.ok) throw new Error(`${slug} listings returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.listings) || !data.fetchedAt || data.status !== 'ready') throw new Error(`${slug} listing snapshot is not ready`);
    if (data.filter?.city !== config.city.name || data.filter?.state !== config.city.state || data.filter?.maximumPrice !== 500000) throw new Error(`${slug} listing filter mismatch`);
    const age = Date.now() - Date.parse(data.fetchedAt);
    if (!Number.isFinite(age) || age < 0 || age > 72 * 60 * 60 * 1000) throw new Error(`${slug} listing snapshot is older than 72 hours`);
    const ids = new Set();
    for (const row of data.listings) {
      if (!row.id || ids.has(String(row.id)) || !Number.isFinite(row.price) || row.price <= 0 || row.price > 500000 || !/^https:\/\/www\.zillow\.com\//.test(row.url || '')) throw new Error(`${slug} listing row failed validation`);
      ids.add(String(row.id));
    }
    const stable = [...data.listings].sort((a,b) => String(a.id).localeCompare(String(b.id)));
    result[slug] = {count: stable.length, fetchedAt: data.fetchedAt, hash: crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')};
  }
  process.stdout.write(JSON.stringify(result));
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
}

if [[ $changed == false ]]; then
  git restore -- "${DATA_FILES[@]}"
  if [[ $MODE == weekly ]]; then
    listings=$(check_listings)
    brookfield_count=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.brookfield.count))' "$listings")
    ridgefield_count=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.ridgefield.count))' "$listings")
    notify "The Friday housing-market check completed with no new official observations. Both dashboards remain current through $latest. $release_note Live feeds: $brookfield_count Brookfield and $ridgefield_count Ridgefield homes under \$500K. [Open Brookfield](https://brookfield-market.187.77.218.3.sslip.io) · [Open Ridgefield](https://ridgefield-market.187.77.218.3.sslip.io)"
  else
    log "Retry found no new semantic source data; no notification sent"
  fi
  exit 0
fi

log "Source data changed; installing locked dependencies"
NPM_CONFIG_CACHE="$npm_cache" npm ci
rm -rf "$npm_cache/_cacache" "$npm_cache/_npx"
npm run typecheck
npm test
npm run build
npm audit --omit=dev

git add -- "${DATA_FILES[@]}"
git commit -m "Refresh town market data through $latest"
git push origin HEAD:main
pushed=1

pg=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres\.1\.' | head -1)
if [[ -z $pg ]]; then
  echo "Dokploy Postgres container was not found" >&2
  exit 1
fi

deploy_one() {
  local slug=$1 compose_id=$2
  if [[ $compose_id == *_PENDING ]]; then
    echo "$slug compose ID is not configured" >&2
    exit 1
  fi
  local previous latest_row deployment_id status
  previous=$(docker exec "$pg" psql -U dokploy -d dokploy -Atc "SELECT \"deploymentId\" FROM deployment WHERE \"composeId\"='$compose_id' ORDER BY \"createdAt\" DESC LIMIT 1;")
  COMPOSE_ID="$compose_id" node --input-type=module <<'NODE'
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/@dokploy/cli/config.json', 'utf8'));
const response = await fetch(cfg.url + '/api/trpc/compose.deploy', {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-api-key': cfg.token},
  body: JSON.stringify({json: {composeId: process.env.COMPOSE_ID}}),
});
const body = await response.text();
if (!response.ok || !body.includes('success')) throw new Error(`Dokploy deploy request failed: HTTP ${response.status}`);
NODE
  for _ in $(seq 1 120); do
    latest_row=$(docker exec "$pg" psql -U dokploy -d dokploy -Atc "SELECT \"deploymentId\" || '|' || status FROM deployment WHERE \"composeId\"='$compose_id' ORDER BY \"createdAt\" DESC LIMIT 1;")
    deployment_id=${latest_row%%|*}
    status=${latest_row#*|}
    if [[ $deployment_id != "$previous" && $status == done ]]; then log "$slug deployment $deployment_id completed"; return 0; fi
    if [[ $deployment_id != "$previous" && $status == error ]]; then echo "$slug deployment failed: $deployment_id" >&2; return 1; fi
    sleep 5
  done
  echo "$slug deployment did not complete in ten minutes" >&2
  return 1
}

deploy_one brookfield "$BROOKFIELD_COMPOSE_ID"
deploy_one ridgefield "$RIDGEFIELD_COMPOSE_ID"

node <<'NODE'
const fs = require('fs');
const markets = JSON.parse(fs.readFileSync('config/markets.json', 'utf8'));
const routes = {'/': 'Who has the', '/offer-leverage': 'How much can an offer push', '/budget-reach': 'What does $500K reach', '/affordability-stress': 'How hard is the monthly carry', '/buy-vs-rent': 'How high is the buy hurdle', '/buy-now-vs-wait': 'Decision snapshots through time'};
(async () => {
  for (const [slug, config] of Object.entries(markets)) {
    for (const [route, expected] of Object.entries(routes)) {
      const response = await fetch(config.productionUrl + route, {signal: AbortSignal.timeout(30000)});
      const html = await response.text();
      if (!response.ok || !html.includes(expected) || !html.includes(`${config.city.name} Buyer`)) throw new Error(`${slug}${route} live verification failed`);
      if (route !== '/' && !html.includes('Zillow does not publish this score')) throw new Error(`${slug}${route} disclosure missing`);
    }
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE

listings=$(check_listings)
brookfield_count=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.brookfield.count))' "$listings")
ridgefield_count=$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.ridgefield.count))' "$listings")
printf '%s\n' "$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.brookfield.hash)' "$listings")" > "$STATE_DIR/brookfield-listings.sha256"
printf '%s\n' "$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.ridgefield.hash)' "$listings")" > "$STATE_DIR/ridgefield-listings.sha256"
notify "Both housing dashboards are updated and verified through $latest with $vintage_count retained forecast vintages. $release_note Live feeds: $brookfield_count Brookfield and $ridgefield_count Ridgefield homes under \$500K. [Open Brookfield](https://brookfield-market.187.77.218.3.sslip.io) · [Open Ridgefield](https://ridgefield-market.187.77.218.3.sslip.io)"
