/**
 * glitch.js - a caught bot as a glitch, not a critter.
 *
 * Each catch becomes a small torn fragment of its own identity: the family or
 * class name in glitched monospace (RGB channel split + scanline tearing, done
 * in CSS via the two ::before/::after layers keyed off data-text), under a
 * flickering scan bar. Nothing cute, nothing figurative - a corruption in the
 * field that flickers up and collapses.
 *
 * It draws ONLY shape-safe, already-redacted fields (class, family, verdict and
 * behaviour flags). No fingerprint, canary, UA, IP or geo is ever touched here -
 * there is none in the feed to touch.
 *
 *   accent   <- verdict / misbehaviour   cyan verified, magenta forged, red bad
 *   --amp    <- depth + misbehaviour      how violent the tearing is
 *   label    <- family, else class mark   the fragment that flickers
 */

// One accent per identity verdict. Tuned to the house neon so a glitch sits in
// the same palette as the hero (cyan #3ad9f0 / magenta #ff2bd1 on ink).
const ACCENT = {
  verified: "#3ad9f0",     // cyan  - papers in order
  forged: "#ff2bd1",       // magenta - wears a stolen name
  unverifiable: "#b9a8ff", // pale violet - unknown
};

// A short, honest mark per behavioural class - used when a family name is
// absent (an unnamed or raw client). Never invented detail, just the class.
const CLASS_MARK = {
  "ai-agent": "AGENT",
  "ai-crawler": "CRAWLER",
  search: "INDEX",
  seo: "SEO",
  social: "SOCIAL",
  tool: "TOOL",
  monitor: "MONITOR",
  headless: "HEADLESS",
  browser: "BROWSER",
  unknown: "BOT",
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function glitchMote(item) {
  const verdict = item.verdict || "unverifiable";
  const accent = item.misbehaving ? "#ff3b3b" : (ACCENT[verdict] || ACCENT.unverifiable);

  // how hard it tears: worse behaviour + deeper burrow = more violent
  const amp = (
    1 +
    (item.misbehaving ? 1.4 : 0) +
    (verdict === "forged" ? 0.8 : 0) +
    (item.autoTells ? 0.4 : 0) +
    Math.min(1.4, (item.maxDepth || 0) / 6)
  ).toFixed(2);

  // the fragment that flickers. family is the redacted, shape-safe label; fall
  // back to the class mark when a bot arrives unnamed. Clipped short.
  const label = String(item.family || CLASS_MARK[item.cls] || CLASS_MARK.unknown).slice(0, 24);

  const el = document.createElement("div");
  el.className = "glitch-mote" + (verdict === "forged" ? " forged" : "") + (item.misbehaving ? " bad" : "");
  el.style.setProperty("--accent", accent);
  el.style.setProperty("--amp", amp);

  el.innerHTML =
    '<span class="g-tag" data-text="' + esc(label) + '">' + esc(label) + "</span>" +
    '<span class="g-bar"></span>';

  // visible identity doubles as the accessible description
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    label +
      " caught - " +
      (CLASS_MARK[item.cls] || "bot").toLowerCase() +
      (verdict === "forged" ? ", forged identity" : verdict === "verified" ? ", verified" : "") +
      (item.misbehaving ? ", ignored the wards" : "")
  );
  return el;
}
