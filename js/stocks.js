// Kabu, the corner mascot, and the stocks page she opens.
(function () {
  "use strict";

  const E = window.Earthwire;
  const $ = (sel, root = document) => root.querySelector(sel);
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

  // Keep in step with STOCKS in scripts/fetch-stocks.mjs.
  const STOCKS = [
    { symbol: "AAPL", name: "Apple", words: ["Apple", "iPhone", "iPad", "Tim Cook", "AAPL"] },
    { symbol: "MSFT", name: "Microsoft", words: ["Microsoft", "Azure", "Xbox", "Satya Nadella", "MSFT"] },
    { symbol: "NVDA", name: "Nvidia", words: ["Nvidia", "NVIDIA", "Jensen Huang", "NVDA"] },
    { symbol: "GOOGL", name: "Alphabet", words: ["Google", "Alphabet", "YouTube", "Sundar Pichai", "Waymo", "GOOGL"] },
    { symbol: "AMZN", name: "Amazon", words: ["Amazon", "AWS", "Jeff Bezos", "Andy Jassy", "AMZN"] },
    { symbol: "META", name: "Meta", words: ["Meta", "Facebook", "Instagram", "WhatsApp", "Zuckerberg", "META"] },
    { symbol: "TSLA", name: "Tesla", words: ["Tesla", "Elon Musk", "Musk", "Cybertruck", "TSLA"] },
    { symbol: "BRK-B", name: "Berkshire Hathaway", words: ["Berkshire", "Buffett", "Greg Abel", "BRK"] },
    { symbol: "JPM", name: "JPMorgan Chase", words: ["JPMorgan", "JP Morgan", "Jamie Dimon", "JPM"] },
    { symbol: "WMT", name: "Walmart", words: ["Walmart", "WMT"] },
  ];
  const MARKET_WORDS = ["Wall Street", "stock market", "stocks", "Nasdaq", "S&P 500", "Dow Jones", "Dow", "shares", "investors", "Federal Reserve", "Fed", "interest rates", "inflation", "markets", "bond", "bonds", "earnings", "AI bubble", "sell-off", "selloff", "rally"];
  const wordRe = (words, flags) => new RegExp("(?<![\\p{L}\\p{N}])(" + words.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", flags);
  for (const s of STOCKS) s.re = wordRe(s.words, "u");
  const marketRe = wordRe(MARKET_WORDS, "iu");

  // ---------------------------------------------------------------- mascot
  const mascot = $("#mascot");
  const bubble = $("#bubble");
  const bubbleText = $(".bubble-text", bubble);
  const bubbleActions = $(".bubble-actions", bubble);
  let hideTimer = null;

  function say(text, withChoices) {
    clearTimeout(hideTimer);
    bubbleText.textContent = text;
    bubbleActions.hidden = !withChoices;
    bubble.hidden = false;
    mascot.classList.add("talking");
    mascot.setAttribute("aria-expanded", "true");
    if (withChoices) $("#bubble-yes").focus({ preventScroll: true });
    else hideTimer = setTimeout(closeBubble, 2200);
  }
  function closeBubble() {
    bubble.hidden = true;
    mascot.classList.remove("talking");
    mascot.setAttribute("aria-expanded", "false");
  }

  mascot.addEventListener("click", () => {
    mascot.classList.remove("hop");
    void mascot.offsetWidth; // restart the hop animation
    mascot.classList.add("hop");
    if (!bubble.hidden && !bubbleActions.hidden) closeBubble();
    else say("Do you want to see the stocks?", true);
  });
  $("#bubble-yes").addEventListener("click", () => {
    closeBubble();
    openStocks();
  });
  $("#bubble-no").addEventListener("click", () => say("Okay! Tap me anytime~", false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !bubble.hidden) closeBubble();
  });

  // ---------------------------------------------------------------- stocks page
  const view = $("#stocks-view");
  const grid = $("#stock-grid");
  const marketList = $("#market-news");
  let data = null;
  let loadedAt = 0;
  let lastFocus = null;

  function openStocks(fromHash) {
    if (!view.hidden) return;
    lastFocus = document.activeElement;
    view.hidden = false;
    document.body.classList.add("stocks-open");
    if (!fromHash && location.hash !== "#stocks") history.pushState({ stocks: true }, "", "#stocks");
    $("#stocks-back").focus({ preventScroll: true });
    view.scrollTop = 0;
    render();
    if (Date.now() - loadedAt > 5 * 60 * 1000) loadStocks();
  }
  function closeStocks(fromHash) {
    if (view.hidden) return;
    view.hidden = true;
    document.body.classList.remove("stocks-open");
    if (!fromHash && location.hash === "#stocks") history.back();
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $("#stocks-back").addEventListener("click", () => closeStocks());
  window.addEventListener("popstate", () => (location.hash === "#stocks" ? openStocks(true) : closeStocks(true)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !view.hidden) closeStocks();
  });

  async function loadStocks() {
    const base = E.dataBase();
    const status = $("#stocks-status");
    if (!base) {
      status.textContent = "Prices are saved by the site's GitHub job, so they only show on the published site.";
      return;
    }
    status.textContent = "Loading prices…";
    try {
      data = await E.fetchJSON(base + "stocks.json", 15000);
      loadedAt = Date.now();
    } catch (err) {
      console.warn("Stock prices unavailable:", err);
    }
    render();
  }

  // headlines for a stock: Yahoo Finance's (saved by the job) + matching map headlines
  function headlinesFor(stock, saved) {
    const seen = new Set();
    const items = [];
    const add = (h) => {
      const key = h.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(h);
    };
    for (const s of E.stories()) {
      if (s.demo || !s.url) continue;
      if (stock.re.test(s.title) || (s.summary && stock.re.test(s.summary))) add({ title: s.title, url: s.url, domain: s.domain, time: +s.time });
    }
    for (const n of (saved && saved.news) || []) add(n);
    return items.sort((a, b) => b.time - a.time).slice(0, 4);
  }

  function marketHeadlines() {
    const out = [];
    for (const s of E.stories()) {
      if (s.demo || !s.url) continue;
      if (marketRe.test(s.title) || STOCKS.some((st) => st.re.test(s.title))) out.push({ title: s.title, url: s.url, domain: s.domain, time: +s.time });
      if (out.length >= 12) break;
    }
    return out;
  }

  const money = (v, cur = "USD") =>
    v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
  const signed = (v, digits = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits);

  function headlineItem(h) {
    const li = el("li");
    const a = el("a", { href: h.url, target: "_blank", rel: "noopener noreferrer" }, h.title);
    const meta = el("span", { class: "hl-meta" }, [h.domain, h.time ? E.timeAgo(new Date(h.time)) : ""].filter(Boolean).join(" · "));
    li.append(a, meta);
    return li;
  }

  function render() {
    const bySymbol = new Map(((data && data.stocks) || []).map((s) => [s.symbol, s]));
    const status = $("#stocks-status");
    if (data) {
      const t = Math.max(...data.stocks.map((s) => s.marketTime || 0));
      status.textContent = `Prices as of ${new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} · updated every 30 minutes · not live`;
    }
    grid.textContent = "";
    for (const stock of STOCKS) grid.append(card(stock, bySymbol.get(stock.symbol)));

    marketList.textContent = "";
    const market = marketHeadlines();
    if (!market.length) marketList.append(el("li", { class: "empty" }, "No market headlines yet."));
    for (const h of market) marketList.append(headlineItem(h));
  }

  function card(stock, q) {
    const art = el("article", { class: "stock-card" });
    const head = el("header", { class: "stock-head" });
    const id = el("div");
    id.append(el("span", { class: "ticker" }, stock.symbol), el("h3", {}, stock.name));
    head.append(id);
    art.append(head);

    if (q && q.price != null) {
      const dir = q.change > 0 ? "up" : q.change < 0 ? "down" : "flat";
      art.classList.add(dir);
      const priceBox = el("div", { class: "price-box" });
      priceBox.append(el("span", { class: "price" }, money(q.price, q.currency)));
      const chg = el("span", { class: "change " + dir });
      chg.append(el("span", { "aria-hidden": "true" }, dir === "up" ? "▲" : dir === "down" ? "▼" : "■"), document.createTextNode(` ${signed(q.change)} (${signed(q.changePct)}%)`));
      chg.setAttribute("aria-label", `${dir === "up" ? "Up" : dir === "down" ? "Down" : "Unchanged"} ${Math.abs(q.change).toFixed(2)} dollars, ${Math.abs(q.changePct).toFixed(2)} percent today`);
      priceBox.append(chg);
      head.append(priceBox);
      if (q.closes && q.closes.length > 1) art.append(sparkline(q.closes, q.currency, stock.name));
      const lo = Math.min(...q.closes.map((c) => c[1])), hi = Math.max(...q.closes.map((c) => c[1]));
      art.append(el("p", { class: "range" }, `1-month range ${money(lo, q.currency)} – ${money(hi, q.currency)}`));
    } else {
      art.append(el("p", { class: "no-price" }, data ? "Price unavailable right now." : "Price loading…"));
    }

    const hl = headlinesFor(stock, q);
    const list = el("ul", { class: "stock-news" });
    if (!hl.length) list.append(el("li", { class: "empty" }, "No recent headlines."));
    for (const h of hl) list.append(headlineItem(h));
    art.append(list);
    return art;
  }

  // one-month price line with a hover readout
  function sparkline(closes, cur, name) {
    const W = 280, H = 64, P = 4;
    const ys = closes.map((c) => c[1]);
    const min = Math.min(...ys), max = Math.max(...ys);
    const x = (i) => P + (i / (closes.length - 1)) * (W - 2 * P);
    const y = (v) => (max === min ? H / 2 : P + (1 - (v - min) / (max - min)) * (H - 2 * P));
    const wrap = el("div", { class: "spark" });
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": `${name} closing prices over the last month, from ${money(ys[0], cur)} to ${money(ys[ys.length - 1], cur)}` });
    const pts = closes.map((c, i) => [x(i), y(c[1])]);
    const line = "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
    svg.append(
      svgEl("path", { class: "spark-area", d: `${line}L${x(closes.length - 1).toFixed(1)},${H}L${P},${H}Z` }),
      svgEl("line", { class: "spark-base", x1: P, x2: W - P, y1: y(ys[0]), y2: y(ys[0]) }),
      svgEl("path", { class: "spark-line", d: line })
    );
    const cross = svgEl("line", { class: "spark-cross", y1: 0, y2: H });
    const dot = svgEl("circle", { class: "spark-dot", r: 3.5 });
    cross.style.display = dot.style.display = "none";
    svg.append(cross, dot);
    const tip = el("div", { class: "spark-tip" });
    tip.hidden = true;
    wrap.append(svg, tip);

    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const fx = ((clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(closes.length - 1, Math.round(((fx - P) / (W - 2 * P)) * (closes.length - 1))));
      const [px, py] = pts[i];
      cross.setAttribute("x1", px); cross.setAttribute("x2", px);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      cross.style.display = dot.style.display = "";
      tip.textContent = `${new Date(closes[i][0]).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${money(closes[i][1], cur)}`;
      tip.hidden = false;
      const left = (px / W) * r.width;
      tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + "px";
    };
    const hide = () => { cross.style.display = dot.style.display = "none"; tip.hidden = true; };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", hide);
    return wrap;
  }

  // keep headlines in step with the map
  E.onStories(() => { if (!view.hidden) render(); });

  if (location.hash === "#stocks") openStocks(true);
})();
