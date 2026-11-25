// Fetches recent world headlines from GDELT and writes them to a JSON file.
// Run by .github/workflows/headlines.yml so the site has a fresh copy to show
// instantly, even when GDELT is slow or busy. Usage: node fetch-headlines.mjs <out.json>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] || "headlines.json";
const QUERIES = [
  { q: "(government OR president OR minister OR war OR election OR economy OR police OR killed OR attack OR court)", sort: "HybridRel" },
  { q: "(climate OR earthquake OR flood OR storm OR health OR vaccine OR scientists OR football OR film OR market OR festival OR technology)", sort: "DateDesc" },
  { q: "", sort: "DateDesc" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Stop retrying after 8 minutes so the job (15 min limit) always gets to save.
const deadline = Date.now() + 8 * 60_000;
const timeLeft = () => deadline - Date.now();

async function get({ q, sort }) {
  const p = new URLSearchParams({
    query: (q ? q + " " : "") + "sourcelang:english",
    mode: "ArtList", format: "json", maxrecords: "250", timespan: "24h", sort,
  });
  for (let attempt = 1; attempt <= 6 && timeLeft() > 20_000; attempt++) {
    try {
      const res = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?" + p, { signal: AbortSignal.timeout(Math.min(60_000, timeLeft())) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);
      return JSON.parse(text).articles || [];
    } catch (err) {
      console.warn(`attempt ${attempt} failed: ${err.message}`);
      await sleep(Math.min(15_000 * attempt, Math.max(0, timeLeft() - 20_000))); // GDELT wants 5 s+ between requests
    }
  }
  return [];
}

const seen = new Set();
const articles = [];
for (const query of QUERIES) {
  if (timeLeft() < 30_000) break;
  const arts = await get(query);
  console.log(`${arts.length} articles for ${query.q || "(all)"}`);
  for (const a of arts) {
    if (!a.title || !a.url || seen.has(a.url) || (a.language && a.language !== "English")) continue;
    seen.add(a.url);
    articles.push({ title: a.title, url: a.url, domain: a.domain, seendate: a.seendate, socialimage: a.socialimage, sourcecountry: a.sourcecountry });
  }
  await sleep(8_000);
}

if (!articles.length) {
  console.error("No headlines fetched; leaving the previous file in place.");
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ at: Date.now(), articles }));
console.log(`Wrote ${articles.length} headlines to ${out}`);
