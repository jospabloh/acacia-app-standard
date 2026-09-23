# Auth layout — the split-screen "pro" bar

Module 10 of `STANDARD.md`. Two apps (FlowFin, StockFlow) built this same
shape independently before it was written down anywhere; a third
(ArtisKids) shipped without it — a single centered card, no brand panel,
`--primary` still shadcn's scaffold default — and only got caught because a
person compared it side-by-side against its siblings. Copy this in from the
start instead of relying on a prose description alone to carry the bar.

**Adapt, don't keep byte-identical** — the opposite convention from
`shared/theme/`/`shared/bridge/`, matching
[`shared/session/purgeStaleSessions.example.ts`](../session/) instead: this
is a shape to fill in with the app's own logo, copy and route, not a file
every app must stay in sync with forever.

| File | Goes to | For |
|---|---|---|
| `AuthLayout.example.jsx` | `src/components/AuthLayout.jsx` | The two-column shell every auth screen (`Login`/`Register`/`ForgotPassword`/`ResetPassword`) renders through |

## Before wiring it in: check `--primary`, not after

Every color in this file is a design-token class (`bg-primary`,
`text-muted-foreground`, `border-input`, ...) — never a literal Tailwind
color — so the brand panel inherits whatever `--primary`/`--primary-foreground`
resolve to in the app's own `src/index.css`. That is exactly the failure
mode this file exists to prevent, and it is silent: a fresh
`create-base44-app` scaffold's `--primary` is shadcn's own near-black/white
default, not the app's real brand color, and nothing errors if it's never
customized — the login button just renders black while every other page's
buttons render the app's actual brand color, because those pages already
use literal `bg-amber-500`-style classes instead of the (orphaned) `primary`
token.

Check it before copying this file in, not after: grep the app for
`bg-primary` outside `src/components/ui/` (shadcn's own primitives). If
nothing else in the app uses it, `--primary` is almost certainly still the
scaffold default, and the fix belongs in `index.css`'s two `--primary`/
`--primary-foreground` pairs (`:root` and `.dark`), not a one-off override
in this file.

## The four props sets

`icon`/`title`/`subtitle`/`footer`/`children` are unchanged from every
app's pre-existing `AuthLayout` — `Login.jsx`/`Register.jsx`/
`ForgotPassword.jsx`/`ResetPassword.jsx` need no changes when adopting this
file for the first time, only when the brand-panel props below are added.

`appName`/`logoSrc`/`tagline` drive the top-left lockup and the form
column's bottom line. `eyebrow`/`headline`/`headlineAccent`/`description`
are the brand panel's own copy — write real copy for the product (see
FlowFin's "Controla tu dinero, no al revés." or ArtisKids' "Cada dibujo,
guardado para siempre." for the register), not a placeholder left over from
this file.

## Verifying it's live

Same trap as every other module here: merging does not deploy, and Base44
apps specifically have a second gap — GitHub sync pulls a merged commit
into the app's file tree, but does **not** publish it; a synced-but-
unpublished commit looks identical from the repo's side while the live app
still serves the old build. Confirm by content, not by the dashboard's own
"published" confirmation dialog: fetch the live app's compiled JS bundle and
grep for a string only the new copy contains (the brand panel's `headline`
is a good choice — generic enough not to appear by accident, specific
enough not to already exist in the old build).
