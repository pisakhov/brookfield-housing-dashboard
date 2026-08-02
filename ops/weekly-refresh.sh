#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR=/root/projects/brookfield-housing-dashboard
DASHBOARD_URL=https://brookfield-market.187.77.218.3.sslip.io
COMPOSE_ID=GMbqw9OOkOdn0CX7yz6xs
STATE_DIR=/root/.local/state/x-agent-brookfield-market
LISTING_STATE="$STATE_DIR/listings.sha256"
NOTIFIER="$PROJECT_DIR/ops/x-agent-console-notify.sh"

mkdir -p "$STATE_DIR"
cd "$PROJECT_DIR"

notified=0
ephemeral_dependencies=0
start_sha=$(git rev-parse HEAD)
backup=$(mktemp)
cp app/data/market-data.json "$backup"
pushed=0

notify() {
  local message=$1
  "$NOTIFIER" "Brookfield Market Check" "$message"
  notified=1
}

cleanup() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    if [[ $pushed -eq 0 ]]; then
      git reset --hard "$start_sha" >/dev/null 2>&1 || true
    fi
    if [[ $notified -eq 0 ]]; then
      notify "The weekly Brookfield dashboard refresh hit an error and needs attention. The last valid dashboard remains available: [Open the Brookfield dashboard]($DASHBOARD_URL)" || true
    fi
  fi
  rm -rf .next/cache
  if [[ $ephemeral_dependencies -eq 1 ]]; then
    rm -rf node_modules .next
  fi
  rm -f "$backup"
  exit "$rc"
}
trap cleanup EXIT

if [[ -n $(git status --porcelain) ]]; then
  echo "Refusing to refresh a dirty checkout" >&2
  exit 1
fi

root_usage=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if (( root_usage >= 95 )); then
  echo "Headquarters root usage is ${root_usage}%" >&2
  exit 1
fi

npm run refresh-data

npm run validate-data

comparison=$(node - "$backup" <<'NODE'
const fs = require('fs');
const oldData = JSON.parse(fs.readFileSync(process.argv[2]));
const newData = JSON.parse(fs.readFileSync('app/data/market-data.json'));
if (newData.schemaVersion !== 2 || !newData.series || !newData.forecast) throw new Error('unexpected refreshed schema');
for (const key of ['market', 'priceCuts', 'homeValues', 'saleToList', 'ownership']) {
  const before = oldData.series?.[key];
  const after = newData.series[key];
  if (!Array.isArray(before) || !Array.isArray(after) || !after.length) throw new Error(`${key}: missing history`);
  if (after.length < before.length) throw new Error(`${key}: history shrank ${before.length} -> ${after.length}`);
  if (after.at(-1).date < before.at(-1).date) throw new Error(`${key}: latest month regressed ${before.at(-1).date} -> ${after.at(-1).date}`);
}
if (newData.forecast.baseDate < oldData.forecast.baseDate) throw new Error(`forecast base regressed ${oldData.forecast.baseDate} -> ${newData.forecast.baseDate}`);
const semantic = (data) => JSON.stringify({geography: data.geography, sources: data.sources, notes: data.notes, series: data.series, forecast: data.forecast});
const changed = semantic(oldData) !== semantic(newData);
const oldLast = oldData.series.market.at(-1).date;
const newLast = newData.series.market.at(-1).date;
process.stdout.write(JSON.stringify({changed, oldLast, newLast, forecastBase: newData.forecast.baseDate, seriesCounts: Object.fromEntries(Object.entries(newData.series).map(([key, rows]) => [key, rows.length]))}));
NODE
)

market_changed=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.changed))' "$comparison")
latest_month=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.newLast)' "$comparison")

