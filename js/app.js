(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  const REFRESH_MS = 15 * 60 * 1000;
  const CACHE_KEY = "earthwire:v1";
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";
  const QUERIES = [
    { q: "(government OR president OR minister OR war OR election OR economy OR police OR killed OR attack OR court)", sort: "HybridRel" },
    { q: "(climate OR earthquake OR flood OR storm OR health OR vaccine OR scientists OR football OR film OR market OR festival OR technology)", sort: "DateDesc" },
  ];

  // Order matters: on a tie, the earlier topic wins.
  const CATEGORIES = [
    { id: "climate", label: "Climate & disasters", color: "#fb923c",
      words: ["earthquake", "quake", "tsunami", "flood", "floods", "flooding", "storm", "storms", "hurricane", "typhoon", "cyclone", "tornado", "wildfire", "wildfires", "drought", "climate", "heatwave", "heat wave", "heat", "weather", "volcano", "eruption", "landslide", "emissions", "carbon", "pollution", "snow", "rain", "rains", "monsoon", "glacier", "evacuate", "evacuated", "evacuation", "cop30", "cop31", "environment", "wildlife"] },
    { id: "conflict", label: "Conflict & crime", color: "#ff5d5d",
      words: ["war", "wars", "attack", "attacks", "strike", "strikes", "airstrike", "airstrikes", "missile", "missiles", "drone", "drones", "troops", "military", "army", "soldiers", "killed", "kills", "kill", "dead", "deaths", "shooting", "shot", "gunmen", "gunman", "bomb", "bombing", "blast", "explosion", "ceasefire", "truce", "hostage", "hostages", "rebels", "militants", "militia", "invasion", "clashes", "fighting", "police", "arrest", "arrested", "murder", "stabbing", "charged", "sentenced", "trial", "prison", "jail", "crime", "fraud", "terror", "terrorist", "violence", "shelling", "offensive", "weapons", "nuclear"] },
    { id: "politics", label: "Politics", color: "#a78bfa",
      words: ["election", "elections", "vote", "votes", "voters", "president", "presidential", "prime minister", "minister", "ministers", "parliament", "government", "senate", "congress", "lawmakers", "policy", "summit", "diplomat", "diplomatic", "diplomacy", "sanctions", "talks", "treaty", "opposition", "campaign", "referendum", "protest", "protests", "protesters", "coalition", "cabinet", "leader", "leaders", "party", "bill", "law", "court", "supreme court", "judge", "visa", "immigration", "migrants", "border"] },
    { id: "business", label: "Business", color: "#fbbf24",
      words: ["market", "markets", "stocks", "stock", "shares", "economy", "economic", "inflation", "interest rates", "rates", "bank", "banks", "trade", "tariff", "tariffs", "oil", "gas prices", "prices", "company", "companies", "profit", "profits", "revenue", "jobs", "unemployment", "gdp", "investment", "investors", "startup", "startups", "deal", "merger", "acquisition", "ceo", "earnings", "budget", "debt", "currency", "dollar", "bitcoin", "crypto", "exports", "imports", "retail", "sales", "billion", "million", "layoffs", "strike action"] },
    { id: "science", label: "Science & tech", color: "#22d3ee",
      words: ["ai", "artificial intelligence", "tech", "technology", "space", "nasa", "rocket", "satellite", "moon", "mars", "scientists", "science", "research", "researchers", "study", "chip", "chips", "semiconductor", "robot", "robots", "software", "cyber", "cyberattack", "hackers", "hack", "data", "app", "smartphone", "iphone", "google", "apple", "microsoft", "openai", "tesla", "electric vehicle", "ev", "evs", "quantum", "discovery", "fossil", "dinosaur", "telescope"] },
    { id: "health", label: "Health", color: "#4ade80",
      words: ["health", "hospital", "hospitals", "virus", "vaccine", "vaccines", "vaccination", "outbreak", "disease", "cancer", "measles", "covid", "flu", "bird flu", "mpox", "cholera", "malaria", "doctors", "nurses", "patients", "medical", "medicine", "drug", "drugs", "mental health", "obesity", "pandemic", "epidemic"] },
    { id: "sports", label: "Sports", color: "#60a5fa",
      words: ["match", "cup", "world cup", "league", "championship", "champions", "coach", "goal", "goals", "olympic", "olympics", "team", "tournament", "football", "soccer", "cricket", "tennis", "golf", "rugby", "nba", "nfl", "mlb", "nhl", "f1", "formula 1", "grand prix", "marathon", "playoff", "playoffs", "final", "semi-final", "season", "striker", "quarterback", "medal", "beat", "beats", "defeat", "victory", "win", "wins", "squad", "fifa", "uefa", "premier league", "transfer"] },
    { id: "culture", label: "Culture", color: "#f472b6",
      words: ["film", "films", "movie", "movies", "music", "album", "song", "singer", "concert", "museum", "art", "artist", "exhibition", "festival", "celebrity", "actor", "actress", "book", "novel", "author", "fashion", "design", "theatre", "theater", "tv", "series", "netflix", "oscar", "oscars", "grammy", "royal", "king", "queen", "prince", "princess", "wedding", "food", "restaurant", "tourism", "tourists", "travel"] },
  ];
  const OTHER = { id: "other", label: "World", color: "#cbd5e1", words: [] };
  const CAT_BY_ID = Object.fromEntries([...CATEGORIES, OTHER].map((c) => [c.id, c]));

  // ---------------------------------------------------------------- helpers
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function timeAgo(date) {
    const s = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  // ---------------------------------------------------------------- safety
  // Headlines, links and images come from outside sources (news feeds, GDELT,
  // the saved data files), so treat every value as untrusted: only http(s)
  // links, only https images, text set with textContent (never innerHTML),
  // and lengths and counts capped.
  const MAX_ARTICLES = 3000;
  const MAX_RESPONSE_CHARS = 8 * 1024 * 1024;
  function safeUrl(u, httpsOnly = false) {
    if (typeof u !== "string" || u.length > 2048) return "";
    try {
      const url = new URL(u);
      if (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) return url.href;
    } catch (_) { /* not a URL */ }
    return "";
  }
  const safeText = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

  function cleanTitle(t) {
    return safeText(t, 400)
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "") // control and direction-override characters
      .replace(/\s+([,.;:!?%])/g, "$1")
      .replace(/(\d) - (?=[\p{L}\d])/gu, "$1-") // GDELT spaces out hyphens: "31 - Year - Old"
      .replace(/([\p{L}\d]) - (?=\p{Ll})/gu, "$1-") // "ex - strongman"
      .replace(/(-[\p{L}\d]+) - (?=[\p{L}\d])/gu, "$1-") // continue a chain: "31-Year - Old"
      .replace(/(-[\p{L}\d]+) - (?=[\p{L}\d])/gu, "$1-")
      .replace(/\s+'\s*s\b/g, "'s")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ---------------------------------------------------------------- projection (Equal Earth, matches the pre-built map)
  const W = window.WORLD;
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  function project(lat, lon) {
    const lambda = (lon * Math.PI) / 180, phi = (lat * Math.PI) / 180;
    const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
    const x = (lambda * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
    const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
    return [500 + W.scale * x, W.ty - W.scale * y];
  }

  // ---------------------------------------------------------------- geocoding
  const geo = (function () {
    const G = window.GAZETTEER;
    const tiers = [new Map(), new Map(), new Map()];
    const countryByAlias = new Map();
    function add(alias, place) {
      const tier = G.lowPriority.has(alias) ? 2 : place.city ? 0 : 1;
      if (!tiers[tier].has(alias)) tiers[tier].set(alias, place);
    }
    for (const [name, lat, lon, ...aliases] of G.cities) {
      const place = { name, lat, lon, city: true };
      for (const a of [name, ...aliases]) add(a, place);
    }
    for (const [worldName, ...aliases] of G.countries) {
      const c = W.centroids[worldName];
      if (!c) continue;
      const display = worldName === "United States of America" ? "United States"
        : worldName === "Macedonia" ? "North Macedonia"
        : /\./.test(worldName) && aliases[0] ? aliases[0] : worldName;
      const place = { name: display, lat: c[0], lon: c[1], city: false };
      for (const a of [worldName, ...aliases]) {
        add(a, place);
        countryByAlias.set(a.toLowerCase(), place);
      }
    }
    const regexes = tiers.map((m) => {
      const keys = [...m.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
      return new RegExp("(?<![\\p{L}\\p{N}])(" + keys.join("|") + ")(?![\\p{L}\\p{N}])", "gu");
    });
    return {
      locate(title) {
        for (let t = 0; t < 3; t++) {
          regexes[t].lastIndex = 0;
          const m = regexes[t].exec(title);
          if (m) return { ...tiers[t].get(m[1]), precise: true };
        }
        return null;
      },
      country(name) {
        if (!name) return null;
        const p = countryByAlias.get(String(name).toLowerCase());
        return p ? { ...p, precise: false } : null;
      },
    };
  })();

  // ---------------------------------------------------------------- categorisation
  const catMatchers = CATEGORIES.map((c) => ({
    id: c.id,
    re: new RegExp("(?<![\\p{L}\\p{N}])(" + c.words.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", "giu"),
  }));
  function categorise(title) {
    let best = OTHER.id, bestScore = 0;
    for (const { id, re } of catMatchers) {
      re.lastIndex = 0;
      const n = (title.match(re) || []).length;
      if (n > bestScore) { best = id; bestScore = n; }
    }
    return best;
  }

  // ---------------------------------------------------------------- icons
  // Pick a marker icon from the headline (see js/icons.js for the word lists).
  const iconMatchers = window.ICONS.map((icon) => {
    const exact = icon.words.filter((w) => /[A-Z]/.test(w));
    const loose = icon.words.filter((w) => !/[A-Z]/.test(w));
    const build = (words, flags) => words.length
      ? new RegExp("(?<![\\p{L}\\p{N}])(" + words.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", flags)
      : null;
    return { icon, exact: build(exact, "u"), loose: build(loose, "iu") };
  });
  const ICON_BY_ID = Object.fromEntries([...window.ICONS, window.ICON_DEFAULT].map((i) => [i.id, i]));
  function pickIcon(title) {
    for (const m of iconMatchers) {
      if ((m.exact && m.exact.test(title)) || (m.loose && m.loose.test(title))) return m.icon.id;
    }
    return window.ICON_DEFAULT.id;
  }

  // ---------------------------------------------------------------- data
  function parseSeen(s) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || "");
    return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date();
  }

  function toStory(a) {
    if (!a || typeof a !== "object") return null;
    const title = cleanTitle(a.title);
    if (title.length < 12) return null;
    // Look for a place in the headline, then in the summary (RSS feeds have one),
    // and finally fall back to the outlet's country.
    const summary = safeText(a.summary, 400);
    const country = safeText(a.sourcecountry, 60);
    const place = geo.locate(title) || (summary && geo.locate(summary)) || geo.country(country);
    if (!place) return null;
    const url = safeUrl(a.url);
    if (!url && !a.demo) return null; // a story without a safe link isn't shown
    let time = Number.isFinite(a.time) ? new Date(a.time) : parseSeen(safeText(a.seendate, 20));
    if (time.getTime() > Date.now()) time = new Date(); // no stories "from the future"
    return {
      title,
      url,
      domain: safeText(a.domain, 80) || (url ? new URL(url).hostname : ""),
      time,
      image: safeUrl(a.socialimage, true),
      cat: categorise(title),
      icon: pickIcon(title),
      place: place.name,
      lat: place.lat,
      lon: place.lon,
      precise: place.precise,
      demo: !!a.demo,
      src: country,
      summary,
    };
  }

  async function fetchJSON(url, ms = 45000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (text.length > MAX_RESPONSE_CHARS) throw new Error("Response too large");
      return JSON.parse(text); // GDELT sends plain-text errors, which throw here
    } finally {
      clearTimeout(timer);
    }
  }

  function gdeltUrl({ q, sort }) {
    const p = new URLSearchParams({
      query: q + " sourcelang:english",
      mode: "ArtList",
      format: "json",
      maxrecords: "250",
      timespan: "24h",
      sort,
    });
    return GDELT + "?" + p.toString();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- state
  const state = {
    stories: [],
    active: new Set([...CATEGORIES, OTHER].map((c) => c.id)),
    selected: null,
    source: "loading", // live | cache | demo
    updated: null,
    terms: [], // search words, lowercased
  };

  // A story is shown when its topic is switched on and it matches the search.
  function matchesSearch(s) {
    if (!state.terms.length) return true;
    if (!s._hay) s._hay = [s.title, s.place, s.domain, ICON_BY_ID[s.icon].label, CAT_BY_ID[s.cat].label].join(" ").toLowerCase();
    return state.terms.every((t) => s._hay.includes(t));
  }
  const isShown = (s) => state.active.has(s.cat) && matchesSearch(s);
  const seen = new Set();
  const keyOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 70);

  function addArticles(articles) {
    let added = 0;
    if (!Array.isArray(articles)) return 0;
    for (const a of articles.slice(0, MAX_ARTICLES)) {
      const s = toStory(a);
      if (!s) continue;
      const k = keyOf(s.title);
      if (seen.has(k)) continue;
      seen.add(k);
      state.stories.push(s);
      added++;
    }
    state.stories.sort((a, b) => b.time - a.time);
    const cutoff = Date.now() - 26 * 60 * 60 * 1000;
    if (state.stories.some((s) => s.time < cutoff)) {
      state.stories = state.stories.filter((s) => s.time >= cutoff);
      seen.clear();
      for (const s of state.stories) seen.add(keyOf(s.title));
    }
    return added;
  }

  function resetStories() {
    state.stories = [];
    seen.clear();
  }

  function saveCache(articles) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), articles }));
    } catch (_) { /* storage full or disabled */ }
  }
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && Number.isFinite(c.at) && Date.now() - c.at < CACHE_MAX_AGE && Array.isArray(c.articles) && c.articles.length) return c;
    } catch (_) { /* ignore */ }
    return null;
  }

  function demoArticles() {
    const now = Date.now();
    return window.DEMO_HEADLINES.map((title, i) => ({
      title, demo: true, domain: "sample", time: now - (i * 37 + 5) * 60000,
    }));
  }

  // GDELT is often slow (10-20 s) and turns away requests that come too close
  // together, so retry once after a pause.
  async function fetchGdelt(query) {
    try {
      return await fetchJSON(gdeltUrl(query));
    } catch (err) {
      if (err.name === "AbortError") throw err;
      await sleep(8000);
      return fetchJSON(gdeltUrl(query));
    }
  }

  // A copy of recent headlines saved every 30 minutes by a GitHub Action
  // (.github/workflows/headlines.yml) on the repo's "data" branch. It loads
  // instantly, so the map isn't empty while GDELT is slow.
  // Where the saved files live: the repo's "data" branch on GitHub. A
  // <meta name="data-base"> tag can point somewhere else (e.g. for testing).
  function dataBase() {
    const meta = document.querySelector('meta[name="data-base"]');
    if (meta && meta.content) return meta.content.replace(/\/?$/, "/");
    const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return null;
    const first = location.pathname.split("/").filter(Boolean)[0];
    const repo = first && !first.includes(".") ? first : m[1] + ".github.io";
    return `https://raw.githubusercontent.com/${m[1]}/${repo}/data/`;
  }
  function snapshotUrl() {
    const base = dataBase();
    return base && base + "headlines.json";
  }
  async function loadSnapshot() {
    const url = snapshotUrl();
    if (!url) return null;
    try {
      const snap = await fetchJSON(url, 10000);
      return snap && Number.isFinite(snap.at) && Array.isArray(snap.articles) && snap.articles.length ? snap : null;
    } catch (err) {
      console.warn("Saved headlines unavailable:", err);
      return null;
    }
  }

  function showDemo() {
    addArticles(demoArticles());
    state.source = "demo";
    state.updated = new Date();
    renderAll();
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    setStatus("loading");
    const firstLoad = !state.stories.length;

    // 1. Show something quickly: the saved snapshot, else this browser's cache.
    const snap = await loadSnapshot();
    if (snap && Date.now() - snap.at < CACHE_MAX_AGE) {
      if (state.source !== "live") resetStories();
      addArticles(snap.articles);
      if (state.source !== "live" || snap.at > state.updated) state.updated = new Date(snap.at);
      state.source = "live";
      renderAll();
    } else if (firstLoad) {
      const cache = loadCache();
      if (cache) {
        addArticles(cache.articles);
        state.source = "cache";
        state.updated = new Date(cache.at);
        renderAll();
      }
    }
    setStatus("loading");

    // 2. Then ask GDELT for the very latest.
    const raw = [];
    for (let i = 0; i < QUERIES.length; i++) {
      if (i > 0) await sleep(6000);
      try {
        const data = await fetchGdelt(QUERIES[i]);
        const arts = (data.articles || []).filter((a) => !a.language || a.language === "English");
        if (state.source !== "live") resetStories();
        raw.push(...arts);
        addArticles(arts);
        state.source = "live";
        state.updated = new Date();
        renderAll();
      } catch (err) {
        console.warn("News request failed:", err);
        if (!state.stories.length) showDemo();
      }
    }

    if (raw.length || snap) {
      const keep = state.stories.slice(0, 600);
      saveCache(keep.map((s) => ({ title: s.title, url: s.url, domain: s.domain, time: s.time.getTime(), socialimage: s.image, sourcecountry: s.src })));
    }
    if (!state.stories.length) showDemo();
    loading = false;
    setStatus();
  }

  // ---------------------------------------------------------------- map
  // Two layers: the base map (countries, night, names) is one SVG that the
  // browser slides and scales on the graphics card while you pan or zoom, and
  // is only redrawn once the map settles. Markers live in a separate SVG, so
  // pulsing icons don't make the whole map redraw.
  const svg = $("#map");
  const msvg = $("#markers");
  const wrap = $("#map-wrap");
  // Pulsing rings are plain HTML elements above the markers: the graphics card
  // animates them without repainting anything, unlike rings inside the SVG.
  const pulseLayer = el("div", { class: "pulses", "aria-hidden": "true" });
  const world = svgEl("g", { class: "world" });
  const graticule = svgEl("g", { class: "graticule" });
  const land = svgEl("g", { class: "land" });
  const dotsLayer = svgEl("g", { class: "dots" });
  const night = svgEl("g", { class: "night" });
  const labels = svgEl("g", { class: "labels" });
  world.append(graticule, land, night, labels);
  svg.setAttribute("width", W.w);
  svg.setAttribute("height", W.h);
  svg.setAttribute("viewBox", `0 0 ${W.w} ${W.h}`);
  svg.append(world);
  msvg.append(dotsLayer);
  msvg.after(pulseLayer);

  // icon symbols, used by every marker and by the story panel
  (function defineIcons() {
    const defs = svgEl("defs");
    for (const icon of Object.values(ICON_BY_ID)) {
      const sym = svgEl("symbol", {
        id: "i-" + icon.id, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      sym.innerHTML = icon.svg; // fixed strings from js/icons.js, never outside data
      sym.querySelectorAll(".f").forEach((n) => { n.setAttribute("fill", "currentColor"); n.setAttribute("stroke", "none"); });
      defs.append(sym);
    }
    msvg.prepend(defs);
  })();

  let sphereD = "";
  // sphere outline + graticule
  (function drawBase() {
    const line = (pts) => "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
    const outline = [];
    for (let lat = -57; lat <= 84; lat += 1) outline.push(project(lat, 180));
    for (let lat = 84; lat >= -57; lat -= 1) outline.push(project(lat, -180));
    sphereD = line(outline) + "Z";
    graticule.append(svgEl("path", { class: "sphere", d: sphereD }));
    const clip = svgEl("clipPath", { id: "sphere-clip" });
    clip.append(svgEl("path", { d: line(outline) + "Z" }));
    graticule.append(clip);
    let d = "";
    for (let lon = -180; lon <= 180; lon += 30) {
      const pts = [];
      for (let lat = -57; lat <= 84; lat += 2) pts.push(project(lat, lon));
      d += line(pts);
    }
    for (let lat = -30; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 3) pts.push(project(lat, lon));
      d += line(pts);
    }
    graticule.append(svgEl("path", { class: "grid", d }));
    for (const c of W.countries) {
      const p = svgEl("path", { d: c.d });
      p.appendChild(svgEl("title")).textContent = c.n;
      land.append(p);
    }
  })();

  // ---------------------------------------------------------------- day and night
  // Shade the part of the world where it's currently night. The sun's
  // position comes from the date and time (good to within about a degree).
  (function () {
    const defs = svgEl("defs");
    // ocean deepens towards the edges; land is lit slightly from the north
    const ocean = svgEl("radialGradient", { id: "ocean-grad", gradientUnits: "userSpaceOnUse", cx: "500", cy: "190", r: "560" });
    // stop colours come from the theme (see --ocean-* and --land-* in styles.css)
    ocean.append(svgEl("stop", { offset: "0", class: "ocean-0" }), svgEl("stop", { offset: "0.6", class: "ocean-1" }), svgEl("stop", { offset: "1", class: "ocean-2" }));
    const ground = svgEl("linearGradient", { id: "land-grad", gradientUnits: "userSpaceOnUse", x1: "0", y1: "0", x2: "0", y2: "435" });
    ground.append(svgEl("stop", { offset: "0", class: "land-0" }), svgEl("stop", { offset: "0.5", class: "land-1" }), svgEl("stop", { offset: "1", class: "land-2" }));
    defs.append(ocean, ground);
    svg.append(defs);
  })();
  // Drawn once a minute onto a canvas and shown as an image: a live blur
  // filter would have to be recalculated on every frame of a pan or zoom.
  const nightImg = svgEl("image", { x: 0, y: 0, width: W.w, height: W.h, preserveAspectRatio: "none" });
  night.append(nightImg);
  function drawNight() {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = (now - start) / 86400000;
    const rad = Math.PI / 180;
    let decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
    if (Math.abs(decl) < 0.1) decl = 0.1;
    // equation of time (minutes), so the shadow lines up with real solar noon
    const b = ((2 * Math.PI) / 364) * (day - 81);
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const sunLon = -15 * (utcHours - 12 + eot / 60);
    const clampLat = (v) => Math.max(-57, Math.min(84, v));
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      const lat = Math.atan(-Math.cos((lon - sunLon) * rad) / Math.tan(decl * rad)) / rad;
      pts.push(project(clampLat(lat), lon));
    }
    const pole = decl > 0 ? -57 : 84; // the pole tilted away from the sun is in darkness
    for (let lon = 180; lon >= -180; lon -= 4) pts.push(project(pole, lon));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W.w * scale;
    canvas.height = W.h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.clip(new Path2D(sphereD)); // keep the shadow inside the globe outline
    if ("filter" in ctx) ctx.filter = "blur(5px)"; // soft dusk edge where supported
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--night").trim() || "rgba(2, 6, 20, 0.42)";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    nightImg.setAttribute("href", canvas.toDataURL("image/png"));
  }

  // ---------------------------------------------------------------- country names
  const SHORT_NAMES = {
    "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Central African Rep.": "C. African Rep.",
    "Bosnia and Herz.": "Bosnia", "S. Sudan": "South Sudan", "Dominican Rep.": "Dominican Rep.", "W. Sahara": "W. Sahara",
  };
  const countryLabels = [];
  // Size each label by the country's largest piece of land, so overseas
  // islands and the date line (Alaska, Fiji, Kiribati) don't inflate it.
  function mainlandBox(d, probe) {
    let best = null;
    for (const part of d.split(/(?=M)/)) {
      probe.setAttribute("d", part);
      const b = probe.getBBox();
      if (!best || b.width * b.height > best.width * best.height) best = b;
    }
    return best;
  }
  function buildLabels() {
    const probe = svgEl("path");
    labels.append(probe);
    land.querySelectorAll("path").forEach((p, i) => {
      const c = W.countries[i];
      const cen = W.centroids[c.n];
      if (!cen || /Antarctic|Is\.$|Ter\.$/.test(c.n)) return;
      const box = mainlandBox(c.d, probe);
      if (box.width < 6) return;
      const name = (SHORT_NAMES[c.n] || c.n).toUpperCase();
      const [x, y] = project(cen[0], cen[1]);
      const t = svgEl("text", { x: x.toFixed(1), y: y.toFixed(1) });
      t.textContent = name;
      labels.append(t);
      countryLabels.push({ t, w: Math.min(box.width, box.height * 2.2), len: name.length });
    });
    probe.remove();
  }
  let labelK = 0;
  function updateLabels() {
    if (view.k === labelK) return;
    labelK = view.k;
    const fs = 9.5 / view.k;
    labels.setAttribute("font-size", fs.toFixed(3));
    labels.setAttribute("stroke-width", (3 / view.k).toFixed(3));
    // borders and outlines stay the same thickness on screen at every zoom
    land.setAttribute("stroke-width", (0.6 / view.k).toFixed(4));
    graticule.setAttribute("stroke-width", (0.9 / view.k).toFixed(4));
    for (const l of countryLabels) {
      // show a name only where the country is wide enough on screen to hold it
      l.t.style.display = l.w * view.k > l.len * 7.2 + 10 ? "" : "none";
    }
  }

  const view = { w: 0, h: 0, k0: 1, k: 1, x: 0, y: 0 };
  const MAP_W = W.w, MAP_H = W.h;

  function fit() {
    const r = wrap.getBoundingClientRect();
    const prev = { ...view };
    view.w = r.width;
    view.h = r.height;
    msvg.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
    view.k0 = Math.min(view.w / MAP_W, view.h / MAP_H) * 0.98;
    if (!prev.w) {
      // on tall, narrow screens start a little zoomed in so the map fills the frame
      const fill = Math.min(1.8, Math.max(1, view.h / (MAP_H * view.k0) * 0.8));
      const k = view.k0 * fill;
      Object.assign(view, targetFor(k, view.w / 2 - (MAP_W * 0.53) * k, view.h / 2 - (MAP_H * 0.42) * k));
      apply();
    } else {
      // keep the same centre when the window is resized
      const cx = (prev.w / 2 - prev.x) / prev.k, cy = (prev.h / 2 - prev.y) / prev.k;
      const ratio = prev.k / prev.k0;
      view.k = view.k0 * ratio;
      view.x = view.w / 2 - cx * view.k;
      view.y = view.h / 2 - cy * view.k;
      clamp();
      apply();
    }
  }

  function clamp() {
    view.k = Math.min(Math.max(view.k, view.k0), view.k0 * 14);
    const mw = MAP_W * view.k, mh = MAP_H * view.k;
    view.x = mw <= view.w ? (view.w - mw) / 2 : Math.min(0, Math.max(view.w - mw, view.x));
    view.y = mh <= view.h ? (view.h - mh) / 2 : Math.min(0, Math.max(view.h - mh, view.y));
  }

  let animFrame = null;
  function animateTo(target, ms = 450) {
    cancelAnimationFrame(animFrame);
    const from = { k: view.k, x: view.x, y: view.y };
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      view.k = from.k + (target.k - from.k) * e;
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      apply();
      if (t < 1) animFrame = requestAnimationFrame(step);
    };
    animFrame = requestAnimationFrame(step);
  }

  function targetFor(k, x, y) {
    const saved = { ...view };
    Object.assign(view, { k, x, y });
    clamp();
    const t = { k: view.k, x: view.x, y: view.y };
    Object.assign(view, saved);
    return t;
  }

  function zoomAt(factor, sx, sy, animate) {
    const k = Math.min(Math.max(view.k * factor, view.k0), view.k0 * 14);
    const f = k / view.k;
    const t = targetFor(k, sx - (sx - view.x) * f, sy - (sy - view.y) * f);
    if (animate) animateTo(t, 280);
    else { Object.assign(view, t); apply(); }
  }

  function reset(animate = true) {
    const t = targetFor(view.k0, 0, 0);
    if (animate) animateTo(t);
    else { Object.assign(view, t); apply(); }
  }

  function centreOn(story, minZoom) {
    const k = Math.max(view.k, view.k0 * (minZoom || 1));
    const t = targetFor(k, view.w / 2 - story._x * k, view.h / 2 - story._y * k);
    animateTo(t);
  }

  // At world view only the newest few markers at each spot are shown, with a
  // "+N" badge; zooming in reveals the rest.
  let lastLimit = -1;
  function updateCrowding() {
    // while searching, show every match instead of grouping them behind a badge
    const limit = state.terms.length ? Infinity : Math.max(4, Math.floor(4 * Math.pow(view.k / view.k0, 2)));
    if (limit === lastLimit) return;
    lastLimit = limit;
    for (const s of state.stories) {
      if (!s._node) continue;
      s._node.classList.toggle("crowded", s._n >= limit && s !== state.selected);
      if (s._badge) {
        const more = s._spotSize - Math.min(limit, s._spotSize);
        s._badge.style.display = more > 0 ? "" : "none";
        s._badge.querySelector("text").textContent = "+" + (more > 99 ? 99 : more);
      }
    }
  }

  // While the map moves, the base layer is a GPU-scaled picture (blurry for a
  // moment when zooming); 150 ms after it stops it is redrawn sharp.
  let settleTimer = null;
  let moving = false;
  function settle() {
    moving = false;
    svg.classList.remove("moving");
    updateLabels();
  }
  // rings for stories from the last hour (newest at each spot) and the selected story
  let pulsing = [];
  function syncPulses() {
    const now = Date.now();
    const want = state.stories.filter((s) => s._node && isShown(s) && s._top && now - s.time < 60 * 60 * 1000);
    if (state.selected && !want.includes(state.selected)) want.push(state.selected);
    for (const s of pulsing) if (!want.includes(s)) { s._pulse.remove(); s._pulse = null; }
    for (const s of want) {
      if (!s._pulse) {
        s._pulse = el("span", { class: "pulse-ring", style: `--c:${CAT_BY_ID[s.cat].color}` });
        s._pulse.append(el("span"));
        pulseLayer.append(s._pulse);
      }
      s._pulse.classList.toggle("selected", s === state.selected);
    }
    pulsing = want;
    placePulses();
  }
  function placePulses() {
    for (const s of pulsing) {
      const hidden = s._node.classList.contains("crowded") && s !== state.selected;
      s._pulse.style.display = hidden ? "none" : "";
      s._pulse.style.transform = `translate(${(view.x + s._x * view.k).toFixed(1)}px, ${(view.y + s._y * view.k).toFixed(1)}px)`;
    }
  }

  function apply() {
    updateCrowding();
    if (!moving) {
      moving = true;
      svg.classList.add("moving");
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 150);
    svg.style.transform = `translate(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px) scale(${view.k.toFixed(5)})`;
    // markers grow a little as you zoom in (up to 1.5×) so icons stay readable
    const z = Math.min(1.5, 0.8 + 0.25 * Math.log2(view.k / view.k0 + 1)).toFixed(3);
    for (const s of state.stories) {
      if (!s._node) continue;
      s._node.setAttribute("transform", `translate(${(view.x + s._x * view.k).toFixed(1)},${(view.y + s._y * view.k).toFixed(1)}) scale(${z})`);
    }
    placePulses();
    $("#zoom-level").textContent = (view.k / view.k0).toFixed(1) + "×";
  }

  // lay out dots: stories at the same spot fan out in a small sunflower spiral
  function layoutDots() {
    const groups = new Map();
    for (const s of state.stories) {
      const [x, y] = project(s.lat, s.lon);
      const k = x.toFixed(0) + "," + y.toFixed(0);
      const n = groups.get(k) || 0;
      groups.set(k, n + 1);
      const r = n === 0 ? 0 : 2 * Math.sqrt(n);
      const a = n * 2.39996;
      s._x = x + r * Math.cos(a);
      s._y = y + r * Math.sin(a);
      s._spot = k;
      s._top = n === 0; // newest story at this spot (stories are sorted newest first)
      s._n = n;
    }
    for (const s of state.stories) s._spotSize = groups.get(s._spot);
    lastLimit = -1;
  }

  function renderDots() {
    dotsLayer.textContent = "";
    layoutDots();
    const now = Date.now();
    // draw oldest first so the newest sit on top
    for (let i = state.stories.length - 1; i >= 0; i--) {
      const s = state.stories[i];
      s._i = i;
      const cat = CAT_BY_ID[s.cat];
      const g = svgEl("g", { class: "dot", "data-i": i, style: `--c:${cat.color}` });
      if (!s.precise) g.classList.add("approx");
      if (!isShown(s)) g.classList.add("hidden");
      if (s === state.selected) g.classList.add("selected");
      const mk = svgEl("g", { class: "mk" });
      mk.append(
        svgEl("circle", { class: "hit", r: 12 }),
        svgEl("circle", { class: "core", r: 8.5 }),
        svgEl("use", { class: "glyph", href: "#i-" + s.icon, x: -5.5, y: -5.5, width: 11, height: 11 })
      );
      if (s._top && s._spotSize > 1) {
        const badge = svgEl("g", { class: "badge", transform: "translate(8 -8)" });
        badge.append(svgEl("rect", { x: -7, y: -5, width: 14, height: 10, rx: 5 }), svgEl("text", { y: 0.5 }));
        mk.append(badge);
        s._badge = badge;
      } else {
        s._badge = null;
      }
      g.append(mk);
      s._node = g;
      dotsLayer.append(g);
    }
    for (const s of pulsing) if (s._pulse) s._pulse.remove(), (s._pulse = null);
    pulsing = [];
    apply();
    syncPulses();
  }

  // ---------------------------------------------------------------- pointer interaction
  const pointers = new Map();
  let drag = null, pinch = null;
  const tooltip = $("#tooltip");

  function storyFromEvent(e) {
    const g = e.target.closest && e.target.closest(".dot");
    return g ? state.stories[+g.dataset.i] : null;
  }
  // map controls that sit on top of the map handle their own clicks and scrolling
  const ON_CONTROLS = ".zoom, .key-btn, .key-panel, .tooltip";
  function localPoint(e) {
    const r = wrap.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  wrap.addEventListener("pointerdown", (e) => {
    if (e.target.closest(ON_CONTROLS)) return;
    wrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    cancelAnimationFrame(animFrame);
    if (pointers.size === 1) {
      const [x, y] = localPoint(e);
      drag = { sx: x, sy: y, vx: view.x, vy: view.y, moved: false, story: storyFromEvent(e) };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, vx: view.x, vy: view.y };
      drag = null;
    }
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) {
      // hover tooltip (mouse only)
      if (e.pointerType === "mouse") showTooltip(storyFromEvent(e), e);
      return;
    }
    pointers.set(e.pointerId, localPoint(e));
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const k = Math.min(Math.max(pinch.k * (d / pinch.d), view.k0), view.k0 * 14);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      Object.assign(view, { k, x: mx - (pinch.mx - pinch.vx) * (k / pinch.k), y: my - (pinch.my - pinch.vy) * (k / pinch.k) });
      clamp();
      apply();
    } else if (drag) {
      const [x, y] = localPoint(e);
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 5) {
        drag.moved = true;
        wrap.classList.add("dragging");
        hideTooltip();
      }
      if (drag.moved) {
        view.x = drag.vx + (x - drag.sx);
        view.y = drag.vy + (y - drag.sy);
        clamp();
        apply();
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && pointers.size === 0) {
      if (!drag.moved && e.type === "pointerup") {
        if (drag.story) select(drag.story, { from: "map" });
      }
      drag = null;
      wrap.classList.remove("dragging");
    }
  }
  wrap.addEventListener("pointerup", endPointer);
  wrap.addEventListener("pointercancel", endPointer);
  wrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTooltip(); });

  wrap.addEventListener("wheel", (e) => {
    if (e.target.closest(ON_CONTROLS)) return;
    e.preventDefault();
    const [x, y] = localPoint(e);
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), x, y, false);
  }, { passive: false });

  wrap.addEventListener("dblclick", (e) => {
    if (e.target.closest(ON_CONTROLS)) return;
    const [x, y] = localPoint(e);
    zoomAt(e.shiftKey ? 0.5 : 2, x, y, true);
  });

  $("#zoom-in").addEventListener("click", () => zoomAt(1.8, view.w / 2, view.h / 2, true));
  $("#zoom-out").addEventListener("click", () => zoomAt(1 / 1.8, view.w / 2, view.h / 2, true));
  $("#zoom-reset").addEventListener("click", () => reset(true));

  function showTooltip(story, e) {
    if (!story || !isShown(story)) return hideTooltip();
    const [x, y] = localPoint(e);
    tooltip.querySelector(".tt-place").textContent = story.place + " · " + ICON_BY_ID[story.icon].label;
    tooltip.querySelector(".tt-title").textContent = story.title;
    tooltip.style.setProperty("--c", CAT_BY_ID[story.cat].color);
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let tx = x + 14, ty = y - th - 12;
    if (tx + tw > view.w - 8) tx = x - tw - 14;
    if (ty < 8) ty = y + 16;
    tooltip.style.transform = `translate(${Math.max(8, tx)}px, ${ty}px)`;
    wrap.classList.add("over-dot");
  }
  function hideTooltip() {
    tooltip.hidden = true;
    wrap.classList.remove("over-dot");
  }

  // ---------------------------------------------------------------- story panel
  const panel = $("#story");

  function visibleStories() {
    return state.stories.filter(isShown);
  }

  function select(story, opts = {}) {
    if (state.selected && state.selected._node) state.selected._node.classList.remove("selected");
    state.selected = story;
    msvg.classList.toggle("has-selection", !!story);
    if (pulsing.length || story) syncPulses();
    if (story && story._node) {
      story._node.classList.add("selected");
      story._node.classList.remove("crowded");
      dotsLayer.append(story._node); // bring to front
    }
    renderStory();
    if (story && opts.from !== "map") {
      const sx = view.x + story._x * view.k, sy = view.y + story._y * view.k;
      const margin = 40;
      if (sx < margin || sy < margin || sx > view.w - margin || sy > view.h - margin || opts.zoom) centreOn(story, opts.zoom ? 2.5 : 1);
    }
  }

  function step(dir) {
    const list = visibleStories();
    if (!list.length) return;
    let i = state.selected ? list.indexOf(state.selected) : -1;
    i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    select(list[i]);
  }

  function renderStory() {
    const s = state.selected;
    panel.classList.toggle("empty", !s);
    panel.style.setProperty("--sel", s ? CAT_BY_ID[s.cat].color : "transparent");
    if (!s) {
      panel.querySelector(".story-body").hidden = true;
      panel.querySelector(".story-empty").hidden = false;
      return;
    }
    panel.querySelector(".story-empty").hidden = true;
    const body = panel.querySelector(".story-body");
    body.hidden = false;
    const cat = CAT_BY_ID[s.cat];
    body.style.setProperty("--c", cat.color);
    const catEl = body.querySelector(".story-cat");
    catEl.textContent = "";
    const ic = svgEl("svg", { class: "story-icon", viewBox: "0 0 24 24", "aria-hidden": "true" });
    ic.append(svgEl("use", { href: "#i-" + s.icon }));
    catEl.append(ic, document.createTextNode(ICON_BY_ID[s.icon].label));
    catEl.title = "Topic: " + cat.label;
    body.querySelector(".story-place").textContent = s.place;
    body.querySelector(".story-place").title = s.precise
      ? "Placed using the place named in the headline"
      : "No place named in the headline — placed at the news outlet's country";
    body.querySelector(".story-approx").hidden = s.precise;
    body.querySelector(".story-time").textContent = timeAgo(s.time) + " · " +
      s.time.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    body.querySelector(".story-time").dateTime = s.time.toISOString();
    const h = body.querySelector(".story-title");
    h.textContent = s.title;
    const link = body.querySelector(".story-link");
    if (s.url) {
      link.hidden = false;
      link.href = s.url;
      link.querySelector(".story-domain").textContent = s.domain;
    } else {
      link.hidden = true;
    }
    body.querySelector(".story-sample").hidden = !s.demo;

    const img = body.querySelector(".story-img");
    const fig = body.querySelector(".story-figure");
    if (s.image && /^https:\/\//.test(s.image)) {
      fig.hidden = false;
      fig.classList.remove("loaded");
      img.onload = () => fig.classList.add("loaded");
      img.onerror = () => { fig.hidden = true; };
      img.src = s.image;
    } else {
      fig.hidden = true;
      img.removeAttribute("src");
    }

    // other stories at the same spot
    const nearby = state.stories.filter((o) => o !== s && o._spot === s._spot && isShown(o)).slice(0, 4);
    const more = body.querySelector(".story-more");
    const list = more.querySelector("ul");
    list.textContent = "";
    more.hidden = !nearby.length;
    more.querySelector(".more-place").textContent = s.place;
    for (const o of nearby) {
      const b = el("button", { type: "button", style: `--c:${CAT_BY_ID[o.cat].color}` }, o.title);
      b.addEventListener("click", () => select(o));
      const li = el("li");
      li.append(b);
      list.append(li);
    }

    const vis = visibleStories();
    const idx = vis.indexOf(s);
    $("#story-count").textContent = idx >= 0 ? `${idx + 1} / ${vis.length}` : "";
  }

  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  $("#random").addEventListener("click", () => {
    const list = visibleStories();
    if (list.length) select(list[Math.floor(Math.random() * list.length)], { zoom: true });
  });
  $("#close").addEventListener("click", () => select(null));
  $("#start").addEventListener("click", () => step(1));

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowRight" || e.key === "j") { step(1); e.preventDefault(); }
    else if (e.key === "ArrowLeft" || e.key === "k") { step(-1); e.preventDefault(); }
    else if (e.key === "Escape") select(null);
    else if (e.key === "+" || e.key === "=") zoomAt(1.8, view.w / 2, view.h / 2, true);
    else if (e.key === "-") zoomAt(1 / 1.8, view.w / 2, view.h / 2, true);
    else if (e.key === "0") reset(true);
  });

  // ---------------------------------------------------------------- filters
  const filters = $("#filters");
  function renderFilters() {
    const counts = {};
    for (const s of state.stories) counts[s.cat] = (counts[s.cat] || 0) + 1;
    filters.textContent = "";
    for (const c of [...CATEGORIES, OTHER]) {
      const n = counts[c.id] || 0;
      const b = el("button", { type: "button", class: "chip", "aria-pressed": String(state.active.has(c.id)), style: `--c:${c.color}` });
      b.append(el("span", { class: "swatch", "aria-hidden": "true" }), el("span", { class: "chip-label" }, c.label), el("span", { class: "chip-n" }, String(n)));
      if (!n) b.classList.add("zero");
      b.title = "Click to show/hide · double-click to show only this";
      b.addEventListener("click", (e) => {
        if (e.detail > 1) return;
        if (state.active.has(c.id)) state.active.delete(c.id);
        else state.active.add(c.id);
        applyFilters();
      });
      b.addEventListener("dblclick", () => {
        state.active = new Set([c.id]);
        applyFilters();
      });
      filters.append(b);
    }
    const all = el("button", { type: "button", class: "chip chip-all" }, "Show all");
    all.addEventListener("click", () => {
      state.active = new Set([...CATEGORIES, OTHER].map((c) => c.id));
      applyFilters();
    });
    filters.append(all);
  }
  function applyFilters() {
    for (const s of state.stories) if (s._node) s._node.classList.toggle("hidden", !isShown(s));
    lastLimit = -1;
    apply();
    syncPulses();
    filters.querySelectorAll(".chip:not(.chip-all)").forEach((b, i) => {
      const c = [...CATEGORIES, OTHER][i];
      b.setAttribute("aria-pressed", String(state.active.has(c.id)));
    });
    if (state.selected && !isShown(state.selected)) select(null);
    else renderStory();
    renderLatest();
    setStatus();
  }

  // ---------------------------------------------------------------- search
  const searchBox = $("#search");
  const searchInput = $("#search-input");
  const results = $("#search-results");
  let resultItems = [];
  let activeResult = -1;
  let searchTimer = null;

  function runSearch() {
    const q = searchInput.value.trim().toLowerCase().slice(0, 100);
    state.terms = q ? q.split(/\s+/).filter(Boolean) : [];
    searchBox.classList.toggle("has-text", !!searchInput.value);
    applyFilters();
    renderResults();
  }

  // Highlight the search words in a title, building DOM nodes (never HTML).
  function highlighted(text) {
    const frag = document.createDocumentFragment();
    if (!state.terms.length) { frag.append(text); return frag; }
    const re = new RegExp("(" + state.terms.map(escapeRe).join("|") + ")", "gi");
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      frag.append(el("mark", {}, m[0]));
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  function renderResults() {
    results.textContent = "";
    resultItems = [];
    activeResult = -1;
    if (!state.terms.length) { closeResults(); return; }
    const found = visibleStories();
    const head = el("li", { class: "results-head", role: "presentation" },
      found.length ? `${found.length} ${found.length === 1 ? "headline" : "headlines"} found · shown on the map` : "No headlines match");
    results.append(head);
    found.slice(0, 8).forEach((s, i) => {
      const li = el("li", { role: "option", id: "result-" + i, class: "result", style: `--c:${CAT_BY_ID[s.cat].color}` });
      const disc = el("span", { class: "latest-icon" });
      disc.append(iconEl(s.icon, "latest-svg"));
      const text = el("span", { class: "latest-text" });
      const title = el("span", { class: "result-title" });
      title.append(highlighted(s.title));
      text.append(title, el("span", { class: "latest-meta" }, [s.place, timeAgo(s.time), s.domain].filter(Boolean).join(" · ")));
      li.append(disc, text);
      li.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus in the box
      li.addEventListener("click", () => chooseResult(s));
      results.append(li);
      resultItems.push({ li, s });
    });
    results.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  }
  function closeResults() {
    results.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  }
  function chooseResult(s) {
    closeResults();
    select(s, { zoom: true });
  }
  function highlightResult(i) {
    if (!resultItems.length) return;
    activeResult = (i + resultItems.length) % resultItems.length;
    resultItems.forEach((r, j) => r.li.classList.toggle("active", j === activeResult));
    searchInput.setAttribute("aria-activedescendant", "result-" + activeResult);
    resultItems[activeResult].li.scrollIntoView({ block: "nearest" });
  }
  function clearSearch() {
    searchInput.value = "";
    runSearch();
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  });
  searchInput.addEventListener("focus", () => { if (state.terms.length) renderResults(); });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (results.hidden) renderResults(); highlightResult(activeResult + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightResult(activeResult - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimer);
      if (searchInput.value.trim().toLowerCase() !== state.terms.join(" ")) runSearch();
      const pick = resultItems[Math.max(0, activeResult)];
      if (pick) chooseResult(pick.s);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (!results.hidden) closeResults();
      else { clearSearch(); searchInput.blur(); }
    }
  });
  $("#search-clear").addEventListener("click", () => { clearSearch(); searchInput.focus(); });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#search")) closeResults(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input, textarea, select") && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // ---------------------------------------------------------------- latest list, ticker, key
  function iconEl(id, cls) {
    const ic = svgEl("svg", { class: cls, viewBox: "0 0 24 24", "aria-hidden": "true" });
    ic.append(svgEl("use", { href: "#i-" + id }));
    return ic;
  }

  function renderLatest() {
    const list = $("#latest");
    list.textContent = "";
    for (const s of visibleStories().slice(0, 6)) {
      const b = el("button", { type: "button", class: "latest-item", style: `--c:${CAT_BY_ID[s.cat].color}` });
      const disc = el("span", { class: "latest-icon" });
      disc.append(iconEl(s.icon, "latest-svg"));
      const text = el("span", { class: "latest-text" });
      text.append(el("span", { class: "latest-title" }, s.title), el("span", { class: "latest-meta" }, [s.place, timeAgo(s.time), s.domain].filter(Boolean).join(" · ")));
      b.append(disc, text);
      b.addEventListener("click", () => select(s, { zoom: true }));
      const li = el("li");
      li.append(b);
      list.append(li);
    }
  }

  function renderTicker() {
    const box = $("#ticker");
    const items = $("#ticker-items");
    const top = state.stories.filter((s) => !s.demo).slice(0, 14);
    box.hidden = top.length < 3;
    items.textContent = "";
    // the list is drawn twice so the scroll can loop without a gap
    for (let copy = 0; copy < 2; copy++) {
      for (const s of top) {
        const b = el("button", { type: "button", class: "ticker-item", style: `--c:${CAT_BY_ID[s.cat].color}` });
        if (copy) b.setAttribute("aria-hidden", "true"), b.tabIndex = -1;
        b.append(iconEl(s.icon, "ticker-icon"), el("span", { class: "ticker-place" }, s.place), document.createTextNode(" " + s.title));
        b.addEventListener("click", () => select(s, { zoom: true }));
        items.append(b);
      }
    }
    requestAnimationFrame(() => items.style.setProperty("--dur", Math.max(30, items.scrollWidth / 2 / 55) + "s"));
  }

  (function renderKey() {
    const list = $("#key-list");
    for (const icon of [...window.ICONS, window.ICON_DEFAULT]) {
      const li = el("li");
      li.append(iconEl(icon.id, "key-icon"), el("span", {}, icon.label));
      list.append(li);
    }
    const btn = $("#key-btn"), panel = $("#key-panel");
    const toggle = (open) => { panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => toggle(panel.hidden));
    document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !e.target.closest("#key-panel, #key-btn")) toggle(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });
  })();

  $("#dateline").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#dateline").dateTime = new Date().toISOString().slice(0, 10);
  $("#tab-markets").addEventListener("click", () => window.Earthwire.openStocks && window.Earthwire.openStocks());

  // ---------------------------------------------------------------- status
  function setStatus(mode) {
    const st = $("#status");
    const text = st.querySelector(".status-text");
    const banner = $("#banner");
    if (mode === "loading" && !state.stories.length) {
      st.dataset.mode = "loading";
      text.textContent = "Gathering headlines… this can take up to 30 seconds";
      return;
    }
    st.dataset.mode = state.source;
    const n = visibleStories().length;
    const label = { live: "Live", cache: "Saved", demo: "Sample", loading: "Loading" }[state.source];
    text.textContent = `${label} · ${n} ${n === 1 ? "story" : "stories"}` + (state.updated ? ` · updated ${timeAgo(state.updated)}` : "");
    if (loading && state.stories.length) text.textContent += " · refreshing…";
    banner.hidden = state.source === "live";
    banner.querySelector(".banner-text").textContent =
      state.source === "cache"
        ? "Couldn't reach the live news feed. Showing headlines saved from your last visit."
        : "Couldn't reach the live news feed, so these are made-up sample headlines to show how the map works.";
  }

  const storyListeners = [];
  function renderAll() {
    storyListeners.forEach((fn) => fn());
    const keep = state.selected;
    renderDots();
    renderFilters();
    renderLatest();
    renderTicker();
    if (state.terms.length && !results.hidden) renderResults();
    if (keep && state.stories.includes(keep)) select(keep, { from: "map" });
    else select(null);
    setStatus();
  }

  $("#refresh").addEventListener("click", () => load());
  $("#banner-retry").addEventListener("click", () => load());

  // ---------------------------------------------------------------- boot
  // shared with js/stocks.js
  window.Earthwire = {
    dataBase,
    fetchJSON,
    safeUrl,
    timeAgo,
    stories: () => state.stories,
    onStories: (fn) => storyListeners.push(fn),
  };

  new ResizeObserver(() => fit()).observe(wrap);
  buildLabels();
  drawNight();
  setInterval(drawNight, 60 * 1000);
  document.addEventListener("themechange", drawNight); // night is lighter on the light map
  fit();
  load();
  setInterval(load, REFRESH_MS);
  setInterval(() => { setStatus(); if (state.selected) renderStory(); }, 60 * 1000);
})();
