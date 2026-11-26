// "Nuclear simulation": a fictional, illustrative animation drawn on a canvas
// over the map. Launch sites are the nine countries that are publicly known
// to have nuclear weapons; targets are random cities. No real plans, yields,
// blast sizes or casualty figures are used. It's meant to be sobering, not
// realistic: the ending card explains why.
(function () {
  "use strict";

  const E = window.Earthwire;
  const $ = (sel) => document.querySelector(sel);
  const wrap = $("#map-wrap");
  const canvas = $("#sim-canvas");
  const ctx = canvas.getContext("2d");
  const hud = $("#sim-hud");
  const card = $("#sim-card");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const NUCLEAR_STATES = ["United States of America", "Russia", "China", "United Kingdom", "France", "India", "Pakistan", "North Korea", "Israel"];
  const WAVES = [8, 14, 18]; // missiles per wave
  const FLIGHT_MS = 2600;
  const WAVE_GAP_MS = 3200;
  const WINTER_MS = 4000;

  let running = false;
  let raf = 0;
  let start = 0;
  let missiles = [];
  let launched = 0;
  let hits = 0;
  let endAt = 0;

  // ---------------------------------------------------------------- setup
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function launchSites() {
    return NUCLEAR_STATES.map((n) => window.WORLD.centroids[n]).filter(Boolean)
      .map(([lat, lon]) => ({ lat, lon }));
  }
  function targets() {
    // cities from the place list, skipping regions and bodies of water
    return window.GAZETTEER.cities
      .filter(([name]) => !/Sea|Arctic|Strip|Bank|Donbas|Crimea|Texas|California|Florida|Alaska|Kashmir|Wales|Scotland|Northern Ireland|Silicon/.test(name))
      .map(([name, lat, lon]) => ({ name, lat, lon }));
  }

  function plan() {
    const sites = launchSites();
    const cities = targets();
    const out = [];
    let t = 1800; // after the alert
    for (const count of WAVES) {
      for (let i = 0; i < count; i++) {
        const from = pick(sites);
        let to = pick(cities);
        for (let tries = 0; tries < 5 && Math.abs(to.lat - from.lat) + Math.abs(to.lon - from.lon) < 15; tries++) to = pick(cities);
        out.push({
          from: { lat: from.lat + rand(-3, 3), lon: from.lon + rand(-4, 4) },
          to,
          t0: t + rand(0, 1400),
          dur: FLIGHT_MS * rand(0.8, 1.25),
          arrived: false,
        });
      }
      t += WAVE_GAP_MS;
    }
    return out.sort((a, b) => a.t0 - b.t0);
  }

  // ---------------------------------------------------------------- drawing
  function size() {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toScreen(p) {
    const v = E.view();
    const [x, y] = E.project(p.lat, p.lon);
    return [v.x + x * v.k, v.y + y * v.k];
  }

  // a curved flight path, bowed towards the pole like a long-range trajectory
  function pathPoint(a, b, t) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const dist = Math.hypot(dx, dy);
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 - dist * 0.35;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
  }

  function draw(now) {
    const t = now - start;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const lastHit = missiles.length ? Math.max(...missiles.map((m) => m.t0 + m.dur)) : 0;

    // the world reddens as the war goes on, then darkens into "nuclear winter"
    const war = Math.min(1, Math.max(0, (t - 1800) / (lastHit - 1800)));
    const winter = Math.min(1, Math.max(0, (t - lastHit) / WINTER_MS));
    ctx.fillStyle = `rgba(120, 20, 10, ${(0.18 * war * (1 - winter)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    if (winter > 0) {
      ctx.fillStyle = `rgba(20, 20, 24, ${(0.55 * winter).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    let inFlight = 0;
    for (const m of missiles) {
      if (t < m.t0) continue;
      const a = toScreen(m.from), b = toScreen(m.to);
      const p = Math.min(1, (t - m.t0) / m.dur);
      if (p < 1) {
        inFlight++;
        // trail
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const q = pathPoint(a, b, (p * i) / 24);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        }
        const grad = ctx.createLinearGradient(a[0], a[1], pathPoint(a, b, p)[0], pathPoint(a, b, p)[1]);
        grad.addColorStop(0, "rgba(255, 120, 80, 0)");
        grad.addColorStop(1, "rgba(255, 140, 90, 0.9)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // warhead
        const head = pathPoint(a, b, p);
        ctx.fillStyle = "#fff4d6";
        ctx.beginPath();
        ctx.arc(head[0], head[1], 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (!m.arrived) {
          m.arrived = true;
          hits++;
        }
        // detonation: a soft local glow that blooms and fades (no screen flashes)
        const age = t - m.t0 - m.dur;
        const bloom = Math.min(1, age / 900);
        const r = 6 + 22 * bloom;
        const alpha = Math.max(0.25, 1 - age / 2500);
        const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], r);
        g.addColorStop(0, `rgba(255, 245, 210, ${alpha})`);
        g.addColorStop(0.35, `rgba(255, 170, 60, ${alpha * 0.8})`);
        g.addColorStop(1, "rgba(220, 60, 20, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b[0], b[1], r, 0, Math.PI * 2);
        ctx.fill();
        if (age < 2200) {
          ctx.strokeStyle = `rgba(255, 200, 150, ${(0.6 * (1 - age / 2200)).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(b[0], b[1], 8 + age / 40, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    launched = missiles.filter((m) => t >= m.t0).length;

    updateHud(t, inFlight);
    if (t > lastHit + WINTER_MS && !endAt) {
      endAt = t;
      finish();
    }
    if (running) raf = requestAnimationFrame(draw);
  }

  function updateHud(t, inFlight) {
    const secs = Math.max(0, Math.floor((t - 1800) / 1000));
    $("#sim-clock").textContent = t < 1800 ? "Alert" : `T+${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    $("#sim-launched").textContent = launched;
    $("#sim-hits").textContent = hits;
    $("#sim-phase").textContent = t < 1800 ? "Launch detected" : inFlight ? "Missiles in flight" : endAt ? "Simulation over" : hits ? "Nuclear winter" : "Launch detected";
  }

  // ---------------------------------------------------------------- run / stop
  function run() {
    if (running) return;
    E.showWholeWorld();
    running = true;
    missiles = plan();
    launched = hits = endAt = 0;
    wrap.classList.add("simulating");
    document.body.classList.add("sim-active");
    canvas.hidden = false;
    hud.hidden = false;
    card.hidden = true;
    $("#sim-btn").setAttribute("aria-pressed", "true");
    size();
    if (E.kabuSay) E.kabuSay("Yikes! It's only a simulation… right?", "annoyed");
    if (reduceMotion) {
      // no animation: show the end state straight away
      start = performance.now() - 1e6;
      missiles.forEach((m) => { m.arrived = true; });
      hits = launched = missiles.length;
      running = false;
      draw(performance.now());
      return;
    }
    start = performance.now();
    raf = requestAnimationFrame(draw);
  }

  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    $("#sim-phase").textContent = "Simulation over";
    $("#sim-clock").textContent = "Ended";
    hud.classList.add("done");
    $("#sim-total").textContent = `${missiles.length} warheads, ${hits} cities.`;
    card.hidden = false;
    $("#sim-again").focus({ preventScroll: true });
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wrap.classList.remove("simulating");
    document.body.classList.remove("sim-active");
    canvas.hidden = true;
    hud.hidden = true;
    hud.classList.remove("done");
    card.hidden = true;
    $("#sim-btn").setAttribute("aria-pressed", "false");
    $("#sim-btn").focus({ preventScroll: true });
  }

  $("#sim-btn").addEventListener("click", () => (wrap.classList.contains("simulating") ? stop() : run()));
  $("#sim-stop").addEventListener("click", stop);
  $("#sim-close").addEventListener("click", stop);
  $("#sim-again").addEventListener("click", () => { stop(); run(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrap.classList.contains("simulating")) stop(); });
  window.addEventListener("resize", () => { if (wrap.classList.contains("simulating")) size(); });
})();
