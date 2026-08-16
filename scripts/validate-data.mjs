import { readFile } from "node:fs/promises";
import { validateForecastArchive, validateMarketData } from "./validate-data-lib.mjs";

const markets = JSON.parse(await readFile(new URL("../config/markets.json", import.meta.url), "utf8"));
const archive = JSON.parse(await readFile(new URL("../app/data/forecast-vintages.json", import.meta.url), "utf8"));
let currentForecast;
for (const [slug, config] of Object.entries(markets)) {
  const data = JSON.parse(await readFile(new URL(`../${config.dataFile}`, import.meta.url), "utf8"));
  validateMarketData(data, config);
  if (currentForecast && JSON.stringify(currentForecast) !== JSON.stringify(data.forecast)) throw new Error(`${slug}: shared metro forecast differs from another market`);
  currentForecast = data.forecast;
  console.log(`Validated ${slug} schema v${data.schemaVersion}: ${data.series.market.length} market months, ${data.series.homeValues.length} home-value months, ${data.series.ownership.length} ownership/rent months; latest ${data.series.market.at(-1).date}.`);
}
validateForecastArchive(archive, markets.brookfield.metroProxy.zillowRegionId, currentForecast);
console.log(`Validated ${archive.vintages.length} retained Bridgeport metro forecast vintages.`);
