/**
 * pulse.js - the field breathes when Maizey catches something.
 *
 * A caught bot manifests as a brief GLITCH in the field - an RGB-split,
 * scanline-torn fragment of its identity that stutters in, holds, and collapses
 * to a scanline. This module owns four jobs and nothing else:
 *
 *   1. render   a redacted /pulse.json catch  ->  a glitch mote (see glitch.js)
 *   2. poll     the feed on an interval        (live) or a mock  (offline demo)
 *   3. diff     detect a NEW catch vs renewed activity on one already on stage
 *   4. animate  spawn / pulse / retire glitches in the .swarm layer
 *
 * The data source is redacted at the edge (see the node-B worker, Phase 1): it
 * carries a bot's SHAPE (class, family, behaviour flags, coarse counts) and
 * NOTHING that re-identifies a visitor - no fingerprint, canary, UA, IP or geo.
 * This file therefore never has to redact; it only draws what it is given.
 *
 * Config (any one; first wins):
 *   window.__PULSE_CONFIG__ = { mock, endpoint, interval, max }
 *   ?mock=1 in the URL  ->  run the offline mock even on the real page
 * Defaults: live, endpoint "/pulse.json", 5000ms, max 6 concurrent glitches.
 */
import { glitchMote } from "./glitch.js";
import { makeScene } from "./scene.js";

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const CFG = window.__PULSE_CONFIG__ || {};
const USE_MOCK = CFG.mock ?? params.has("mock");
const ENDPOINT = CFG.endpoint || "/pulse.json";
const INTERVAL = CFG.interval || 5000;
const MAX_ON_STAGE = CFG.max || 6;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ stage
// The .swarm layer sits over the field. Each glitch is one absolutely-placed
// node that stutters in low in the wheat, holds, then collapses. We cap how
// many live at once so a burst of catches reads as a flicker, not a blizzard.
class Stage {
  constructor(root) {
    this.root = root;
    this.live = new Map(); // id -> { el, at }
  }

  _slotX() {
    // spread glitches across the lower field, biased away from dead-centre so
    // they flicker around Todd rather than behind him.
    const side = Math.random() < 0.5 ? -1 : 1;
    const off = 8 + Math.random() * 34; // 8%..42% from centre
    return 50 + side * off;
  }

  spawn(item) {
    if (this.live.has(item.id)) return this.pulse(item.id);
    if (this.live.size >= MAX_ON_STAGE) this._retireOldest();

    const wrap = glitchMote(item); // .glitch-mote element, self-styled from item
    wrap.style.left = this._slotX() + "%";
    wrap.style.bottom = 3 + Math.random() * 22 + "vh"; // scatter through the wheat

    this.root.appendChild(wrap);
    this.live.set(item.id, { el: wrap, at: Date.now() });

    if (REDUCED) {
      wrap.classList.add("shown"); // no motion: just cross-fade in
    } else {
      // a glitch does not rise - it stutters into being, then snaps stable.
      // translateX(-50%) is the centring transform and must ride every keyframe.
      wrap.animate(
        [
          { opacity: 0, transform: "translateX(-50%) translateY(6px) scale(1.18)", filter: "blur(1.2px)" },
          { opacity: 1, transform: "translateX(-53%) translateY(0) scale(1)", filter: "blur(0)", offset: 0.35 },
          { opacity: 0.6, transform: "translateX(-47%) translateY(0) scale(1)", offset: 0.62 },
          { opacity: 1, transform: "translateX(-50%) translateY(0) scale(1)" },
        ],
        { duration: 440, easing: "steps(5, end)", fill: "forwards" }
      );
    }

    // glitches are ephemeral; deeper crawlers flicker a little longer
    const hold = 2600 + Math.min(3600, (item.maxDepth || 0) * 500);
    setTimeout(() => this._retire(item.id), hold);
  }

