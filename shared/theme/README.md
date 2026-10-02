# Theme control — the canonical files

Module 12 of `STANDARD.md`. These are the sources every app copies; they are
not a library, because the portfolio has no shared package and adding one for
five files would be a worse trade than copying them.

**Change these first, then copy out.** An app that edits its own copy in place
drifts, and the whole point of the control is that an operator who runs two
ACACIA apps finds the same thing in the same corner of both.

| File | Goes to | For |
|---|---|---|
| `ThemeSwitcher.jsx` | `src/components/ThemeSwitcher.jsx` | Every React app, byte-identical |
| `useThemeMode.next-themes.js` | `src/lib/useThemeMode.js` | Apps whose provider is `next-themes` |
| `useThemeMode.context.js` | `src/lib/useThemeMode.js` | Apps using the hand-rolled context below |
| `ThemeContext.jsx` | `src/lib/ThemeContext.jsx` | Apps with no `next-themes` dependency — set `STORAGE_KEY` per app |
| `theme-switcher.vanilla.js` | `scripts/theme-switcher.js` | Static, non-React pages (`acaciaco-site`) |

## Wiring a React app

1. Copy `ThemeSwitcher.jsx` in unchanged.
2. Copy the matching `useThemeMode` adapter to `src/lib/useThemeMode.js`.
3. Render `<ThemeSwitcher />` **once**, inside the theme provider, next to the
   toaster in `App.jsx`. Not in the layout — it has to be there on the login
   screen and the 404 too.
4. Add the pre-mount script to `index.html` so the first paint is already the
   right colour, using the same storage key and the same
   `'light' | 'dark' | 'system'` values as the provider.
5. Declare placement in `index.css`, and lift the control above a mobile tab
   bar if the app has one:

   ```css
   :root { --theme-switcher-bottom: 1rem; --theme-switcher-right: 1rem; }
   @media (max-width: 767px) { :root { --theme-switcher-bottom: 5.5rem; } }
   ```

   Then look at the corner at **phone, tablet and desktop**, with the track both
   collapsed and expanded. The control is pinned above everything on every
   screen, so it is one careless corner away from sitting on a tab bar, a
   floating action button or a sticky *Guardar* — and an app that has lost a
   button at one width has lost it silently. If another control already owns
   that corner, move the switcher rather than the control: Plink FX puts it
   bottom-**left** because the calculator FAB owns bottom-right.

   Module 13's smoke suite asserts this at all three widths in both states, and
   reports the two directions separately — something painted over the switcher,
   and the switcher answering for a control beneath it. Watch for a parent with
   `isolation: isolate` or a `transform`: it opens a stacking context and traps
   the switcher's `z-index` inside it, so a large number proves nothing.

6. Delete every other theme control in the app. Two writers of the theme class
   will fight, and a two-state toggle cannot express "follow the device"
   anyway.

## Size: 44 px by default (2026-10-02)

The resting circle and each slot of the open track are CSS variables,
`--theme-switcher-size` and `--theme-switcher-slot`, and both default to
**44 px** — the touch target a finger needs. They used to be a hardcoded
40 px circle with 34 px slots, and because the control is on every screen of
every app, LIUMA's phone audit (v1.9.0) found it under 44 px on all of them.
An app that prefers the old look under a mouse sets it back for fine pointers
only, from its own `index.css`:

```css
@media (pointer: fine) {
  :root { --theme-switcher-size: 40px; --theme-switcher-slot: 34px; }
}
```

Open, the track is `slot + 6 px` tall (50 px at the default): lift
`--theme-switcher-bottom` if that crowds a bottom bar, and re-run the smoke
suite's placement check at 390 px.

**Copy-out pending** for every React app that still carries the 40/34 copy:
`acacia-mission-control`, `puntos`, `rumbo`, `flowfin`, `stockflow`,
`cateqhub`, `radar`, `ctrlhq`, `kitchops` (LIUMA already has it). The vanilla
twin `theme-switcher.vanilla.js` (`acaciaco-site`) still draws 40/34 px and is
a separate change.

## What the component needs from the app

Semantic tokens only — `--background`, `--foreground`, `--card`, `--border`,
`--muted-foreground`, `--primary`, `--ring`. Apps on shadcn already have them.
An app with its own palette (Mission Control) aliases its tokens to those names
in `tailwind.config.js` rather than forking the component.
