# `shared/playful/` — the "juego bonito" feel (module 27)

Canonical files for [STANDARD.md §27](../../STANDARD.md#27-visual-feel--juego-bonito).
Copy them, don't re-implement them, and never edit an app's copy in place.

| File | Copy to (React/Vite app) | Byte-identical? |
|---|---|---|
| `playful.css` | `src/styles/playful.css`, imported in `src/main.jsx` **after** `index.css` | yes |
| `celebrate.js` | `src/lib/celebrate.js` | yes |
| `celebrate.test.js` | `src/lib/__tests__/celebrate.test.js` | yes (fix the import path only if the app has no `@` alias) |

Reference implementation: `jospabloh/rumbo` (v1.36.0).

## What the app owns (and nothing else)

The canonical files own the *shape* — relief, press, pop, confetti. Colour,
type and corner radius stay the app's own, through its existing tokens:

```css
/* src/index.css — mapping, live references so runtime tenant colours flow through */
:root {
  --play-primary: hsl(var(--primary));
  --play-danger:  hsl(var(--destructive));
  --play-edge:    hsl(var(--border));       /* card + neutral button relief */
  --play-track:   hsl(var(--muted));        /* empty quota blocks */
  --play-confetti: hsl(var(--primary)), #ffc53d, #2fbf63, #ff5d5d;
}
```

An app whose tokens are not shadcn-shaped (Mission Control's `paper-card` /
`ink`) maps the same five variables to its own names. That is the whole
per-app surface.

## Adoption steps for a shadcn/Tailwind Base44 app

Do them in this order; each step is visible on its own.

1. **Radius as one knob.** In `tailwind.config.js`, derive every radius from
   `--radius` and set `--radius: 1rem` in `index.css`:
   ```js
   borderRadius: {
     sm: 'calc(var(--radius) - 10px)', md: 'calc(var(--radius) - 4px)',
     lg: 'var(--radius)', xl: 'calc(var(--radius) + 4px)',
     '2xl': 'calc(var(--radius) + 8px)', '3xl': 'calc(var(--radius) + 12px)',
   }
   ```
   Every existing `rounded-*` class gets rounder without touching a JSX file.
   `sm` stays small (6px) on purpose: checkboxes and kbd chips use it.
2. **Type.** Google Fonts `Baloo 2` (600–800) for display, `Nunito` (400–800)
   for body. `fontFamily.sans` and `body` → Nunito, `display` → Baloo 2;
   `h1, h2, h3 { @apply font-display }` in the base layer. Keep a mono face for
   aligned figures in tables if the app has one.
3. **Palette.** The brand colour does not change. Background moves from grey to
   a light sky tint (light) / night blue (dark); borders pick up the same hue,
   because they are also the relief colour. Semantic colours (success /
   warning / destructive) stay legible **as text** on the background — the
   bright "coin yellow" lives in `--play-confetti`, not in `--warning`.
4. **Components.** Copy `playful.css`, then in the shadcn primitives:
   - `button.jsx` base `rounded-xl font-bold`; `default` → `play-press play-press--primary`,
     `destructive` → `play-press play-press--danger`, `outline` → `border-2 bg-card play-press play-press--neutral`,
     `secondary` → `play-press play-press--neutral`. Drop their `shadow*` classes.
     `ghost` and `link` stay flat.
   - `card.jsx` → `rounded-2xl border-2 play-card`; `CardTitle` → `font-display text-lg font-bold`.
   - `badge.jsx` → `rounded-full font-bold`.
   - Active nav item → filled primary pill with `play-press play-press--primary`.
   - KPI tiles → solid icon chip with relief, figure in `font-display`.
5. **Celebrate.** Copy `celebrate.js` and call it at the app's real "done"
   moments — see the rules below. Copy the test.
6. **Verify** (module 12's dark-mode rule applies): both themes, phone/tablet/
   desktop, and the app's layout scanner if it has one — Nunito is wider than
   Inter, so tight button rows at 320px are where it breaks.

**Life bar on a tinted tile.** `--play-track` defaults to the muted colour,
which is also shadcn's `secondary`. On a `bg-secondary` tile the empty blocks
vanish and "2 of 15" reads as two blocks. Set `--play-track: hsl(var(--card))`
on the bar there (Rumbo's `QuotaBar` does). Rumbo's layout scanner did not
catch this; a screenshot did.

## When to call `celebrate()`

```js
const origin = document.activeElement;   // capture BEFORE the await
await guardedUpdate('Alert', id, { resolved: true });
celebrate(origin);                        // after success only, never awaited
```

- **Finishing something**, not saving something: a charge fully paid, an alert
  resolved, a trip logged, a maintenance created. A partial payment, an edit, a
  settings change or a filter is not a celebration.
- **After the write succeeded**, never in `catch`, never before the await.
- **Never blocks.** It returns at once; navigation, closing a modal and
  refetching carry on underneath it. The canvas is click-through.
- It is a no-op under `prefers-reduced-motion` and where there is no canvas.

## Vanilla sites (`acaciaco-site`)

`playful.css` works as-is (it has no Tailwind dependency). `celebrate.js` is an
ES module; a site without a bundler loads it with `<script type="module">` and
the same five `--play-*` variables mapped to the site's tokens (`--primary`,
`--border`, …).
