// Collects recent world headlines and writes them to a JSON file.
// Run by .github/workflows/headlines.yml every 30 minutes; the site loads the
// result first so the map fills instantly.
//
// Sources, in order:
//   1. RSS feeds from major news outlets: fast and reliable from servers.
//   2. GDELT: many more outlets, but slow and often busy. Used when it answers.
//
// Usage: node fetch-headlines.mjs <out.json>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2] || "headlines.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 8 * 60_000; // the job has a 15 min limit
const timeLeft = () => deadline - Date.now();
const UA = "Mozilla/5.0 (compatible; EarthwireBot/1.0; news map)";

// [source country, feed url]
const FEEDS = [
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/africa/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/asia/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/europe/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/news/technology/rss.xml"],
  ["United Kingdom", "https://feeds.bbci.co.uk/sport/rss.xml"],
  ["Qatar", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["United States", "https://feeds.npr.org/1004/rss.xml"],
  ["United Kingdom", "https://www.theguardian.com/world/rss"],
  ["Germany", "https://rss.dw.com/rdf/rss-en-world"],
  ["France", "https://www.france24.com/en/rss"],
  ["Australia", "https://www.abc.net.au/news/feed/2942460/rss.xml"],
  ["India", "https://feeds.feedburner.com/ndtvnews-world-news"],
  ["Japan", "https://www3.nhk.or.jp/nhkworld/en/news/feeds/"],
];

// ---------------------------------------------------------------- RSS
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s || "")
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1] : "";
};
const attr = (xml, name, a) => {
  const m = new RegExp(`<${name}\\s[^>]*${a}=["']([^"']+)["']`, "i").exec(xml);
  return m ? decode(m[1]) : "";
};

export function parseFeed(xml, country) {
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const now = Date.now();
  return items.map((it) => {
    const title = decode(tag(it, "title"));
    let url = decode(tag(it, "link")) || attr(it, "link", "href");
    const guid = decode(tag(it, "guid"));
    if (!/^https?:/.test(url) && /^https?:/.test(guid)) url = guid;
    const date = Date.parse(decode(tag(it, "pubDate") || tag(it, "dc:date") || tag(it, "published") || tag(it, "updated")));
    const image = attr(it, "media:thumbnail", "url") || attr(it, "media:content", "url") || attr(it, "enclosure", "url");
    return {
      title,
      url,
      domain: url ? new URL(url).hostname.replace(/^www\./, "") : "",
      time: Number.isFinite(date) ? Math.min(date, now) : now,
      socialimage: /^https:/.test(image) ? image : "",
      sourcecountry: country,
      summary: decode(tag(it, "description") || tag(it, "summary")).slice(0, 300),
    };
  }).filter((a) => a.title && /^https?:/.test(a.url));
}

async function getFeed([country, url]) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const items = parseFeed(await res.text(), country);
    console.log(`${String(items.length).padStart(3)} from ${url}`);
    return items;
  } catch (err) {
    console.warn(`  0 from ${url} (${err.message})`);
    return [];
  }
}

// ---------------------------------------------------------------- GDELT
const GDELT_QUERIES = [
  { q: "(government OR president OR minister OR war OR election OR economy OR police OR killed OR attack OR court)", sort: "HybridRel" },
  { q: "(climate OR earthquake OR flood OR storm OR health OR vaccine OR scientists OR football OR film OR market OR festival OR technology)", sort: "DateDesc" },
];
async function getGdelt({ q, sort }) {
  const p = new URLSearchParams({ query: q + " sourcelang:english", mode: "ArtList", format: "json", maxrecords: "250", timespan: "24h", sort });
  for (let attempt = 1; attempt <= 4 && timeLeft() > 30_000; attempt++) {
    try {
      const res = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?" + p, { signal: AbortSignal.timeout(Math.min(60_000, timeLeft() - 10_000)) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 60)}`);
      const arts = (JSON.parse(text).articles || []).filter((a) => !a.language || a.language === "English");
      console.log(`${String(arts.length).padStart(3)} from GDELT ${sort}`);
      return arts.map((a) => ({ title: a.title, url: a.url, domain: a.domain, seendate: a.seendate, socialimage: a.socialimage, sourcecountry: a.sourcecountry }));
    } catch (err) {
      console.warn(`  GDELT attempt ${attempt} failed: ${err.message}`);
      await sleep(Math.min(15_000 * attempt, Math.max(0, timeLeft() - 30_000)));
    }
  }
  return [];
}

// ---------------------------------------------------------------- main
async function main() {
  const all = (await Promise.all(FEEDS.map(getFeed))).flat();
  for (const query of GDELT_QUERIES) {
    if (timeLeft() < 60_000) break;
    all.push(...(await getGdelt(query)));
    await sleep(8_000);
  }

  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  const seen = new Set();
  const articles = all.filter((a) => {
    const key = a.url.replace(/[?#].*$/, "");
    const t = a.time || 0;
    if (seen.has(key) || (t && t < cutoff)) return false;
    seen.add(key);
    return true;
  });

  if (!articles.length) {
    console.error("No headlines fetched; leaving the previous file in place.");
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ at: Date.now(), articles }));
  console.log(`Wrote ${articles.length} headlines to ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