  // a bot already on stage did something more: a hard re-glitch flash.
  pulse(id) {
    const rec = this.live.get(id);
    if (!rec || REDUCED) return;
    rec.el.animate(
      [
        { transform: "translateX(-50%)", opacity: 1 },
        { transform: "translateX(-53%)", opacity: 0.5, offset: 0.25 },
        { transform: "translateX(-47%)", opacity: 1, offset: 0.5 },
        { transform: "translateX(-50%)", opacity: 1 },
      ],
      { duration: 300, easing: "steps(4, end)" }
    );
  }

  _retire(id) {
    const rec = this.live.get(id);
    if (!rec) return;
    this.live.delete(id);
    if (REDUCED) {
      rec.el.classList.remove("shown");
    } else {
      // collapse to a bright scanline, then gone
      rec.el.animate(
        [
          { opacity: 1, transform: "translateX(-50%) scaleY(1)", filter: "blur(0)" },
          { opacity: 1, transform: "translateX(-52%) scaleY(1.05) scaleX(1.15)", offset: 0.5 },
          { opacity: 0, transform: "translateX(-50%) scaleY(0.02) scaleX(1.4)", filter: "blur(1px)" },
        ],
        { duration: 340, easing: "steps(4, end)", fill: "forwards" }
      );
    }
    // Remove on a TIMER, never on animation.finished. A backgrounded tab pauses
    // the animation timeline (currentTime freezes, finished never resolves) while
    // setTimeout keeps firing - so animation-coupled cleanup leaks DOM nodes for
    // the whole time a tab sits in the background. Time-based cleanup cannot.
    setTimeout(() => rec.el.remove(), REDUCED ? 420 : 380);
  }

  _retireOldest() {
    let oldest = null, t = Infinity;
    for (const [id, rec] of this.live) if (rec.at < t) { t = rec.at; oldest = id; }
    if (oldest) this._retire(oldest);
  }
}

// ------------------------------------------------------------------ sources
// Both sources expose the same async snapshot() -> { recent, totals, now }.

class LiveSource {
  async snapshot() {
    // same-origin on node B: no token in the client, no CORS. A failed poll is
    // a no-op, not a crash - the field just doesn't change this tick.
    const r = await fetch(ENDPOINT, { cache: "no-store" });
    if (!r.ok) throw new Error("pulse " + r.status);
    return r.json();
  }
}

// A self-contained fake trap. It emits redacted-shape catches on its own clock
// so the whole pipeline (adapt -> diff -> animate) runs with zero network.
class MockSource {
  constructor() {
    this.seq = 1;
    this.totals = { catches: 0, requests: 0, forged: 0, verified: 0, honeytoken: 0, hops: 0 };
    this.recent = [];
    this._seed();
    // a new catch every few seconds; occasional extra request on an old one
    setInterval(() => this._emit(), 2600);
    setInterval(() => this._nudge(), 1700);
  }

  _sample() {
    const kinds = [
      { cls: "ai-crawler", family: "GPTBot", declaredBot: "GPTBot", verdict: "verified", caps: [] },
      { cls: "ai-agent", family: "ChatGPT-User", declaredBot: "ChatGPT-User", verdict: "unverifiable", caps: ["executedJs", "followedRedirect"] },
      { cls: "search", family: "Googlebot", declaredBot: "Googlebot", verdict: "verified", caps: [] },
      { cls: "headless", family: "HeadlessChrome", declaredBot: null, verdict: "unverifiable", caps: ["executedJs"], autoTells: true },
      { cls: "ai-crawler", family: "Bytespider", declaredBot: "Bytespider", verdict: "unverifiable", caps: [], misbehaving: true },
      { cls: "seo", family: "AhrefsBot", declaredBot: "AhrefsBot", verdict: "forged", caps: [] },
      { cls: "tool", family: "curl", declaredBot: null, verdict: "unverifiable", caps: [] },
      { cls: "social", family: "facebookexternalhit", declaredBot: "facebookexternalhit", verdict: "verified", caps: [] },
    ];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    return {
      id: "m" + (this.seq++).toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      node: "nodeb",
      cls: k.cls, family: k.family, declaredBot: k.declaredBot, verdict: k.verdict,
      misbehaving: !!k.misbehaving, leak: false, autoTells: !!k.autoTells,
      caps: k.caps,
      maxDepth: k.misbehaving ? 3 + Math.floor(Math.random() * 7) : Math.floor(Math.random() * 3),
      requests: 1 + Math.floor(Math.random() * 5),
      hops: 0, climbedMax: 0, dialogueTurns: 0,
      durationMs: 200 + Math.floor(Math.random() * 4000),
      at: Math.floor(Date.now() / 1000),
    };
  }

