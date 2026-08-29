# Wheat Todd

Landing page for **wheattodd** — a single full-screen hero: Wheat Todd standing
in a night field, with only the sky in motion.

Wheat Todd is the second character of *Maizey & the Korn Kult*, and the site is
intended to become the **second Chapel** — node B of a two-domain experiment in
which a crawler is passed between two cross-linked fields so its policy
(loop-escape, referer preservation, per-host vs global crawl budget) can be
measured rather than guessed. Node A is live; this side is not built yet.

## Current state

A static page. No build step, no dependencies, no framework.

```
index.html          the whole page — markup, styles, animation
assets/web/         optimised, shipped
  todd.png          Wheat Todd, keyed to transparent (luminance key off black)
  field.jpg         the night field backdrop
  clouds.png        cloud shapes lifted from the artwork, doubled to loop
  skymask.png       where sky is visible, keyed off the artwork's magenta
assets/raw/         original full-res generations (gitignored — 13MB)
```

Open `index.html` directly; it needs no server.

## How the motion works

The field never moves. The only animated element is a cloud layer drifting
across the sky, masked by `skymask.png` so it slides **behind** every wheat
stalk and tree instead of over them. A second slower pass runs in reverse at a
different duration so the sky never reads as one repeating loop.

`prefers-reduced-motion` stops the drift; the page is designed to read fine
frozen.

## Art direction

Bold black ink linework, flat cel shading, screenprint poster illustration.
Saturated and limited: black, deep purple, hot magenta, electric cyan, with
acid yellow reserved for the eyes and the horizon.

Wheat Todd is **wheat, never corn** — that is the schism. He is gaunt, spindly,
weary, and still. Flat glowing eyes, no pupils, no irises, no expression. Not
cute, not menacing: tired, and slightly wrong.

Prompts used to generate the art live in `../Gossamyr/docs/wheat-todd-prompts.md`.

## Not done yet

- The hero art is a placeholder composition and is being re-cut; Todd currently
  shows faint horizontal banding from the luminance key
- The display face is a stand-in
- No node-B trap functionality — the domain is not registered and the Worker
  is not deployed
