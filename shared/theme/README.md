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

6. Delete every other theme control in the app. Two writers of the theme class
   will fight, and a two-state toggle cannot express "follow the device"
   anyway.

## What the component needs from the app

Semantic tokens only — `--background`, `--foreground`, `--card`, `--border`,
`--muted-foreground`, `--primary`, `--ring`. Apps on shadcn already have them.
An app with its own palette (Mission Control) aliases its tokens to those names
in `tailwind.config.js` rather than forking the component.
