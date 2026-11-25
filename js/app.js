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

  function cleanTitle(t) {
    return String(t || "")
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

  // ---------------------------------------------------------------- data
  function parseSeen(s) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || "");
    return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date();
  }

  function toStory(a) {
    const title = cleanTitle(a.title);
    if (title.length < 12) return null;
    const place = geo.locate(title) || geo.country(a.sourcecountry);
    if (!place) return null;
    return {
      title,
      url: a.url || "",
      domain: a.domain || "",
      time: a.time ? new Date(a.time) : parseSeen(a.seendate),
      image: a.socialimage || "",
      cat: categorise(title),
      place: place.name,
      lat: place.lat,
      lon: place.lon,
      precise: place.precise,
      demo: !!a.demo,
      src: a.sourcecountry || "",
    };
  }

  async function fetchJSON(url, ms = 45000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
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
  };
  const seen = new Set();
  const keyOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 70);

  function addArticles(articles) {
    let added = 0;
    for (const a of articles) {
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
      if (c && Date.now() - c.at < CACHE_MAX_AGE && c.articles.length) return c;
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
  function snapshotUrl() {
    const meta = document.querySelector('meta[name="headlines-snapshot"]');
    if (meta && meta.content) return meta.content;
    const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return null;
    const first = location.pathname.split("/").filter(Boolean)[0];
    const repo = first && !first.includes(".") ? first : m[1] + ".github.io";
    return `https://raw.githubusercontent.com/${m[1]}/${repo}/data/headlines.json`;
  }
  async function loadSnapshot() {
    const url = snapshotUrl();
    if (!url) return null;
    try {
      const snap = await fetchJSON(url, 10000);
      return snap && snap.articles && snap.articles.length ? snap : null;
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
  const svg = $("#map");
  const wrap = $("#map-wrap");
  const world = svgEl("g", { class: "world" });
  const graticule = svgEl("g", { class: "graticule" });
  const land = svgEl("g", { class: "land" });
  const dotsLayer = svgEl("g", { class: "dots" });
  world.append(graticule, land);
  svg.append(world, dotsLayer);

  // sphere outline + graticule
  (function drawBase() {
    const line = (pts) => "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
    const outline = [];
    for (let lat = -57; lat <= 84; lat += 1) outline.push(project(lat, 180));
    for (let lat = 84; lat >= -57; lat -= 1) outline.push(project(lat, -180));
    graticule.append(svgEl("path", { class: "sphere", d: line(outline) + "Z" }));
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

  const view = { w: 0, h: 0, k0: 1, k: 1, x: 0, y: 0 };
  const MAP_W = W.w, MAP_H = W.h;

  function fit() {
    const r = wrap.getBoundingClientRect();
    const prev = { ...view };
    view.w = r.width;
    view.h = r.height;
    svg.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
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

  function apply() {
    world.setAttribute("transform", `translate(${view.x.toFixed(2)},${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`);
    for (const s of state.stories) {
      if (!s._node) continue;
      s._node.setAttribute("transform", `translate(${(view.x + s._x * view.k).toFixed(1)},${(view.y + s._y * view.k).toFixed(1)})`);
    }
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
      const r = n === 0 ? 0 : 1.3 * Math.sqrt(n);
      const a = n * 2.39996;
      s._x = x + r * Math.cos(a);
      s._y = y + r * Math.sin(a);
      s._spot = k;
    }
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
      if (now - s.time < 60 * 60 * 1000) g.classList.add("fresh");
      if (!s.precise) g.classList.add("approx");
      if (!state.active.has(s.cat)) g.classList.add("hidden");
      if (s === state.selected) g.classList.add("selected");
      g.append(svgEl("circle", { class: "pulse", r: 6 }), svgEl("circle", { class: "hit", r: 11 }), svgEl("circle", { class: "core", r: 4.5 }));
      s._node = g;
      dotsLayer.append(g);
    }
    apply();
  }

  // ---------------------------------------------------------------- pointer interaction
  const pointers = new Map();
  let drag = null, pinch = null;
  const tooltip = $("#tooltip");

  function storyFromEvent(e) {
    const g = e.target.closest && e.target.closest(".dot");
    return g ? state.stories[+g.dataset.i] : null;
  }
  function localPoint(e) {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
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

  svg.addEventListener("pointermove", (e) => {
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
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTooltip(); });

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [x, y] = localPoint(e);
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), x, y, false);
  }, { passive: false });

  svg.addEventListener("dblclick", (e) => {
    const [x, y] = localPoint(e);
    zoomAt(e.shiftKey ? 0.5 : 2, x, y, true);
  });

  $("#zoom-in").addEventListener("click", () => zoomAt(1.8, view.w / 2, view.h / 2, true));
  $("#zoom-out").addEventListener("click", () => zoomAt(1 / 1.8, view.w / 2, view.h / 2, true));
  $("#zoom-reset").addEventListener("click", () => reset(true));

  function showTooltip(story, e) {
    if (!story || !state.active.has(story.cat)) return hideTooltip();
    const [x, y] = localPoint(e);
    tooltip.querySelector(".tt-place").textContent = story.place;
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
    return state.stories.filter((s) => state.active.has(s.cat));
  }

  function select(story, opts = {}) {
    if (state.selected && state.selected._node) state.selected._node.classList.remove("selected");
    state.selected = story;
    svg.classList.toggle("has-selection", !!story);
    if (story && story._node) {
      story._node.classList.add("selected");
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
    body.querySelector(".story-cat").textContent = cat.label;
    body.querySelector(".story-place").textContent = s.place;
    body.querySelector(".story-place").title = s.precise
      ? "Placed using the place named in the headline"
      : "No place named in the headline — placed at the news outlet's country";
    body.querySelector(".story-approx").hidden = s.precise;
    body.querySelector(".story-time").textContent = timeAgo(s.time);
    body.querySelector(".story-time").dateTime = s.time.toISOString();
    const h = body.querySelector(".story-title");
    h.textContent = s.title;
    const link = body.querySelector(".story-link");
    if (s.url) {
      link.hidden = false;
      link.href = s.url;
      link.querySelector(".story-domain").textContent = s.domain || new URL(s.url).hostname;
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
    const nearby = state.stories.filter((o) => o !== s && o._spot === s._spot && state.active.has(o.cat)).slice(0, 4);
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
    for (const s of state.stories) if (s._node) s._node.classList.toggle("hidden", !state.active.has(s.cat));
    filters.querySelectorAll(".chip:not(.chip-all)").forEach((b, i) => {
      const c = [...CATEGORIES, OTHER][i];
      b.setAttribute("aria-pressed", String(state.active.has(c.id)));
    });
    if (state.selected && !state.active.has(state.selected.cat)) select(null);
    else renderStory();
    setStatus();
  }

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

  function renderAll() {
    const keep = state.selected;
    renderDots();
    renderFilters();
    if (keep && state.stories.includes(keep)) select(keep, { from: "map" });
    else select(null);
    setStatus();
  }

  $("#refresh").addEventListener("click", () => load());
  $("#banner-retry").addEventListener("click", () => load());

  // ---------------------------------------------------------------- boot
  new ResizeObserver(() => fit()).observe(wrap);
  fit();
  load();
  setInterval(load, REFRESH_MS);
  setInterval(() => { setStatus(); if (state.selected) renderStory(); }, 60 * 1000);
})();
