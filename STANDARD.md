# ACACIA Portfolio App Standard

This is the contract every app in the ACACIA portfolio must satisfy to plug into
**Mission Control** (`jospabloh/acacia-mission-control`) at the same quality bar
as the rest of the portfolio. It exists because these modules were built once,
independently, in stockflow / flowfin / puntos / rumbo / liuma / plink_fx, at real
cost — see [`docs/incidents.md`](docs/incidents.md) — and a new app should start
from the lesson, not repeat the incident.

**Who this is for:** anyone (human or Claude) creating a new app that should
become part of the portfolio, or auditing an existing one for drift.

**How to use it:**
1. Read this file top to bottom before scaffolding a new app.
2. Copy [`CHECKLIST.md`](CHECKLIST.md) into the new app's `CLAUDE.md` (or link to
   it) so every session working on that app sees the contract, not just the one
   that created it.
3. When Mission Control's own model changes (a new bodega table, a new adapter
   capability), update this doc first, then bring apps into compliance — this
   repo is the source of truth, not any single app.

This standard is stack-agnostic in principle, but today the whole portfolio is
**Base44 backend + Vite/React frontend**, deployed standalone, registered into
Mission Control's Supabase "bodega" via a per-backend adapter
(`api/_lib/adapters/{base44,supabase,external,static}` in Mission Control). Where
this doc says "Base44", read "your backend" if a future app isn't one.

---

## 0. The relationship to Mission Control, in one paragraph

Mission Control is **not** a Base44 app and does not own your data. It is a
central panel that (a) keeps a read-optimized *copy* of your app's operational
data in its own Supabase "bodega" for cross-portfolio dashboards, and (b) is
**the single owner of cross-app automation** — license lifecycle, portfolio-wide
reminders, the ACACIA marketing site's app listing. Your app's own backend stays
the source of truth for its own users/licenses/support; Mission Control reads
and writes it through an adapter, never the other way around. Concretely, this
means: **do not build a second copy of a module Mission Control already owns
centrally** (see Module 1). Every incident in `docs/incidents.md` where this was
violated cost days of silent breakage.

---

## 1. License lifecycle — owned centrally, not per-app

**Rule:** an app does **not** run its own trial/active/view_only/suspended state
machine, billing reminders, or renewal cron. That logic is
`runUnifiedLifecycleForApp` in `acacia-mission-control/api/cron/license-lifecycle.js`,
and it runs once, portfolio-wide, against Mercado Pago (the only payment
provider — **Stripe is not used anywhere** in this portfolio).

**What your app must provide instead:**
- A tenant/account entity (`Business`, `Family`, or equivalent) with a
  **`billing_status`** field taking exactly `trial | active | view_only | suspended`.
  Mission Control writes this field; your app **reads** it to gate features
  (`view_only` and `suspended` should degrade the UI, not 500 it).
- A registry row in Mission Control's `apps` table (Supabase) so the lifecycle
  cron and adapter know your app exists — see `scripts/onboard-base44.js` in
  Mission Control, `npm run onboard:base44 -- <repoPath> --dry` to preview it.
- An adapter under `acacia-mission-control/api/_lib/adapters/` matching your
  backend kind (`base44` today for every existing app) so Mission Control's
  cron can actually reach your entity.
