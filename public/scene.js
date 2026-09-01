/**
 * scene.js - the field responds to the AGGREGATE, not just to single catches.
 *
 * Three ambient layers react to how busy the trap is right now:
 *   weather  - a charged haze over the field that thickens with activity, and
 *              clouds that drift faster the busier it gets
 *   scars    - faint wear stamped low in the wheat where catches land, healing
 *              slowly, so the day's traffic leaves a visible residue
 *   todd     - Wheat Todd brightens with activity (his filter reads --activity),
 *              his glow pulses on each catch and flares red at a forged bot
 *
 * All of it rides the same redacted, shape-only feed pulse.js already polls -
 * totals + per-catch verdict. No new data, nothing identifying.
 *
 * Every hook is null-safe: on a page without a given layer (the preview has no
 * Todd, say) that piece simply does nothing.
 */

// #rgb or #rrggbb -> rgba() at a given alpha
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// A canvas heat-map of where catches have landed. Marks are stamped low in the
// field and erased a sliver at a time, so a busy stretch leaves visible wear
// that heals over a minute or so.
class Scars {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = this.h = 1;
    // ResizeObserver fires once the canvas actually has a layout size (it can be
    // 0 at construction, before first paint) and again on any viewport change,
    // so the bitmap always matches the element without guessing load timing.
    new ResizeObserver(() => this._resize()).observe(canvas);
    // heal on a TIMER (not rAF) so a backgrounded tab still fades old marks
    setInterval(() => this._heal(), 500);
  }
  _resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // fall back to the viewport when the element reports 0 (observer not yet
    // fired / pane not rendering), so the bitmap is never left at 1px.
    const w = Math.max(1, Math.round((r.width || window.innerWidth) * dpr));
    const h = Math.max(1, Math.round((r.height || window.innerHeight) * dpr));
    if (w === this.w && h === this.h) return; // unchanged: keep existing marks
    this.w = this.c.width = w;
    this.h = this.c.height = h;
  }
  stamp(xPct, accent) {
    if (this.w <= 2) this._resize(); // size lazily if the observer hasn't fired
    const x = (xPct / 100) * this.w;
    const y = this.h * (0.72 + Math.random() * 0.2); // low, down in the wheat
    const r = this.w * (0.02 + Math.random() * 0.03);
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(accent, 0.16));
    g.addColorStop(1, hexA(accent, 0));
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    // a faint torn scanline through it - a scar, not a smudge
    this.ctx.fillStyle = hexA(accent, 0.1);
    this.ctx.fillRect(x - r, y + (Math.random() * 6 - 3), r * 2, Math.max(1, (window.devicePixelRatio || 1)));
  }
  _heal() {
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.fillStyle = "rgba(0,0,0,0.03)"; // erase ~3% alpha everywhere
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.ctx.globalCompositeOperation = "source-over";
  }
}

export function makeScene() {
  const root = document.documentElement;
  const scarsCanvas = document.querySelector(".scars");
  const scars = scarsCanvas ? new Scars(scarsCanvas) : null;
  const glow = document.querySelector(".todd-glow");
  const weather = document.querySelector(".weather");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the cloud CSS animations, so activity can speed their drift. Empty under
  // reduced-motion (the clouds don't animate then) - grabbed lazily in case
  // they haven't started at first tick.
  let cloudAnims = [];
  const grabClouds = () => {
    cloudAnims = [...document.querySelectorAll(".clouds")].flatMap((el) => el.getAnimations());
  };
  grabClouds();

  return {
    // one catch just landed
    onCatch(item) {
      const forged = item.verdict === "forged";
      const accent = item.misbehaving
        ? "#ff3b3b"
        : forged
        ? "#ff2bd1"
        : item.verdict === "verified"
        ? "#3ad9f0"
        : "#b9a8ff";
      if (scars) scars.stamp(18 + Math.random() * 64, accent);
      if (glow) {
        glow.style.setProperty("--gc", forged ? "#ff2b5e" : "#7ff0ff");
        if (reduced) return; // no pulse under reduced motion
        glow.animate(
          [{ opacity: 0 }, { opacity: forged ? 0.85 : 0.55, offset: 0.3 }, { opacity: 0 }],
          { duration: forged ? 640 : 460, easing: "ease-out" }
        );
      }
    },

    // every poll: activity is a 0..1 decaying pulse of recent catch volume
    tick({ activity }) {
      root.style.setProperty("--activity", activity.toFixed(3));
      // drive the haze from JS as well: some engines don't re-resolve an
      // opacity calc() on a custom-property change, and the CSS transition on
      // .weather still smooths this inline value.
      if (weather) weather.style.opacity = (0.06 + activity * 0.5).toFixed(3);
      if (!cloudAnims.length) grabClouds();
      for (const a of cloudAnims) {
        try { a.playbackRate = 1 + activity * 3.2; } catch (e) {}
      }
    },
  };
}