listing_json=$(mktemp)
curl --fail --silent --show-error --location --retry 3 --max-time 30 "$DASHBOARD_URL/api/listings" > "$listing_json"
listing_summary=$(node - "$listing_json" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const data = JSON.parse(fs.readFileSync(process.argv[2]));
if (!Array.isArray(data.listings) || !data.fetchedAt || data.status !== 'ready') throw new Error('invalid listing snapshot');
if (data.filter?.city !== 'Brookfield' || data.filter?.state !== 'CT' || data.filter?.maximumPrice !== 500000) throw new Error('listing snapshot filter mismatch');
const ageMs = Date.now() - Date.parse(data.fetchedAt);
if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 72 * 60 * 60 * 1000) throw new Error('listing snapshot is older than 72 hours');
const ids = new Set();
for (const row of data.listings) {
  if (!row.id || ids.has(String(row.id)) || !Number.isFinite(row.price) || row.price <= 0 || row.price > 500000 || !/^https:\/\/www\.zillow\.com\//.test(row.url || '')) throw new Error('listing snapshot row failed validation');
  ids.add(String(row.id));
}
const stable = [...data.listings].sort((a,b) => String(a.id).localeCompare(String(b.id)));
const hash = crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
process.stdout.write(JSON.stringify({hash, count: stable.length, fetchedAt: data.fetchedAt}));
NODE
)
rm -f "$listing_json"
listing_hash=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.hash)' "$listing_summary")
listing_count=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.count))' "$listing_summary")
listing_changed=false
if [[ -s "$LISTING_STATE" ]] && [[ $(cat "$LISTING_STATE") != "$listing_hash" ]]; then
  listing_changed=true
fi
printf '%s\n' "$listing_hash" > "$LISTING_STATE"

if [[ $market_changed == false ]]; then
  cp "$backup" app/data/market-data.json
else
  if [[ ! -x node_modules/.bin/next ]]; then
    npm ci
    ephemeral_dependencies=1
  fi
  npm run typecheck
  npm test
  npm run build
  npm audit --omit=dev
  git add app/data/market-data.json
  git commit -m "Refresh market data through $latest_month"
  git push origin main
  pushed=1

  pg=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres\.1\.' | head -1)
  previous_deployment=$(docker exec "$pg" psql -U dokploy -d dokploy -Atc \
    "SELECT \"deploymentId\" FROM deployment WHERE \"composeId\"='$COMPOSE_ID' ORDER BY \"createdAt\" DESC LIMIT 1;")

  node --input-type=module <<NODE
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/@dokploy/cli/config.json', 'utf8'));
const response = await fetch(cfg.url + '/api/trpc/compose.deploy', {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-api-key': cfg.token},
  body: JSON.stringify({json: {composeId: '$COMPOSE_ID'}}),
});
if (!response.ok) throw new Error('Dokploy deploy request failed: HTTP ' + response.status);
const body = await response.text();
if (!body.includes('success')) throw new Error('Dokploy did not accept deployment');
NODE

  deployment_id=
  deployment_status=
  for _ in $(seq 1 120); do
    latest=$(docker exec "$pg" psql -U dokploy -d dokploy -Atc \
      "SELECT \"deploymentId\" || '|' || status FROM deployment WHERE \"composeId\"='$COMPOSE_ID' ORDER BY \"createdAt\" DESC LIMIT 1;")
    deployment_id=${latest%%|*}
    deployment_status=${latest#*|}
    if [[ $deployment_id != "$previous_deployment" ]] && [[ $deployment_status == "done" ]]; then
      break
    fi
    if [[ $deployment_id != "$previous_deployment" ]] && [[ $deployment_status == "error" ]]; then
      echo "Dokploy deployment failed: $deployment_id" >&2
      exit 1
    fi
    sleep 5
  done
  if [[ $deployment_id == "$previous_deployment" || $deployment_status != "done" ]]; then
    echo "Dokploy deployment did not complete in ten minutes" >&2
    exit 1
  fi
  declare -A route_checks=(
    [/]="Who has the"
    [/offer-leverage]="How much can an offer push"
    [/budget-reach]="What does \$500K reach"
    [/affordability-stress]="How hard is the monthly carry"
    [/buy-vs-rent]="How high is the buy hurdle"
    [/buy-now-vs-wait]="Buy now, or wait"
  )
  for route in "${!route_checks[@]}"; do
    live_html=$(curl --fail --silent --show-error --retry 10 --retry-delay 6 "$DASHBOARD_URL$route")
    grep -Fq "${route_checks[$route]}" <<<"$live_html"
    grep -Fq "Zillow does not publish this score" <<<"$live_html" || [[ $route == / ]]
  done
fi

if [[ $market_changed == true || $listing_changed == true ]]; then
  details="Market history is current through $latest_month; the live feed contains $listing_count homes under \$500K."
  notify "Hey, your dashboard is ready with the new data. $details [Open the Brookfield dashboard]($DASHBOARD_URL)"
else
  notify "The weekly Brookfield dashboard check is complete. There is no new data this week; market history remains current through $latest_month and the live feed has $listing_count homes under \$500K. [Open the Brookfield dashboard]($DASHBOARD_URL)"
fi