- Manual admin actions (`confirmRenewalPayment`, `adminUpdateTenantLicense`,
  or your app's equivalent) **may** stay in-app — those aren't the automated
  cron, they're a human doing a one-off override, and Mission Control's admin UI
  calls into them via the adapter rather than duplicating them.

**What to remove, if scaffolding from an older app or migrating one in:** any
`checkAccountLifecycle`, `processMonthlyRenewal`, `checkTrialExpiration`,
`expireTrials`, `queueBillingReminders`, `sendLifecycleEmails`-as-a-cron. If your
new app needs a lifecycle email Mission Control's unified cron doesn't send yet
(check current gaps first — flowfin's CLAUDE.md notes Mercado Pago pre-charge
reminders as one open gap at time of writing), the fix is to extend the shared
cron, not to add a parallel one.

---

## 2. User & role control — two layers, don't conflate them

**Layer 1 — Mission Control operator role** (who can drive the *panel*, not your
app): Supabase Auth users mapped in `members` to `owner | admin | viewer`
(ranks 3/2/1). RLS enforces this on Mission Control's client; its `api/`
functions use the service_role key and bypass it. This is orthogonal to your
app's own users.

**Layer 2 — your app's own role model**, which must:
- Map cleanly onto a small, named set of roles (see puntos' canonical example:
  `admin` = platform/ACACIA owner, `business_admin` = tenant admin,
  `merchant` = staff/cashier, `customer` = end consumer — kept in one file,
  `src/lib/rbac.js`, as the single place the mapping is declared).
- Use the backend's **built-in** role field for anything RLS needs to key off
  (Base44's `role`), and tenant/store scoping via **custom** fields
  (`business_id`, `storeId`) set through `auth.updateMe({ role, data: {...} })`
  at onboarding — never invent a parallel "is this an admin" flag that RLS
  can't see.
- Never let the two layers merge: an `owner` in Mission Control's `members`
  table has no automatic role inside your app, and vice versa. Mission Control
  reaches your app's data through the service-role adapter, not by impersonating
  one of your app's users.

---

## 3. Granular permissions module

**Client side:** one registry file (pattern: `src/lib/permissionRegistry.js`)
listing every gated action as `"Section:action"` (e.g. `Caja Chica:add_fund`,
`Cotizaciones:edit_items`), with per-role defaults, consumed by a
`PermissionContext`/`can()` hook that hides/disables UI. This part alone is
**not sufficient** — see the next paragraph.

**Server side — mandatory, not optional:** every write path the client can hit
must independently re-check the same permission key server-side, in the
function that performs the write, in this precedence order (mirrors
`PermissionContext.can()` exactly so client and server never disagree):
1. platform-owner email or `role: admin` → always allowed;
2. else an explicit `true`/`false` override for that tenant + role in a
   `PermissionProfile`-equivalent entity wins;
3. else fall back to the registry default for that role.

Then, still server-side, check the account's `billing_status` (`view_only` /
`suspended` → reject, same gate every other write already has) *before* the
permission check would otherwise allow it.

**Why this is non-negotiable, not a nice-to-have:** stockflow shipped exactly
the client-only version first, for three entities, across two release cycles,
before closing it — an authenticated low-privilege user could open devtools and
call the backend directly, bypassing a permission their admin had explicitly
revoked. See `docs/incidents.md` for the full writeup and the pattern that
closed it (dedicated "Safe" function per write path, checked by real unit
tests against the permission-check logic in isolation — no SDK imports in that
one file, so it's testable without simulating the whole backend).

**Keep the manifest in sync automatically**, not by hand: a generator script
(`scripts/generatePermissionManifests.mjs` pattern) that reads the one registry
file and regenerates every backend copy of the canonical keys/defaults, wired
into your release script. Backends that can't share code across function
directories (Base44/Deno: each function is isolated, can't import a sibling)
mean you'll have N *generated*, identical copies — that's fine, hand-diverging
them is not.

---

## 4. Multi-tenant data isolation (RLS)

If your backend has row-level security with a templated left/right rule syntax
(Base44 does), the two halves of every rule must **both** be correct
independently, because getting either one wrong fails **silently** — no error,
the rule just stops matching real rows:

- **Entity side:** custom fields live under `data.` — `business_id` alone
  points at a field that doesn't exist, so the rule matches *every* row (RLS
  effectively off, cross-tenant leak). Use `data.business_id`.
- **User side:** custom user fields resolve as `{{user.data.business_id}}` —
  bare `{{user.business_id}}` resolves to nothing, so the rule matches *zero*
  rows (every tenant sees an empty app).
- **Service-role calls have no end-user context.** Your backend "Safe"
  functions run as service-role/admin to perform validated writes — so **every**
  tenant-scoped entity's `$or` needs an explicit
  `{"user_condition":{"role":"admin"}}` branch on **all four** operations
  (read/create/update/delete), or service-role reads return zero rows (silent
  "not found", features that read-then-write just stop working) and
  service-role writes get rejected outright.
- **Migrate additively, never by narrowing a live rule.** Add new tenant
  branches on top of whatever access already works; don't rewrite an existing
  branch believing it's equivalent. Two production outages in this portfolio
  (stockflow, 2026-06-16 and 2026-06-17) came from narrowing a live RLS rule
  one half at a time — full writeup in `docs/incidents.md`, worth reading before
  touching any live `rls` block.

**Guard this with a static checker in CI** (`validate-rls.mjs` pattern) that
parses every entity schema file and fails the build on an invalid entity- or
user-side path, and warns when a tenant-scoped op is missing the service-role
admin branch. A static checker only catches *malformed* rules, not
*over-restrictive-but-valid* ones (FlowFin's `family_id` incident: a bot pushed
a syntactically valid rule that simply forgot non-admin members could read
their own data, undetected for 9 days) — so also add a rule to the checker for
every specific shape of over-restriction you've been burned by, the way
FlowFin's checker now fails if a `family_id`/`admin_user_id` entity's `read` is
narrowed to platform-admin-only with no member fallback.

**The schema-as-code trap:** your entity definitions live in a repo file
(`base44/entities/*.jsonc` or equivalent), but the backend runs against
whatever was last **deployed**. Committing the file changes nothing at runtime.
Every field addition and every RLS fix needs an explicit deploy step
(`update_entity_schema` / your backend's equivalent) — verify against the live
schema, don't assume the diff shipped itself.

---

## 5. Health & latency reporting

Mission Control's bodega has a `health` table it reads via your app's adapter
to drive the portfolio dashboard (uptime, latency, error rate). Your app's
obligation is narrow and mechanical:
- Expose a cheap, unauthenticated-or-service-role health check endpoint (a
  `/api/health`-style route, or a Base44 function) that the adapter can poll —
  it should measure real backend latency (a round-trip to your own DB/entity
  store), not just return `200 OK` unconditionally.
- Don't build your own uptime dashboard — Mission Control's is the portfolio
  one. If you need in-app status for your own users, keep it thin and pull from
  the same signal, not a second one that can disagree.

---

## 6. Changelog & versioning

Pattern (see FlowFin): a single `appConfig.js`-equivalent holding
`APP_VERSION`, `RELEASE_DATE`, and an in-app changelog array, kept in sync by a
release script — never hand-edited per feature commit, and never regenerated
as part of the normal `build` step. A generator that stamps "last synced: today"
into a **git-tracked** file and runs on every `build` produces a spurious local
diff on every build, which then fights the next `git pull` the moment `main`
has a newer copy from someone else's real release — see FlowFin's incident.
Rule of thumb: **`build` validates, `release` generates.** If a routine build
needs to mutate a tracked file to stay "fresh," that's the bug, not a fact of
life.

Surface the changelog to users somewhere reachable from Account (Module 8),
and to Mission Control's `announcements` table if the release is portfolio-
notable (breaking change, new module, pricing change) — that's how the panel
surfaces it across the whole operator team without a manual cross-post.

---

## 7. Account & danger zone

Every app needs an Account/Settings surface, reachable by any authenticated
user, containing at minimum:
- Profile/org info edit (name, contact, branding if applicable).
- Member management scoped to the app's own role model (Module 2, layer 2) —
  invite, change role, remove — gated by the same permission module as
  everything else (Module 3), not a bespoke check.
- **Danger zone**, visually separated (confirmation step, red affordance):
  export data, and irreversible account deletion/downgrade. Deletion must
  either cascade correctly through your own entities or explicitly document
  what it does *not* touch (e.g. billing history retained for compliance) —
  don't ship a "delete account" button before deciding that.
- Current `billing_status` and plan, read-only (Module 1 owns writing it) —
  don't let this screen invite the user to self-serve a status change that
  bypasses Mercado Pago.

---

## 8. Support & improvements → Mission Control

Support tickets, feature requests ("mejoras"), and leads are **Mission
Control's tables** (`tickets`, `leads` in the bodega), not a parallel inbox per
app. Your app's obligation:
- A visible "Soporte" / "Sugerir una mejora" entry point that writes to your
  own backend first (so it's not lost if the sync to Mission Control lags),
  tagged with your app's registry id, then syncs into the bodega via your
  adapter (or Mission Control's ingest webhook, HMAC-signed —
  `INGEST_HMAC_SECRET`, server-only, never exposed with a `VITE_`/client
  prefix).
- Don't build your own ticket-status UI beyond "submitted / resolved" — triage
  and response happen from Mission Control's panel, where an operator sees
  every app's queue in one place. A per-app ticket system that diverges from
  that is exactly the parallel permission model Module 0 already warns against.

---

## 9. Presence on the ACACIA site (`acaciaco-site`)

Every portfolio app gets one page under `apps/` in `jospabloh/acaciaco-site`
(static HTML, no framework, no build step — see that repo's `CLAUDE.md`).
Minimum bar: what it does, who it's for, pricing tier, a link into the app's
own login/trial flow. Reuse `styles/base.css` tokens (`--bg-card`, `--border`,
`--text-muted`, `--radius-card`) — hand-coding colors breaks the moment
`[data-theme="dark"]` is toggled, since the site has a real dark theme, not a
cosmetic one. Comments/identifiers in English, all user-facing copy in
Spanish, matching every other page on the site.

If the app is public/freeware rather than licensed, it likely belongs under
`freeware/` instead of `apps/` — check the existing pattern before adding a
new top-level section.

---

## 10. Login page — "pro" bar

The login screen is the first thing every tenant's staff sees, and it's the
one screen every app in the portfolio should look like it came from the same
company. Concretely, "pro" means:
- Same visual language as the rest of the app (design tokens, not one-off
  colors) and as `acaciaco-site`'s own branding — a user clicking through from
  the marketing site should not land somewhere that looks like a different
  product.
- Real states: loading, wrong-credentials, account `suspended`/`view_only`
  (Module 1) explained in plain language instead of a generic auth error,
  rate-limit/lockout feedback if you have one.
- No dead ends: a link to request access / start a trial (→ the app's
  `acaciaco-site` page), and to support (Module 8) for a locked-out tenant.
- Dark-theme correct by default, like every other screen (Module 9's
  dark-theme rule applies here too — a login page is the worst place for a
  washed-out unstyled color to show up first).

---

## 11. Deploy discipline & the endpoint budget

Base44 caps an app at **50 backend functions**. That cap is not a soft limit:
crossing it makes `functions deploy` fail *partway*, and because the CLI's
prune phase only runs after a clean deploy, a half-applied deploy leaves stale
remote functions occupying the slots needed to fix it. See
[`docs/incidents.md`](docs/incidents.md), 2026-08-21.

Every app repo must carry these five, and they are cheap enough that there is
no reason not to:

- **`base44.app.json`** — `{ name, appId, maxFunctions }`. The app id lives
  in the repo, next to the code it deploys.
- **`npm run deploy`** (`scripts/base44-deploy.mjs`) — the only sanctioned
  deploy path. It reads the id from `base44.app.json` and **refuses an
  `--app-id` argument**, so the source directory and the target app cannot
  disagree. Hand-running `npx base44 functions deploy --app-id <id>` is what
  pushed one app's backend into four others.
- **`npm run deploy:site`** — the frontend. **Merging to `main` deploys
  nothing**, neither functions nor site; that was believed otherwise for
  months, and it kept a merged, CI-green FlowFin fix out of production for five
  days while the user who reported the bug kept hitting it. Separate from
  `deploy` so a UI change doesn't re-walk 45 functions, and so the step that
  went missing is the one you run on purpose.
- **`npm run deploy:entities`** — separate on purpose, because `entities push`
  **deletes every remote entity absent locally**. It prints the app name and
  the full entity list, then requires the operator to type the app's name.
- **`npm run validate:functions`**, wired into `npm run lint` — fails above
  `maxFunctions` (default **40**). The 10-endpoint margin under Base44's 50 is
  the point: it means adding a function is never an emergency.

**Verify a deploy by content, never by a hash or a green merge.** The app's
checkpoint reports a `git_commit_hash` equal to `main`'s HEAD *even when the
tree being served is behind* — Base44 mirrors the commits into its metadata,
but what gets built and served is the app's own working tree. Read the
deployed file and grep for an identifier that exists only in the change:

```bash
wc -l src/<archivo-que-cambiaste>
grep -c "<identificador que SOLO existe en el fix>" src/<archivo>
```

A user-reported bug is closed when the thing the user touches behaves
differently — for this portfolio that is always at least one deploy past the
merge.

**Counting rule:** a function is any directory containing `entry.ts`/`entry.js`,
at any depth — its name is its full path, so nesting does not reduce the count.
The only way down is a **router**: one endpoint that dispatches on an `action`
field to handler modules under `handlers/`, which are bundled with the router
and cost no slots. FlowFin went 94 → 48 this way; StockFlow's 21 routers absorb
99 handlers. Both repos document the mapping in
`docs/BACKEND_FUNCTION_LIMIT_REORG.md`.

**Before consolidating anything, run `npm run functions:audit`.** A function
with no caller in the repo is usually *not* dead — the caller is outside the
repo, where grep cannot see it: a Base44 entity hook, a dashboard cron, an
agent `tool_config`, a webhook URL registered with a payment provider.
Renaming or deleting one breaks it silently, with no compile error and no
failing test. The audit prints what the repo can prove and flags the rest as
**REVISAR EN PANEL**; confirm those against `npx base44 functions list` (which
annotates `(N automation)`) and the Automations panel before touching them.
Treat any existing "deliberately left untouched" list as a lead, not a fact —
both apps' lists had gone stale.

---

## 12. Theme control — light, dark, and the device

Every app offers all three, from the same control, in the same place.

**Three modes, not two.** What gets stored is the operator's *preference* —
`'light' | 'dark' | 'system'` — never the resolved colour. `system` keeps
resolving against `prefers-color-scheme` for as long as it is selected, so a
phone that turns dark at sunset turns the app dark with it. A switcher that
stored the resolved colour would silently throw away the choice.

**One control, in a corner.** A small circle pinned to a screen corner showing
the mode in force; pressing it grows the circle sideways into a three-slot
track whose indicator slides to the chosen slot. Three states get three
physical positions, which is the thing a sun/moon toggle structurally cannot do
once "follow the device" is an option. The canonical implementation lives in
[`shared/theme/`](shared/theme/) — copy it, do not re-implement it, and do not
edit an app's copy in place.

**It is the only theme control in the app.** Sidebar toggles, header buttons and
command-palette entries that write the theme come out when the switcher goes in:
two writers of the theme class fight over it, and the older ones can only ever
reach two of the three modes. A command palette may keep *three* commands (one
per mode) — that is a keyboard shortcut to the same state, not a second writer
of a different model.

**No flash of the wrong theme.** `index.html` carries a pre-mount script that
resolves and applies the theme before the app mounts, using the same storage key
and the same three values as the provider. Both sides carry a comment pointing
at the other; they are kept in sync by hand.

**The dark palette has to actually be finished.** Wiring a switcher onto an app
whose screens are half hardcoded light colours ships a broken mode, which is
worse than not offering one. Before turning the control on: every surface comes
from a semantic token, and the colours that legitimately cannot (status chips —
red / amber / emerald washes) carry an explicit dark counterpart.

**It may not cover anything.** A control pinned above everything, in a corner,
on every screen is exactly the shape of thing that ends up sitting on a mobile
tab bar, a floating action button or a sticky *Guardar* — and when it does, the
app has lost a function at the one width nobody opened. Each app places the
control with `--theme-switcher-bottom` / `--theme-switcher-right` in its own
stylesheet and lifts it above its own bottom chrome per breakpoint:

```css
:root { --theme-switcher-bottom: 1rem; --theme-switcher-right: 1rem; }
@media (max-width: 767px) { :root { --theme-switcher-bottom: 5.5rem; } }
```

Placement is per-app because the chrome is per-app — a bottom tab bar on mobile
only, a rail on desktop, a FAB already holding one corner (Plink FX puts the
switcher bottom-**left** for exactly that reason). What is not per-app is the
obligation: **phone, tablet and desktop, collapsed and expanded**. Module 13's
suite checks it at all three widths in both states, so this is enforced rather
than promised.

Two directions both count as failure, and the check names them separately:
something painted over the switcher (the operator cannot change the theme), and
the switcher answering for a control underneath it (the operator cannot use the
app). Beware a parent that opens a stacking context — `isolation: isolate` or a
`transform` on an app shell confines the switcher's `z-index` inside it, so a
high number is not by itself proof of anything.

**An app may decline dark or light**, but only on a stated design ground, in its
own `CLAUDE.md`, naming the constraint — brand assets that only sit on one
ground, a physical use context. `kitchops` is the standing example: photographic
brand assets and copper that reads as mud on white, used in a kitchen at night.
An app that declines ships no switcher at all rather than a control with one
working option.


---

## 13. Live-site smoke test — `npm run test:smoke`

Every app has one, and it checks the **deployed** site rather than a local
build. That is the point: builds are green, and the failure that actually costs
days is a change that merged and was never served (Module 11). This is the
"verify by content, not by a commit hash" rule, automated.

The suite lives in [`shared/smoke/`](shared/smoke/) — `smoke.spec.js` is
byte-identical in every repo, `smoke.config.js` next to it holds the app's URL,
its `<title>` and how it represents the resolved theme. It asserts only what the
repo's own source provably produces:

1. the site answers 200 and the `<title>` is this app's — not a stale deploy;
2. nothing throws on first paint;
3. the theme arrives resolved on the first frame (the pre-mount script shipped);
4. the corner switcher is mounted, switches, and the preference survives a
   reload — or, for an app that declines a theme under Module 12, that no
   switcher is mounted at all;
5. the switcher covers nothing and is covered by nothing, at phone, tablet and
   desktop widths, collapsed and expanded (Module 12).

Assertions invented from guessed page copy do not belong here: they break on a
wording change and teach everyone to ignore the suite. App-specific checks go in
a sibling spec file (ctrlhq's `auth.spec.js` is the example).

It does not run in the push/PR job, and it cannot run from a development
sandbox — outbound HTTPS there is proxied to an allowlist that excludes these
domains. `.github/workflows/smoke.yml` runs it on `workflow_dispatch`, so it can
be fired the moment a deploy finishes, with a daily cron as the backstop.

**Expect it to be red on an app whose latest merge has not been deployed.** That
is the suite working, not failing: the fix is `npm run deploy:site`.

---

## 14. Multi-tenant isolation audit — standing, evidenced, repeated

Module 4 says how to write an RLS rule. This says: **go and check, on a
schedule, that nothing in the app can read or write another tenant's data** —
entities, functions, exports, mail, files, all of it. The two are not the same
job, and every cross-tenant defect this portfolio has actually shipped got past
correctly-written RLS somewhere else.

**Why a rule review is not enough.** The failures were all syntactically valid:

- **cateqhub, `Parish`**: `delete` carried a
  `{"user_condition":{"data.parish_role":"admin"}}` branch with **no entity-side
  tenant match**. Any parish admin could delete *any other parish* by SDK call.
  Valid JSON, valid rule, catastrophic. `update` had it too.
- **liuma**: `{"data.school_id": X, "user_condition": Y}` — the engine takes
  `user_condition` as the **only** key of its rule object and silently drops the
  sibling. The tenant clause was not enforced on **29 entities, 84 instances**.
  Nothing was malformed; the rule simply did not mean what it read as.
- **puntos, `Business`**: whole-record update for the tenant's own admin, with
  no field lock on `billing_status`/`license_plan`. Not a leak between tenants —
  a tenant editing the thing that governs its own access. Same shape found on
  rumbo's `TenantLicense`.
- **stockflow / flowfin / ctrlhq / rumbo**: a `PermissionProfile` override and
  `billing_status` both live on a *different row*, and these RLS engines cannot
  join. Both were enforced in the UI only until a `guardedEntityWrite`-style
  function was added. A hidden button is not an access control.

**What the audit covers.** Walk each of these and write down what you found,
per app, with the date:

1. **Every entity**: the four-op `$or`, both halves of every comparison, the
   service-role branch, and no role branch that is not `$and`-ed to a tenant
   match. Static checker in CI, plus a read of every rule the checker cannot
   judge.
2. **Every backend function**: the tenant is **re-derived server-side** from the
   caller's own record or token, never taken from the request body. On
   update/delete the check is against the **stored** record's tenant, not the
   submitted one. Enumerate the endpoints and tick them off — `npm run
   functions:audit` lists them.
3. **Field-level locks** on anything the tenant must not write about itself:
   licence state, plan, limits, role, tenant id. Module 1's "written only by
   Mission Control" is a lie unless the field is actually locked.
4. **Exports, reports and search**: the widest read paths in the app, and the
   ones most often written as "it runs as service role, it's for admins". Every
   read filtered by the caller's own tenant, re-derived (Module 7).
5. **Outbound anything**: mail recipients, webhooks, notification targets and
   file/attachment URLs read from the stored row, never from the request —
   otherwise a leaked password mails arbitrary files to arbitrary addresses.
6. **Tenant switching**: nothing from the previous tenant survives the switch —
   no cached list, no in-memory store, no stale `business_id` in a closure. And
   a switch into a tenant you do not belong to must answer the **same** refusal
   as a tenant that does not exist, so the endpoint is not an existence oracle.
7. **The deployed schema, not the repo file.** Re-read the live schema and diff
   it against the repo. A fix that was committed and never pushed is a fix that
   does not exist (Modules 4 and 11).

**Evidence, not assertion.** "Audited" means a dated line in the app's
`CLAUDE.md` naming what was checked, what was found, what was fixed and **what
could not be verified here** — an authenticated session as a restricted user of
a second tenant is usually the gap, and saying so is worth more than implying
coverage that was not achieved. Re-audit whenever an entity, a function or a
role is added, and at minimum whenever the app is audited against this standard
as a whole.

---

## Onboarding checklist for a brand-new app

1. Pick the backend kind and confirm an adapter exists in Mission Control
   (`api/_lib/adapters/`) — build one if this is a new kind (not `base44`).
2. Stand up the tenant entity with `billing_status` (Module 1) from day one —
   retrofitting it later means an audit/backfill script, not a migration.
3. Declare the role model in one file (Module 2) before writing any RLS rule
   that depends on it.
4. Stand up the permission registry + server-side "Safe function" pattern
   (Module 3) for every write path from the start — this is far cheaper before
   a permission bypass has shipped than after.
5. Write RLS with the four-op `$or` shape from Module 4 from the first entity,
   run the static validator in CI from commit one.
6. Add the health check endpoint (Module 5).
7. Wire `appConfig`-style versioning + release script (Module 6).
8. Build the Account/Danger-zone screen (Module 7) and the Support entry point
   (Module 8) before first tenant onboarding, not after.
9. Add the `apps/` page on `acaciaco-site` (Module 9) and register the app in
   Mission Control's `apps` table (`npm run onboard:base44 -- <repoPath> --dry`
   to preview).
10. Build the login page to the Module 10 bar.
11. Copy the theme switcher in from [`shared/theme/`](shared/theme/) (Module 12)
    and delete any other theme control.
12. Copy the smoke suite in from [`shared/smoke/`](shared/smoke/) (Module 13)
    and point its config at the app's real URL.
13. Run the Module 14 isolation audit before the **second** tenant exists —
    with one tenant nothing can leak, which is also why nothing gets caught.
14. Copy `CHECKLIST.md` from this repo into the new app's `CLAUDE.md`.

See [`CHECKLIST.md`](CHECKLIST.md) for the compact, copy-pasteable version of
this list, and [`docs/incidents.md`](docs/incidents.md) for the full postmortems
this standard was distilled from.
