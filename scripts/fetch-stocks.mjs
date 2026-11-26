// Fetches prices, a one-month price history and recent headlines for ten
// major stocks from Yahoo Finance, and writes them to a JSON file for the
// site's stocks page. Run by .github/workflows/headlines.yml.
// Usage: node fetch-stocks.mjs <out.json>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] || "stocks.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (compatible; EarthwireBot/1.0; news map)";
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

// Keep in step with STOCKS in js/stocks.js (same symbols and keywords).
export const STOCKS = [
  { symbol: "AAPL", name: "Apple", words: ["Apple", "iPhone", "iPad", "Tim Cook", "AAPL"] },
  { symbol: "MSFT", name: "Microsoft", words: ["Microsoft", "Azure", "Xbox", "Satya Nadella", "MSFT"] },
  { symbol: "NVDA", name: "Nvidia", words: ["Nvidia", "NVIDIA", "Jensen Huang", "NVDA"] },
  { symbol: "GOOGL", name: "Alphabet", words: ["Google", "Alphabet", "YouTube", "Sundar Pichai", "Waymo", "GOOGL"] },
  { symbol: "AMZN", name: "Amazon", words: ["Amazon", "AWS", "Jeff Bezos", "Andy Jassy", "AMZN"] },
  { symbol: "META", name: "Meta", words: ["Meta", "Facebook", "Instagram", "WhatsApp", "Zuckerberg", "META"] },
  { symbol: "TSLA", name: "Tesla", words: ["Tesla", "Elon Musk", "Musk", "Cybertruck", "TSLA"] },
  { symbol: "BRK-B", name: "Berkshire Hathaway", query: "Berkshire Hathaway", words: ["Berkshire", "Buffett", "Greg Abel", "BRK"] },
  { symbol: "JPM", name: "JPMorgan Chase", words: ["JPMorgan", "JP Morgan", "Jamie Dimon", "JPM"] },
  { symbol: "WMT", name: "Walmart", words: ["Walmart", "WMT"] },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (words) => new RegExp("(?<![\\p{L}\\p{N}])(" + words.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", "u");

async function yahoo(path) {
  let last;
  for (const host of HOSTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`https://${host}${path}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        last = err;
        await sleep(1500 * attempt);
      }
    }
  }
  throw last;
}

// Calendar date in New York, where these stocks trade.
const nyDate = (sec) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function getStock(s) {
  const result = { symbol: s.symbol, name: s.name };
  try {
    const data = await yahoo(`/v8/finance/chart/${encodeURIComponent(s.symbol)}?range=1mo&interval=1d`);
    const r = data.chart.result[0];
    const m = r.meta;
    const closes = r.timestamp
      .map((t, i) => [t * 1000, r.indicators.quote[0].close[i]])
      .filter(([, c]) => c != null)
      .map(([t, c]) => [t, Math.round(c * 100) / 100]);
    const today = nyDate(m.regularMarketTime);
    const before = closes.filter(([t]) => nyDate(t / 1000) < today);
    const prevClose = before.length ? before[before.length - 1][1] : m.chartPreviousClose;
    const price = m.regularMarketPrice;
    Object.assign(result, {
      fullName: m.longName || m.shortName || s.name,
      currency: m.currency || "USD",
      price,
      prevClose,
      change: Math.round((price - prevClose) * 100) / 100,
      changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
      marketTime: m.regularMarketTime * 1000,
      high52: m.fiftyTwoWeekHigh,
      low52: m.fiftyTwoWeekLow,
      // make sure the last point is the current price
      closes: closes.length && nyDate(closes[closes.length - 1][0] / 1000) === today
        ? [...closes.slice(0, -1), [m.regularMarketTime * 1000, price]]
        : [...closes, [m.regularMarketTime * 1000, price]],
    });
  } catch (err) {
    console.warn(`${s.symbol}: price failed (${err.message})`);
  }
  try {
    const data = await yahoo(`/v1/finance/search?q=${encodeURIComponent(s.query || s.symbol)}&quotesCount=0&newsCount=20`);
    const re = matcher(s.words);
    result.news = (data.news || [])
      .filter((n) => n.title && n.link && re.test(n.title))
      .slice(0, 6)
      .map((n) => ({ title: n.title, url: n.link, domain: n.publisher || "", time: (n.providerPublishTime || 0) * 1000 }));
  } catch (err) {
    console.warn(`${s.symbol}: news failed (${err.message})`);
    result.news = [];
  }
  const ok = result.price != null;
  console.log(`${s.symbol.padEnd(6)} ${ok ? result.price + " " + (result.changePct >= 0 ? "+" : "") + result.changePct + "%" : "no price"}  ${result.news.length} headlines`);
  return result;
}

async function main() {
  const stocks = [];
  for (const s of STOCKS) {
    stocks.push(await getStock(s));
    await sleep(500);
  }
  if (!stocks.some((s) => s.price != null)) {
    console.error("No prices fetched; leaving the previous file in place.");
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ at: Date.now(), stocks }));
  console.log(`Wrote ${stocks.length} stocks to ${out}`);
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
