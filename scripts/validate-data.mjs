import { readFile } from "node:fs/promises";
import { validateMarketData } from "./validate-data-lib.mjs";

const path = new URL("../app/data/market-data.json", import.meta.url);
const data = JSON.parse(await readFile(path, "utf8"));
validateMarketData(data);
console.log(`Validated schema v${data.schemaVersion}: ${data.series.market.length} market months, ${data.series.homeValues.length} home-value months, ${data.series.ownership.length} ownership/rent months; latest ${data.series.market.at(-1).date}.`);