  _seed() {
    for (let i = 0; i < 3; i++) this._push(this._sample(), false);
  }

  _push(item, count) {
    this.recent.unshift(item);
    this.recent = this.recent.slice(0, 40);
    if (count) {
      this.totals.catches++;
      this.totals.requests += item.requests;
      if (item.verdict === "forged") this.totals.forged++;
      if (item.verdict === "verified") this.totals.verified++;
      if (item.misbehaving) this.totals.honeytoken++;
    }
  }

  _emit() { this._push(this._sample(), true); }

  // renewed activity on an EXISTING catch: update in place (as the real Hive
  // does), so the diff sees a request bump but not a new top id.
  _nudge() {
    if (!this.recent.length) return;
    const idx = Math.floor(Math.random() * Math.min(3, this.recent.length));
    this.recent[idx].requests++;
    this.recent[idx].at = Math.floor(Date.now() / 1000);
    this.totals.requests++;
  }

  async snapshot() {
    return { recent: this.recent.slice(), totals: { ...this.totals }, now: Date.now() };
  }
}

// ------------------------------------------------------------------ loop
// The diff is deliberately simple and mirrors how the Hive actually behaves:
//   - recent[] is newest-first; a genuinely new catch changes recent[0].id.
//   - a returning bot is updated IN PLACE (it does not jump to the top), so we
//     watch totals.requests to know "something happened" and flash the glitch.
function start() {
  const root = document.querySelector(".swarm");
  if (!root) return; // page without a stage: nothing to do
  const stage = new Stage(root);
  const source = USE_MOCK ? new MockSource() : new LiveSource();
  const scene = makeScene();
  let activity = 0;

  let lastTopId = null;
  let lastCatches = null;
  let lastRequests = null;
  let missWarned = false;

  async function tick() {
    let snap;
    try {
      snap = await source.snapshot();
      missWarned = false;
    } catch (e) {
      if (!missWarned) { console.warn("[pulse] feed unavailable:", e.message); missWarned = true; }
      return; // no endpoint yet (Phase 0 live) or a blip: leave the field be
    }
    const recent = snap.recent || [];
    const totals = snap.totals || {};

    if (lastCatches === null) {
      // first snapshot: adopt state, don't replay history as a burst
      lastTopId = recent[0] ? recent[0].id : null;
      lastCatches = totals.catches ?? 0;
      lastRequests = totals.requests ?? 0;
      return;
    }

    // how many new catches since last tick (bounded so a gap can't flood)
    const gained = Math.max(0, (totals.catches ?? 0) - lastCatches);

    // ambient activity: a 0..1 pulse a burst spikes and quiet decays. Drives the
    // weather, cloud speed and Todd's brightness through scene.js.
    activity = Math.min(1, activity * 0.82 + Math.min(1.2, gained * 0.4));
    scene.tick({ activity, gained, totals });

    if (gained > 0 && recent.length) {
      const fresh = [];
      for (const it of recent) {
        if (it.id === lastTopId) break;
        fresh.push(it);
        if (fresh.length >= Math.min(gained, MAX_ON_STAGE)) break;
      }
      // oldest-first so they arrive in the order they were caught
      fresh.reverse().forEach((it, i) => setTimeout(() => { stage.spawn(it); scene.onCatch(it); }, i * 350));
    } else if ((totals.requests ?? 0) > lastRequests && recent[0]) {
      // no new catch, but a bot on stage did more: acknowledge it
      stage.pulse(recent[0].id);
    }

    lastTopId = recent[0] ? recent[0].id : lastTopId;
    lastCatches = totals.catches ?? lastCatches;
    lastRequests = totals.requests ?? lastRequests;
  }

  tick();
  setInterval(tick, INTERVAL);
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start);
else start();
