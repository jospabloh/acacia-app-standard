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

**Two numbers are portfolio-wide constants, not per-app choices:**
- **Trial length is 30 calendar days**, set once at tenant creation
  (`trial_end_at = created_at + 30 days`, server time — never trust the
  client's clock for a commercial state). FlowFin's `createFamily.ts` already
  does exactly this; every app's own self-serve tenant creation (below) must
  match it.
- **Automatic renewal always lands on the 1st of the calendar month**,
  regardless of the app's own day-of-month convention for anything else.
  This is already true today — Mission Control's `licenseControl.js` forces
  `dayConvention: 'first_of_month'` on every Mercado Pago auto-charge
  (`dayConventionOverride`, "la renovación automática fuerza first_of_month
  ... sin importar el dayConvention normal del app") even for apps whose
  *manual* payment-confirmation convention is `preserve_day`. It was only
  ever documented in that one code comment; it is a portfolio rule now; an
  app's own `calculateExpiry`-equivalent (client-facing "renews on…" copy)
  must agree with it for anything auto-billed, and may use its own
  convention only for a manually-confirmed one-off payment.

**Self-serve tenant creation: automatic trial, and Mission Control has to
know immediately.** Any authenticated user with no tenant may create one —
this is how a portfolio app actually onboards its very first tenants, and
gating it behind an invite would mean nobody can ever be first. The new
tenant starts in `billing_status: 'trial'` with the 30-day clock above,
exactly like FlowFin's `createFamily.ts`. What FlowFin does **not** yet do,
and no app in the portfolio does yet, is the other half: **the platform
owner has to find out the same way a new support ticket does (Module 8),
not by waiting for the 08:00 UTC sync.** Fire-and-forget an ingest call the
moment the tenant is created — same shape as Module 8's `ticket-pull`
(`{app, tenant_id}`, HMAC-signed, `.catch(() => {})` so a notification
failure never blocks onboarding) — so Mission Control can write an `alerts`
row (`kind: 'new_tenant'`, the same `alerts` table `ingestTicket.js` already
writes `kind: 'support_ticket'` rows to) and push a notification to the
platform owner. **Built 2026-09-24:** Mission Control's `/api/ingest/tenant-pull`
(`{app, tenantId}`; MC re-reads the tenant through the bridge, so a forged
ping can't invent one) and, as a net for apps without the ping, the daily
licence sync announces any tenant new to the bodega. Both write one
`alerts` row (`kind: 'new_tenant'`) and email `SUPPORT_ALERT_EMAILS`.
StockFlow sends the ping from its signup; **every other app still has to
add the call site** — until then it is covered by the sync, within a day.
Still open: **nothing in Mission Control's own UI reads the `alerts` table
at all**, including the `support_ticket` rows it already writes. Building the ingest endpoint
without also surfacing `alerts` somewhere an operator actually looks (a
Dashboard widget, at minimum) would make the write real but the alert
invisible; both halves are the module, same as Module 8's "write it, then
make sure someone sees it in real time, not just in a sync job" shape.

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

**Who can change an admin's role, and how a new member gets in at all** — two
rules that hold for every app, whatever the role model's exact names are:

- **Only a tenant's own admin can promote a member to admin or demote a
  fellow admin to a lower role.** Same server-derivation discipline as
  Module 7's danger zone (the actor's admin status is re-checked against
  their own stored membership in *this* tenant, never assumed from a client
  flag) — promoting and demoting are the same operation with the direction
  flipped, so they share one code path and one gate, not two that can drift.
  Guard against locking a tenant out of its own admin tier: a demote that
  would leave zero admins on the tenant is rejected, not silently allowed —
  there is no support-ticket-free way back in once that happens.
- **A member joins an existing tenant one of two ways: an invite code, or
  an emailed invite** — never an open "anyone who signs up lands in this
  tenant" path (that's what self-serve tenant *creation*, Module 1, is for;
  joining an *existing* one is different and needs the existing admin's
  consent). A code is share-anything, request-then-approve (FlowFin's
  `join_code` + `selfJoin`/`approveMember` pattern: the code gets a pending
  request in front of the tenant's admin, it does not grant access by
  itself). An emailed invite is admin-initiated and pre-approved — the admin
  names who they're inviting, so there's no separate approval step once the
  invitee accepts. An app needs at least one of the two; needing both
  depends on how the tenant actually recruits members (FlowFin currently
  ships only the code path — no emailed-invite action exists yet, a gap
  worth closing given most of its families are recruited by a family member
  sending a code over chat, exactly the case an emailed invite is for).

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

**The registry needs an admin-facing screen, not just a registry file.** A
`permissionRegistry.js` that only ever gets *read* by `can()` hooks is a
developer-only artifact — the tenant's own admin has no way to see or change
what a role can do without filing a support ticket. Ship a "Permisos" page
(pattern: FlowFin's `src/pages/PermissionAdmin.jsx`) gated to the tenant admin
(and platform-owner) that renders the **same registry** as a matrix — one row
per module/section, one column per action (ver/crear/modificar/eliminar,
whatever the app's `PERMISSION_COLUMNS` are) — with a tri-state group checkbox
per module (on/off/mixed across its sections) plus per-section overrides, an
explicit edit/read-only toggle so browsing the matrix can't fat-finger a
change, and each toggle persisted immediately to the same per-tenant
`RolePermission`-equivalent entity the server-side re-check already reads —
never a second config surface the backend doesn't consult. This is what turns
Module 3 from "the developer encoded a default" into "the admin approved
what their own team can see and do," and it is the natural place to surface
*everything the app manages and shows*, module by module, rather than a
tenant admin discovering a section exists only when a member reports they
can't see it.

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

**The danger zone is two different scopes, and an app that only ships one has
only half of it.** "Delete my account" (leave the tenant, drop *my own*
membership) is not the same operation as "delete the tenant" (the whole
family/business/organization, every other member's access with it), and a
member-scoped delete button is not a substitute for a tenant-scoped one —
FlowFin shipped exactly the first and not the second: `AccountSettings.jsx`'s
danger zone removes the caller's own `FamilyMembership` and disconnects them,
but there is no path anywhere in the app for a tenant admin to delete the
*tenant itself*, hand it to someone else, or promote a member to admin
without going through ACACIA. A tenant admin needs all three, gated to
`role: admin`-of-that-tenant (never a platform-wide check) and each behind
its own confirmation step:
- **Delete tenant.** Irreversible, same cascade-or-document rule as account
  deletion above, but for every entity the *tenant* owns — every member loses
  access, not just the admin. This is the operation Mission Control's own
  danger zone (`api/_lib/control/license-record.js`'s `purge`) deliberately
  does **not** perform on your app's data — see Module 0: your app is the
  source of truth, so only your app can do a real delete, and only your app's
  own admin should be able to trigger it.
- **Delegate the tenant** (transfer ownership/admin to another existing
  member). Re-derive the target from the tenant's own membership list
  server-side — never trust a user id the client sent — and require the
  target to already be an approved member, the same "an id in the request
  body is not proof of anything" discipline Module 14 demands of every other
  cross-tenant-shaped write. The outgoing admin either keeps a regular-member
  role or is removed, an explicit choice the confirmation step should state,
  not an implicit side effect.
- **Promote a member to tenant admin** (without necessarily transferring
  sole ownership — an app whose role model supports more than one admin per
  tenant, Module 2). Same server-side re-derivation as delegation: the actor
  must already be that tenant's admin, and the target must already be an
  approved member of the *same* tenant, checked against the stored
  membership record, not the request.

None of this is Mission Control's job — Module 1 already draws that line for
billing, and it holds here too: a *tenant's own* leadership changes belong to
the tenant's own admin, in the tenant's own app, the same way a delete does.

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
- **Tell Mission Control the moment the ticket is written — the daily sync is
  a backstop, not the delivery.** `api/cron/sync` runs once, at 08:00 UTC. An
  app that relies on it alone leaves a customer who wrote at 09:00 waiting
  twenty-three hours before support even knows. Real-time notification is part
  of this module, not an optimization on top of it.

There are two sanctioned ways to do it, and which one an app uses is decided by
where its ticket gets created, not by preference:

| the ticket is created… | do this | who |
|---|---|---|
| by a backend function already | sign and POST the record from that function to `/api/ingest/ticket` | rumbo (inline in `submitTicket`), puntos / liuma / radar (a `notifyTicketCreated` function) |
| by the browser | `POST /api/ingest/ticket-pull` with `{app, ticketId}` | cateqhub, flowfin, stockflow, ctrlhq, kitchops |

**Prefer `ticket-pull` unless a signer already exists.** It carries no secret,
costs no function slot (Base44 caps an app at 50 and two apps are near it), and
its body is not trusted: Mission Control takes only the id and reads the real
record back over the `acaciaControl` bridge, so a forged body cannot inject a
ticket and an unknown id just no-ops. Either way the call is fire-and-forget —
`.catch(() => {})` — because a notification that fails must never cost the
customer their ticket.

Cover **every** place a ticket is born, not just the support page: the
account-deletion request in Module 7's danger zone is a ticket too, and it is
the one nobody remembers to wire.

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
- **A real in-app screen, not Base44's default hosted login.** Never send the
  user to `base44.auth.redirectToLogin()`'s own generic page — that page is
  the same for every Base44 app on the platform and carries none of this
  app's branding, so a tenant clicking through from `acaciaco-site` lands
  somewhere that visibly isn't the product they were just looking at.
  Canonical pattern: FlowFin's `src/pages/Login.jsx` renders its own
  email/password fields and calls `base44.auth.loginViaEmailPassword(email,
  password)` directly (plus `base44.auth.loginWithProvider('google', ...)`
  for OAuth) — the credential entry itself happens on this app's own route,
  under this app's own layout, never a redirect away from it.
- **A split-screen shell, not a single centered card.** Form on the left
  (logo lockup, the icon/title/subtitle/children/footer stack, a short
  tagline pinned at the bottom), a branded panel on the right with an
  eyebrow badge, a headline and one line of supporting copy — hidden below
  `lg`, not squeezed into the mobile layout. Copy
  [`shared/auth/AuthLayout.example.jsx`](shared/auth/) in rather than
  building this from prose alone: FlowFin and StockFlow converged on this
  shape independently before it was written down here, and ArtisKids shipped
  without it (a plain centered card, `--primary` still shadcn's near-black
  scaffold default) and only got caught when someone compared it against its
  siblings — see `shared/auth/README.md` for the `--primary` gotcha that
  caused that specifically.
- Same visual language as the rest of the app (design tokens, not one-off
  colors) and as `acaciaco-site`'s own branding — a user clicking through from
  the marketing site should not land somewhere that looks like a different
  product.
- Real states: loading, wrong-credentials, account `suspended`/`view_only`
  (Module 1) explained in plain language instead of a generic auth error,
  rate-limit/lockout feedback if you have one.
- No dead ends: a link to request access / start a trial (→ the app's
  `acaciaco-site` page), and to support (Module 8) for a locked-out tenant.
- **Never show a social login button for a provider that isn't actually
  enabled on the backend.** `loginWithProvider('apple', ...)` against a
  provider Base44 hasn't configured for this app doesn't degrade gracefully
  — it throws the platform's raw error (`Apple authentication is not enabled
  for this app. Please contact the app admin for access.`) before any
  account exists, so tapping it is a dead end at the very first screen, with
  nothing the user can do about it and no account for the app's own owner to
  even find and debug. Found in Rumbo (`docs/incidents.md`): a prospective
  tenant employee tapped "Continuar con Apple," hit exactly that error, and
  never got an account at all — invisible until the user reported it by
  hand, because there was no account to notice was missing. Every social
  button offered must correspond to a provider actually configured for that
  Base44 app; one that isn't gets removed from the UI, not left for a user
  to discover is dead.
- Dark-theme correct by default, like every other screen (Module 12's
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
  nothing**, neither functions nor site. That was believed otherwise for
  months, and it cost FlowFin three days of 404s on its main write path (a
  server function in `main` since 2026-08-18 that nothing had deployed, called
  by a frontend that *was* being served) plus a merged, CI-green frontend fix
  still unserved four hours later. Separate from `deploy` so a UI change
  doesn't re-walk 45 functions, and so the step that went missing is the one
  you run on purpose.
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

**What the automated half does not reach, and what you owe because of it.** The
suite holds no credentials on purpose, so it only visits the routes an anonymous
visitor can — the home page, plus whatever the app lists in `config.routes`.
List the public screens whose chrome differs (register, password reset, a 404);
that is cheap and it is where a second corner control usually turns up. But a
sticky *Guardar* on an authenticated edit screen is **not** covered, and no
amount of green here says otherwise. **Look at the corner by hand on the first
deploy of any app whose authenticated chrome changed**, and write what you found
in its `CLAUDE.md` — including that you could not check it, if you could not.

The check is deliberately not a rectangle-intersection test: a control clipped
at one corner by a rounded bubble is still usable, and a suite that fails on
that is a suite people learn to ignore. The switcher itself is probed at five
points rather than one, because a bar across its lower half leaves the centre
pixel free and a one-point check calls that fine. Each other control is judged
by its own midpoint — and that is a result, not a shortcut: for two axis-aligned
rectangles, an overlap covering half a control's area always contains that
control's centre, so an area threshold would be unreachable code pretending to
add coverage. Anything small and separately clickable in the overlapped corner
is its own element and gets its own midpoint.

**An app may decline dark or light**, but only on a stated design ground, in its
own `CLAUDE.md`, naming the constraint — brand assets that only sit on one
ground, a physical use context. An app that declines ships no switcher at all
rather than a control with one working option, and Module 13's suite then
asserts the absence instead of the behaviour.

Treat a decline as a dated estimate of the work, not a permanent exemption.
`kitchops` declined on exactly those grounds — photographic brand assets, copper
that reads as mud on white, a phone in a dark kitchen — and then did it anyway a
day later, which is worth reading before writing your own decline, because the
three answers generalise:

- **Photographic assets keep their own ground** rather than being re-lit. The
  mark sits in a tile that stays dark in both themes, which on a light screen
  reads as a stamped medallion. A whole panel can do the same by scoping the
  `dark` class to that subtree — every colour is a variable, so the subtree
  inherits the other theme with no `dark:` variants at all.
- **A brand colour that fails on the other ground splits in two**, it does not
  move. The fill keeps the true value in both themes; only the *ink* changes.
  Measure it: kitchops' copper is 3.4:1 as text on a light card and 7.1:1 once
  oxidised, and it is used as text 36 times against a solid fill twice.
- **"It is used in the dark"** is an argument about the **default**, which the
  app keeps. It is not an argument about the second theme existing.

Turning a second theme on is also the cheapest audit of the first one: doing it
in kitchops surfaced a dark-on-dark chat bubble, three scaffold screens painted
with Tailwind classes its own config had deleted, an invisible 420px strip of
the toast viewport eating every click in the bottom-right corner, and a login
headline that had been overlapping itself in **both** themes.


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
   desktop widths, collapsed and expanded, on every route the app lists in
   `config.routes` (Module 12). Public routes only — the suite has no
   credentials, and Module 12 says what you owe for the screens it cannot see.

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
6. **Anything that moves the caller's tenant pointer** — onboarding, redeeming
   an invite code, an admin reassigning someone. Nothing from the previous
   tenant may survive it: no cached list, no in-memory store, no stale
   `business_id` in a closure. And a request naming a tenant the caller has no
   claim to must answer the **same** refusal as a tenant that does not exist,
   so the endpoint is not an existence oracle. (Module 18 is retired — an
   account holds one tenant and there is no switcher — but these two rules
   still govern every remaining path that writes that field.)
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

## 15. The bridge to Mission Control — one shape, one key per app

Every app talks to Mission Control through the same two channels, and they are
not optional or app-flavoured. This module exists because "the same" turned out
to mean "the same secret", which is not the same thing at all.

**The channels.** Mission Control calls the app's `acaciaControl` function over
an HMAC-signed body for everything app-specific — licence read/write, health
`ping`, ticket pull, usage and session sync. The app calls Mission Control's
`/api/ingest/ticket` the moment a customer raises a ticket, also HMAC-signed.
An app that also exposes a bare `health` or a cron-ish endpoint gates it with a
bearer value instead, because there is no body to sign.

**The key is derived per app, never the master.**

```
appKey = HMAC-SHA256(INGEST_HMAC_SECRET, "acacia.app.v1." + <slug>)
```

`<slug>` is the app's Mission Control id — `apps.id` in the bodega, and the
`ACACIA_APP_SLUG` app secret on the app side. Both are required; an app that
does not know its own slug cannot join the bridge.

The reason is narrow and worth stating plainly. `INGEST_HMAC_SECRET` is **one
value shared by the whole portfolio**. A signature made with it proves "someone
who holds the shared secret" — it can never prove "this is app X". The
module-14 audit of Mission Control (2026-08-23) found the consequence: the app
name travels in the request body, so any app could sign a payload naming a
different app and have Mission Control write a ticket under that attribution.
Not an outsider hole — the holders are ACACIA's own apps — but a blast-radius
one: leak one app's secret and you have leaked all nine, and that same value is
also the bearer several `health` endpoints accept and what authorises
`license.set`.

Deriving fixes it because the slug selects the key. A body claiming to be
another app is checked against *that* app's key and fails unless the sender
actually holds it.

**Copy [`shared/bridge/acaciaSign.ts`](shared/bridge/acaciaSign.ts) in**, at
`base44/functions/<fn>/_acaciaSign.ts`, unchanged. Deno isolates each function
directory, so an app whose bridge touches three functions carries three
identical copies; that is expected, and a drift check in CI is what keeps them
identical by construction rather than by discipline. Mission Control's Node
half lives in `api/_lib/ingestSign.js` and pins **the same test vector** — two
HMAC implementations in two runtimes only stay equal if something asserts it,
and a drift shows up at runtime as `bad signature` on every call, which reads
like a misconfigured secret rather than a code change.

**Copy [`shared/bridge/acaciaSign.test.ts`](shared/bridge/acaciaSign.test.ts)
in too**, wherever the app's CI already runs `deno test`, changing only the
import path. It has no external imports and touches no network, so it runs in a
sandbox where `jsr.io` and `deno.land` are blocked. It pins the cross-language
vector and asserts the thing this module exists for: a body signed by one app
claiming to be another **fails**. Put it at the functions ROOT, never inside a
function directory — every directory under `base44/functions/` becomes a
deployed endpoint, and a test file is not one.

**Delete the inline crypto the copy replaces.** Each `acaciaControl` carried its
own `stableStringify`/`hmacHex`/`timingSafeEqual`, hand-mirrored against Mission
Control. Once `_acaciaSign.ts` owns them, leaving the old ones is not tidiness —
it is a second implementation of the same routine sitting in the same file,
which is precisely the drift this module removes. `deno lint`'s `no-unused-vars`
catches it in the three repos that run it; the other six have no deno step, so
there the only guard is doing it.

**The migration ran on 2026-08-24 and the flag can now go `false` everywhere:**
a sync of all nine apps at 16:29 UTC produced nine audit rows and **zero**
"rejected the derived key" warnings in Mission Control's log for that window.
That measurement is the gate, and it is the second one — the first attempt at
the same sync had four apps fall back (below). A new app starts at `false`
regardless: it has no legacy signature in flight.

The sequence below is the shape to copy the next time a shared secret has to
change under a fleet that deploys at different times:

1. **Verify both keys, sign with the old one.** Mission Control deploys on
   merge and the apps by hand, so MC is always first. Accepting either key made
   deploy order irrelevant; nothing went dark waiting for the slowest app.
2. **Switch the signer, keeping a fallback that names names.** MC signed
   derived and, only on a signature rejection, retried with the master and
   logged *which* app had rejected it. MC cannot read an app's Base44 secrets,
   so this was the only way to find a missing or misspelled `ACACIA_APP_SLUG`
   without taking that app's bridge down to discover it.
3. **Flip the flag and delete the fallback, in the same commit.** Once the flag
   is off, a wrong slug must fail rather than degrade — a fallback left behind
   would be exactly the silent acceptance the whole change removes.

**Step 3 waits on evidence, and the evidence is a log you actually read.** The
gate is a full sync of every app followed by Mission Control's runtime log for
that window, containing zero "rejected the derived key" warnings. Anything less
is a guess.

This is written the way it is because step 3 was first taken on a guess. The
sync ran, the flag went false and the fallback was deleted, on the strength of
a sentence — *"every call verified derived on the first attempt and the
fallback never fired once"* — that was composed rather than checked. The log of
that very sync named four apps that had fallen back: radar, rumbo, puntos and
liuma. They lost their bridge until it was reverted twenty minutes later, and
the revert had to be rebased and re-PRed because the bad change had already
been merged into all nine repos in the meantime.

The split was informative, which is the point of step 2's log line: the five
that verified derived were the five whose `ACACIA_APP_SLUG` had just been set;
the four that failed were the four that "already had it" — a claim inherited
from their own `CLAUDE.md` files and never once read back. The value was wrong.
Correcting the secret in those four and re-running the sync produced the clean
log above.

Three lessons, and the last two generalise past this module:

- **A fallback that names names is worthless if nobody reads what it named.**
  Step 2's whole purpose is to convert an outage into a log line. Skipping the
  log converts it back.
- **Watch for the reasoning that runs the wrong way.** Earlier in the same
  rollout, two apps showed doubled bridge latency and that was taken as a sign
  of the fallback firing; it was cold starts, checked and dismissed correctly.
  Having disproved a false alarm, the next step was to treat the absence of an
  alarm as proof — without looking. Disproving one signal is not evidence about
  a different one.
- **"It is already set" is a claim about a value, and a value can be read.**
  Four apps were documented as configured, in writing, in four files, for days.
  Nobody had opened the secrets panel. See Module 16.

**Do not give the bridge secret a second job.** Mission Control's `track.js`
used `INGEST_HMAC_SECRET` as the fallback salt for hashing visitor IPs, so
rotating the bridge secret would have silently rebucketed every unique-visitor
count. An auth secret authenticates; anything else that needs a stable random
string gets its own.

---

## 16. Secrets & configuration — the inventory, and reading it back

Every module above assumes some value is set somewhere. None of them say where,
and until 2026-08-24 no page in this repo listed them together. That gap has now
cost the portfolio two separate outages, in opposite directions:

- **A guard that never guarded.** Mission Control's four crons were gated by
  `if (secret && req.headers.authorization !== ...)`. With `CRON_SECRET` unset,
  the leading `secret &&` skipped the check entirely — and it *was* unset. An
  anonymous GET ran the full portfolio sync and returned every app's tenant,
  licence, ticket and session counts in the body.
- **A secret that was set to the wrong thing.** Four apps carried
  `ACACIA_APP_SLUG`, were documented as carrying it, and derived a key that did
  not match Mission Control's. Nobody had opened the panel to look.

The rule both give you:

> **A config value nobody has read back is not configured. Documentation that
> says it is set is a claim about someone's memory, not about the system.**

And its corollary, which is Module 11's rule wearing different clothes:
verifying by content, not by belief, applies to environment as much as to code.

### The portfolio-wide inventory

These are the values that exist because of *this standard*. Anything else an app
needs (payment keys, wallet certificates, model API keys) is that app's business
and belongs in its own `CLAUDE.md`.

| value | lives in | why | how to read it back |
|---|---|---|---|
| `INGEST_HMAC_SECRET` | Mission Control (Vercel) **and** every app (Base44 secrets) — one identical value portfolio-wide | the master the per-app bridge key is derived from (Module 15) | never used directly any more; a wrong value shows as `bad signature` on every bridge call |
| `ACACIA_APP_SLUG` | each app (Base44 secrets) | must equal the app's `apps.id` in the bodega, exactly: lowercase, no spaces, no suffix | run a sync and read MC's log for `rejected the derived key` — silence is the pass |
| `ACACIA_MC_INGEST_URL` | apps that push tickets from a backend function | where `notifyTicketCreated` / `submitTicket` POST (Module 8) | a ticket raised in the app appears in MC within seconds, not at 08:00 UTC |
| `CRON_SECRET` | Mission Control (Vercel); also apps with their own internal jobs | gates every scheduled endpoint, **fail-closed** — unset must mean 503, never 200 | an anonymous GET to a cron path must not return 200 |
| `PLATFORM_OWNER_EMAIL` | most apps | the one identity that may run platform-tier functions | a platform function must 403 for any other caller **and** when the value is absent |
| `TRACK_SALT` | Mission Control | the salt for hashing visitor IPs | — |

**Two names for one idea, and it is still that way.** Three apps call the owner
identity `PLATFORM_OWNER_EMAIL` (radar, stockflow, kitchops), three call it
`APP_OWNER_EMAIL` (rumbo, puntos, flowfin), and three use neither because their
platform tier is a role rather than an address (liuma, cateqhub, ctrlhq). A new
app uses `PLATFORM_OWNER_EMAIL`. The existing split is recorded here rather than
renamed, because renaming a secret in six live apps to tidy a name is a change
with an outage in it and no user on the other side.

### Fail closed, and prove which way it fails

Every guard built on one of these must reject when the value is **missing**, not
open. This is the single most repeated defect in `docs/incidents.md`: flowfin
learned it by making `_internalGuard.ts` fail-open and silently disabling three
crons; Mission Control learned it by leaving four crons wide open in production;
radar learned it when an emptied `Company` table re-opened a founder-bootstrap
branch that was supposed to be dead forever.

Write the guard so the unset case is an explicit branch, and then **test that
branch** — `assert(guard(undefined) === reject)` is one line and it is the line
that matters.

### When a value has to change

Rotating a shared secret across a fleet that deploys at different times has a
shape, and Module 15 documents it end to end: accept both, switch the writer
with a fallback that names names, then flip and delete the fallback **on a
measurement**. Do not invent a second procedure.

And do not give an auth secret a second job. Mission Control's `track.js` used
`INGEST_HMAC_SECRET` as the fallback salt for visitor-IP hashing, so rotating
the bridge key would have silently rebucketed every unique-visitor count.
Anything that needs a stable random string gets its own.

---

## 17. The Mission Control side — an app is not onboarded until MC knows it

Modules 1–16 are what the app does. This one is what has to change **in Mission
Control**, and it is the half that gets forgotten, because the app looks
finished from inside the app.

Registration alone wires the config, not the data path. ctrlhq sat registered
in MC's `apps` table with its bridge undeployed, so licences, health and tickets
were all configured and none of them moved.

1. **A row in `apps`** (the bodega) — `id` is the slug the whole standard keys
   off: `ACACIA_APP_SLUG`, the `app` field in every bridge body, `target_app` in
   the audit log. `npm run onboard:base44 -- <repoPath> --dry` previews the row.
2. **An adapter** in `api/_lib/adapters/` — `base44` covers today's whole
   portfolio; a genuinely new backend kind needs one written.
3. **`api/_lib/licenseControl.js`** — the app's licence capabilities: its
   statuses, plans, which fields hold expiry and period end, its billing mode.
   Miss this and the Licencias panel renders that app's licences with no
   buttons at all, which is exactly how radar shipped.
4. **`api/_lib/ticketControl.js`** — where its tickets live and how its thread
   is shaped, so the operator's queue can read and reply.
5. **`api/_lib/messaging.js`** — the copy used when MC mails that app's tenants.
6. **The client catalogue mirror** — `src/lib/licenseCatalog.js` is the browser
   copy of `licenseCapabilities()`, and `src/lib/licenseCatalog.test.js` fails
   if the two drift. Adding an app or a status means updating both; there is
   deliberately no silent way to forget.

**Then confirm the data actually round-trips**, which is not the same as
confirming the code merged: press *Sincronizar ahora* on the app's page in MC
and check that `app_health` has a row for it with `status: ok` and that
`audit_actions` gained a `control:run-sync` for that app. `run-sync` answers 502
when the bridge throws and writes its audit row only on success, so that row is
the proof.

---

## 18. RETIRED (2026-09-10) — one account, one tenant

**This module used to require the opposite of what it now requires.** It asked
every app to let one email hold several tenants and move between them, on a
first-class `Membership` entity, with a switcher control and a join flow that
never refused a second tenant. That was built across eight apps and **none of
it ever reached production**. It was removed from all eight on 2026-09-10.
What follows is the rule that replaces it, the doors the removal obliges you
to close, and the parts of the old module that outlived it — because a future
audit reading a checklist item will otherwise rebuild the whole thing.

**The rule now: an account belongs to exactly one tenant, and the user record
IS the membership.** `User.business_id` / `tenant_id` / `parish_id` /
`school_id` / `family_id` — whatever this app calls it — names the one tenant,
is `rls.write`-locked to the service tier (Module 14), and is what every
entity's RLS compares against. There is no second row recording the same fact,
and no in-app way to move to another tenant.

**Why the reversal, stated plainly, because "we changed our minds" is not a
reason anyone can audit against.** Three things, in order of weight:

1. **A second record of membership is a second thing that can disagree with
   the first.** Puntos shipped exactly that bug: `manageTeamMember` revoked a
   member by clearing their `User` fields, `switchBusiness` read the
   `Membership` row alone and never re-read the `User`, so the person who had
   just been removed could call `switchBusiness` with that same tenant id and
   get their role, store and access back. It was found by review, patched on
   2026-09-07 with a mirror-sync, and the patch was itself a second thing to
   keep in sync. Retiring the entity removes the class, not the instance —
   the hole cannot reopen because the floor it stood on is gone.
2. **The feature never had a user.** Three `Membership` rows existed across
   the entire portfolio at retirement — one each in ctrlhq, kitchops and
   cateqhub, all three the platform owner's own, all written by the code that
   created them. Puntos and stockflow had zero. Nobody was ever switching.
3. **It cost more to keep correct than it returned.** Rumbo's switcher alone
   produced three dated sections in its `CLAUDE.md` and three different root
   causes, two of which were wrong — both arrived at by reasoning about the
   document's shape without ever checking whether the write executed at all.
   Module 22 exists because of that debugging.

**What the removal obliges you to close, and this is the half that is easy to
miss.** Taking the switcher out is not just deleting components. The switcher
was load-bearing for one thing: it was the way back. Without it, anything that
*moves* the tenant pointer strands the previous tenant with no route to it —
so the flows that used to move it must now refuse instead.

1. **Creating a tenant, or redeeming an invite code, must answer 409 to a
   caller who already has one.** Both used to be allowed precisely because a
   switcher existed to get back. They are now a one-way door, which is the
   defect the old module's own header described. The platform owner
   (`role: admin`, cross-tenant by definition) is the one exception. Redeeming
   the code of the tenant you are already in stays idempotent — that is not a
   second tenant.
2. **Check before you create, not after.** StockFlow's `createBusinessSafe`
   puts the 409 ahead of the `Business.create`; doing it the other way leaves
   an orphaned tenant with a live invite code and nobody inside. CtrlHQ
   accumulated five of those before anyone noticed, and they had to be
   neutralized by hand.
3. **Revocation is now one write, and that is the point.** Clearing the user's
   tenant pointer IS the removal — there is no second row granting a way back,
   so there is nothing else to delete and nothing that can fall out of sync.
   Any mirror-sync helper that existed to keep a `Membership` row in step with
   the `User` (puntos' `syncMembership`, added 2026-09-07) goes with it.
4. **"Leave this tenant" is not a standalone feature.** Module 7's
   member-scoped danger zone still applies unchanged — a member can delete
   their own account and disconnect. What no longer exists is leaving *in
   order to go somewhere else*: there is nowhere else, so a bare "salir de la
   organización" control just strands the account on the onboarding screen.
   Removing a member is the tenant admin's action, via the app's own
   member-management function.
5. **The tenant-scoped resolution rule stays exactly one function.** This is
   the piece most likely to be quietly dropped as "part of the switcher," and
   it is not. Where an app can still legitimately hold more than one profile
   row for a caller — LIUMA's `UserProfile`, FlowFin's `FamilyMembership` — the
   rule that picks which one is current must be a single, **deterministically
   ordered** function shared by every reader. LIUMA's Module 14 audit
   (2026-08-23) found three different answers to "which school am I in" —
   `tenantSelection.js`, two backend functions using an unordered `.find()`,
   and `NavContext` taking `[0]` — and Base44's `filter()` guarantees no
   order, so "Download my data" could silently return the tenant you were not
   looking at. FlowFin's was worse in shape: its context read `results[0]`
   while its **write** path honoured the persisted pointer, so reads and
   writes could land in different tenants with no error. Both fixes survive
   the retirement and must not be reverted with it.

**One app keeps its membership entity, and the distinction matters.**
FlowFin's `FamilyMembership` is **not** the retired feature — it predates it
and is the central record the whole app runs on (`resolveFamilyAccess`,
`selfJoin`, `approveMember`, `removeMember`). What was removed there is only
the layer that let one email *choose* between several families. Before
deleting a "membership"-shaped entity in any app, establish which of the two
it is: a mirror of a field that already exists on the user (delete it), or the
authoritative record itself (keep it).

**Deleting the entity is a manual, order-sensitive step.** Base44 refuses to
drop an entity schema that still has rows, and `entities push` is
**all-or-nothing** — one blocked entity failed rumbo's entire push of 27. So:
delete the surviving rows first, then push. Merging changes none of this
(Module 11).

**Verify it like every other module: read the deployed behavior, not the
diff.** (a) Grep the repo for any remaining reader or writer of the retired
entity — there must be none before you drop it; (b) from an account that
already has a tenant, attempt to create a second and to redeem another
tenant's invite code — both must answer 409, and the first must leave no new
tenant row behind; (c) remove a member and confirm nothing anywhere still
grants them the old tenant; (d) confirm the current-tenant resolver is one
function with a deterministic order, called by every reader — feed it the same
set in reversed order and get the same answer; (e) confirm the entity is gone
from the **deployed** schema, not just the repo.

---

## 19. A shipped security fix needs a guard of its own

Modules 1–18 are about closing a hole. This one is about the hole staying
closed — because closing it once is not the same job as keeping it closed, and
this portfolio has now watched a correctly-shipped, correctly-deployed fix get
silently reverted by a **different, well-meaning debugging session** that had
no idea the lock it removed was load-bearing.

**The incident.** FlowFin's `User.family_id` field carries a locked
`rls.write: {user_condition: {role: admin}}` — Module 14 finding #1's fix,
shipped and verified live. A user reported being stuck on the onboarding
screen. A separate agent session (Base44's own in-app builder, working
directly against the live app, outside the git/PR path this fix shipped
through) diagnosed the symptom, reasoned that this write lock was "stripping
`family_id` from non-admin reads," and removed it. **That reasoning is not
just risky, it is factually wrong**: an `rls.write` rule governs write
eligibility only and has no bearing on what a read returns. Removing the lock
could not have fixed a read-resolution symptom — and per that session's own
transcript, it didn't: the user was still stuck afterward, through two more
rounds of unrelated speculative fixes, while the actual hole (any user can now
set their own tenant pointer to any value and read that tenant's data) sat
open in production. It was only caught because a second, independent
diagnosis re-checked the deployed schema directly instead of trusting either
session's narrative — and by then the reverted lock had already round-tripped
into the git source of truth too, so restoring it live was not enough; the
repo needed the same fix or the next ordinary entity deploy would have
silently stripped it again.

**Why a rule review is not enough, again — same shape as Module 14, one layer
up.** The failure here was never a bad RLS rule. It was a **correct** rule,
removed by someone reasoning about a mechanism they had backwards, under
symptom pressure, with no visibility into why the rule existed. Nothing about
this is specific to Base44's builder — it is what happens whenever more than
one path can write to an app's schema (a git-based agent session, a platform's
own in-app AI, a teammate under pressure) and a security-relevant lock's
rationale lives somewhere the person touching it isn't reading.

**What closes this:**

1. **A lock's own field description carries its rationale, not just the
   module/finding number.** State plainly, in the schema itself, what the
   field is for, what breaks if it's removed, and — critically — **which
   operation it governs** (write, not read; or vice versa). An agent
   inspecting the live schema in isolation, with no access to this repo's
   `STANDARD.md` or the app's `CLAUDE.md`, should still be unable to
   misdiagnose the mechanism.
2. **State the mechanism precisely before touching the control, and verify it
   before, not after.** "This lock might be related" is not a diagnosis. A
   write rule cannot produce a read-only symptom and a read rule cannot
   produce a write failure — if the proposed fix doesn't match that shape,
   the diagnosis is wrong regardless of how plausible it sounds. Prove which
   rule is actually implicated with live evidence (reproduce the symptom,
   isolate to the specific rule) before loosening anything security-relevant,
   the same evidence bar Module 14 already demands for writing one.
3. **A "fix" that doesn't resolve the symptom is evidence the diagnosis was
   wrong, not license to try the next hypothesis on top of it.** The correct
   response to "I removed the lock and the user is still stuck" is to put
   the lock back immediately and re-diagnose — not to leave it open while
   stacking a session-clearing theory, then a frontend-fallback theory, on
   top. An open security hole is not an acceptable cost of an in-progress
   debugging session, however urgent the original symptom.
4. **When more than one surface can write to the same app, a security-relevant
   schema change on either surface must be checked against the other
   immediately.** Restoring a lock live (via a direct schema-edit path) is not
   done until the git-tracked schema file agrees — otherwise the next routine
   deploy from whichever surface didn't get the memo silently undoes the fix,
   and the drift can sit unnoticed until the next audit.
5. **Roll this into the Module 14 re-audit.** Every lock that audit already
   requires (Module 1's `billing_status`, Module 14's own field locks, a
   `business_id`/`family_id`-equivalent tenant pointer) gets checked for drift
   at the same cadence: deployed schema vs. repo file, not just "is the rule
   present" but "does it still say what it said last time," because a lock
   that silently loosened between audits is indistinguishable from one that
   was never tightened.

---

## 20. Session control — inactivity timeout, one active device, stale sessions reaped

Every app logs users out on its own, in three layers that catch different
failure modes. A client-side idle timer alone only protects the tab that is
still open and running JavaScript; it does nothing for a laptop that was
closed mid-session or a phone whose browser was killed by the OS. All three
layers are the module, not any one of them.

**Layer 1 — client-side inactivity.** A warning dialog after a fixed idle
period, then a hard logout shortly after if nobody responds. Canonical
implementation: [`shared/session/`](shared/session/), lifted from FlowFin's
`useSessionManager.js` (20 min idle → warning, 2 min countdown → logout,
`IdleWarningDialog.jsx` shows the countdown live) and
`IdleWarningDialog.jsx`/`SessionExpiredDialog.jsx`'s explicit re-auth choice
(log back in, or fully sign out). Copy these in unchanged, the same discipline
as Module 12's theme switcher and Module 15's bridge signer — an app that
edits its own copy in place drifts, and an operator running two ACACIA apps
should meet the same warning at the same threshold in both. Activity is
tracked with a throttled `useActivityTracker` (FlowFin: one write per hour,
not per keystroke) so the idle timer resets from real DOM events without
hammering the backend.

**Layer 2 — one active device per user, surfaced, not silently blocked.**
Track a `Session` (or equivalent) row per `(user, device_id)`, updated on
every heartbeat. Logging in from a new device marks that device `active` and
demotes the user's other `active` sessions to `passive` — the older device
keeps working (this is "control de sesiones al mismo tiempo con el mismo
usuario": the app tracks and can act on concurrency, not that it locks a user
to one device against their will) but the app can now show "también activo
en: iPhone, hace 3 min" and let the user revoke a device they don't
recognize. A device the user has never authorized appearing in that list is
the whole point of tracking this at all — it is a account-compromise signal
Module 7's danger zone should surface, not bury in a table nobody reads.

**Layer 3 — stale sessions get reaped on the server, not just abandoned.**
This is the gap Layer 1 structurally cannot close: a session whose client
never sends another heartbeat (device died, battery drained, browser killed
outright) sits `active`/`passive` forever with no client left to run the idle
timer. A scheduled job (pattern:
[`shared/session/purgeStaleSessions.example.ts`](shared/session/README.md))
revokes any session whose `last_seen` is older than a fixed threshold —
**48 hours** is the portfolio default (long enough that a legitimate
multi-day-away laptop sleep doesn't get logged out from under someone, short
enough that a dead session doesn't sit "active" for weeks). Revoking sets
`status: 'revoked'`, which `sessionHeartbeat`'s own check (FlowFin:
`if (found.status === 'revoked') return 403`) already turns into a forced
re-auth the next time that device's tab wakes up — no separate client change
needed, the guard rail was already there for Mission Control's own
remote-force-logout path (see FlowFin's `CLAUDE.md`, 2026-08-05 changelog
entry) and this reuses it for the timed case.

**What this is not.** Layer 2's "one active device" is a UI/UX signal, not
an access-control boundary — it does not replace Module 3's server-side
permission re-check, and a `passive` device is not blocked from working, only
flagged as not-the-most-recent. Don't build a second auth gate out of it.

---

## 21. About screen — user manual, changelog, version, contact, and the ACACIA line

Every app has one screen — reachable from account/settings, not buried —
that answers "what does this app do, what changed recently, what version am
I on, and who do I ask." Canonical shape: FlowFin's `About.jsx` +
`UserManual.jsx`, four things on one surface:

- **A user manual.** Searchable, in-app, sectioned by feature area (FlowFin:
  an accordion, one entry per module, plain-language "how do I…" content —
  not API docs, not a README). This is the thing that turns a support ticket
  ("how do I split an expense?") into something the user answers themselves,
  and it is the natural home for anything Module 3's new permission-admin
  screen (above) doesn't already make self-evident from the UI itself.
- **The changelog, surfaced where the user already is.** Module 6 owns
  *generating* `APP_VERSION`/`RELEASE_DATE`/the changelog array; this module
  is where it gets *read* — "Novedades v`{currentVersion}`" front and center,
  a collapsible full version history behind it. Don't build a second
  changelog UI a release script has to remember to also update — this screen
  reads the same array Module 6 already produces.
- **Version, unambiguous.** The number on this screen, in `package.json`,
  and in the update-available banner (FlowFin: `AppUpdateBanner.jsx`) must
  be the same line — Module 6 already flags what happens when they drift
  ("se corrige el desfase histórico del número de versión").
- **Contact, and the line that says whose app this is.** Support email and a
  direct channel (FlowFin: WhatsApp) that actually reaches someone — not a
  form into a void, and not a duplicate of Module 8's ticket system, just the
  fastest path to it. And a short acknowledgment that this is an ACACIA
  product: the ACACIA mark, "Hecho con ♥ para \<the app's actual users\>,"
  rights/licensing line. Small, but it is the one place in the whole app that
  says who stands behind it, and it costs one card on a settings screen.

None of these four are Mission Control's to build — the panel operates the
*portfolio*, not any single tenant's day-to-day, and a user asking "how do I
use this" or "who do I call" should never have to know Mission Control
exists.

---

## 22. A server-authoritative field must never be verified against the auth session's own cached view

**The gap this closes.** Half a dozen functions in Rumbo alone share one
shape: read `user` from `auth.me()`, compare a server-authoritative custom
field on it (`user.data.tenant_id`, `user.data.write_access`, …) against a
target value, and skip the write when they already match — an "only send
what changed" optimization that looks harmless and was written with good
reason (a wholesale `data:{...}` replace can wipe sibling fields — see the
partial-patch rule at the end of this module). It stopped being harmless the day one account's
`auth.me()` response for that field diverged from what was actually
persisted: a stray root-level `tenant_id` field, left over from an earlier
attempted fix that wrote flat instead of nested, made `auth.me()`
reconstruct `.data.tenant_id` from the wrong source. From that point,
`switchTenant` received a request to move the account to tenant B while
`auth.me()` already reported it as being on tenant B — the diff came back
empty, the write was skipped, and the function returned `ok: true` having
changed nothing. Nothing in the response revealed this. Two rounds of
plausible-sounding fixes (moving the field between the document root and
`data`, reasoning about an atomic-update role conflict that turned out to
be real but insufficient) came and went before the actual mechanism was
caught — by instrumenting the function to log its own write attempts and
re-read the record within the same request, not by reasoning about the
document's shape from outside.

**Why this is a general risk, not a one-off contamination.** `auth.me()` is
convenient precisely because it is cached/session-scoped — that is what
makes it cheap to call on every request. That same property makes it the
wrong source for "did this already happen" whenever the answer decides
whether to write. Any field this portfolio treats as server-authoritative
(`rls.write: false`, set only by a backend function — Module 1's
`billing_status`, Module 14's tenant-pointer locks, the caller's own
`tenant_id`/`driver_profile_id`/`write_access`) is exactly the kind of field
a diff-then-skip optimization is tempting to add around, and exactly the
kind of field where a stale or contaminated cached read makes the
optimization silently swallow the one write that mattered. `ok: true` proves
the function ran to completion — it does not prove anything was written.

**What closes this:**

1. Any function that reads a server-authoritative custom field to decide
   whether to write it does a fresh read via `asServiceRole`
   (`svc.entities.User.filter({id: user.id})` or equivalent) **first**, and
   uses that value — never `auth.me()`'s own `user.data`/`user.role` — for
   the comparison. `auth.me()` remains fine for identity (`user.id`,
   `user.email`) and anything genuinely read-only.
2. The "only send changed fields" optimization stays, but stays correct: the
   patch is built by spreading the **full fresh-read object** underneath the
   changed keys (`{...freshData, ...patch}`), never assumed safe because the
   comparison "looked" unchanged.
3. The same rule applies one layer up whenever a caller's own
   server-authoritative field (not just the write target's) gates the
   operation — e.g. deriving *which* tenant an admin action should scope to
   from the caller's own `tenant_id`. A stale read there doesn't just skip a
   write, it can scope an entire operation against the wrong record.
4. When a write "isn't taking" and the response says `ok: true`, the first
   thing to check is whether the write executed at all — log the attempt and
   re-read the record within the same request — before theorizing about the
   shape of the document. A temporary diagnostic entity (delete it once the
   root cause is found) settles this in one round-trip instead of another
   round of plausible-sounding guesses.

---

## 23. Client navigation chrome survives a reload — a full-page reload is routine, not a reset signal

**The gap this closes.** A left sidebar/nav that highlights the active
section, or remembers which group is expanded, is only correct if it
re-derives that state on every render — including the render right after a
full-page reload. A reload is not a rare event this portfolio treats
casually: a session refresh, a license-status refetch, a revoked-session
forced logout, and the user simply pressing F5 all trigger one, and any flow
that changes tenant-scoped state at its root is right to reach for
`window.location.reload()` rather than resetting every hook, list and cache
in place — that in-place reset is exactly where a stale tenant id survives in
a closure. A nav whose active-item/scroll/expanded state
only gets set once, at mount, from something that isn't the current route —
a `useState` seeded from nothing, an animation that runs once on first paint
— visibly snaps back to its default (top of the list, first group collapsed
or expanded, no item highlighted) on every one of those reloads, even though
nothing about where the user actually is in the app changed.

**What closes this:**

1. The active section/item in the nav is derived from the current route on
   **every** render (a selector over the router's current path), never from
   mount-time state alone — so the highlight is right from the very first
   frame after a reload, before anything async resolves.
2. Any nav UI state that is *not* purely route-derived — a manually
   expanded/collapsed group, a scroll position inside a long menu — persists
   across a reload via `sessionStorage` (survives a reload without leaking
   across tabs or devices the way `localStorage` or a backend field would),
   keyed by a stable string, and is restored synchronously on mount so there
   is no flash of the default state before the real one applies.
3. A reload's job is to reset **data/tenant-scoped** state cleanly (that is
   the entire reason a flow reaches for one) — never chrome or
   navigation state the user didn't ask to reset. Those are two different
   kinds of "start over," and an ordinary refresh should only ever trigger
   the first.

---

## 24. A tenant's role never reaches every tenant — built-in `admin` is the platform's

**Why this module exists.** On 2026-09-24 StockFlow was found storing each
business's own admin in Base44's built-in `role: "admin"` — the same value
Module 4's service-tier branch `{"user_condition":{"role":"admin"}}` tests,
and that branch is deliberately not tied to any tenant. Each choice was
reasonable alone; together they meant any customer admin, including anyone
who signed up and created a business, reached every other tenant's rows
outside the app's UI. It was fixed and verified live the same day
([`docs/incidents.md`](docs/incidents.md)). Nothing about it was specific to
StockFlow, so this module makes the rule explicit and checkable.

**The rule.** An RLS `user_condition` either tests the **platform tier** —
built-in `role: "admin"` or the `__service_role_only__` sentinel — or it sits
inside an `$and` that also pins the record to the caller's tenant. Any other
role (`owner`, `business_admin`, `staff`, a `data.*_role` field…) standing
alone in an `$or` matches that role in **every** tenant. And built-in `admin`
is held only by the platform owner accounts: no signup, invite, role change
or migration may write it to anyone else — **except in design B below**, where
it is a tenant role on purpose and must then be scoped like any other.

Two designs satisfy it — pick one per app and don't mix them:

- **A — the tenant admin gets its own built-in value** (`owner`,
  `business_admin`…) and the rules keep Module 4's shape. StockFlow
  (`owner`), Puntos+, CtrlHQ and KitchOps (`business_admin`) work this way.
  Every "is this the tenant's admin?" check in code accepts that value;
  platform-only checks keep `admin` alone.
- **B — the tenant role lives inside the tenant `$and`.** Rumbo works this
  way: its rules read `$and[ tenant_id match, $or[owner, admin, …] ]`, so its
  roles only ever match rows of the caller's own tenant, and its pure service
  entities use the `__service_role_only__` sentinel. Here built-in `admin` is a
  tenant role too (`manageRole` hands it out), so a bare `admin` branch is as
  wrong as a bare `owner` one, and only the sentinel is the platform tier. Run
  the checker with `--tenant-admin`.

Apps that keep the tenant role in a separate data field (`app_role`,
`parish_role`, `family_role`) and leave built-in `role` at `user` are design A
by construction — as long as that data field is never tested unscoped.

**Checking an app** (all read-only):

1. **Who holds built-in `admin`?** Read `User` with `email, role`. Anyone
   other than the platform owner accounts is a live exposure — stop and fix.
2. **What does the code hand out?** Run
   [`shared/tenant-roles/check-tenant-roles.mjs`](shared/tenant-roles/check-tenant-roles.mjs)
   from the app root, with `--allow` listing only the platform-owner recovery
   functions (design B: `--tenant-admin`; a `User` field a tenant admin
   assigns to their own members, like Rumbo's `owner_group_id`, goes in
   `--delegated` and may be locked to a tenant-scoped role). It fails on any unscoped tenant role in an entity rule or a
   field lock, on `user_condition` with sibling keys, on any function
   that writes `role: 'admin'`, and on any `{{user.data.<field>}}` a rule
   depends on that `User` does not lock to the platform tier.
3. **Is the repo what's deployed?** The checker reads schema files. Confirm
   the deployed schema matches (Module 4); if it can't be read, say so in the
   Module 14 audit rather than assume.
4. **Tenant pointers stay locked.** The `User` fields that name the tenant
   (`business_id`, `company_id`, `family_id`…) and any role-like data field
   carry `rls.write` limited to the platform tier, so a user can't re-point
   or promote themselves (Base44 already refuses self-changes to built-in
   `role`).

**Fixing an app on design A** — the order matters because Base44 publishes
functions and schema separately:

1. Add the tenant value to `User.role`'s enum, and make every tenant-admin
   check accept both the old and new value (one helper, e.g.
   `isBusinessAdmin`, on the client; the same inline pair on the server).
   Platform-only checks keep `admin` alone. Signup and role-change code write
   the new value.
2. Deploy schema, functions and site — then **Publish** in the Base44 panel
   and prove the new code is live by calling a new action and reading its
   own error, not the CLI's `unchanged` (see the gates table).
3. Move existing tenant admins with a platform-owner-only, dry-run-first
   migration action that never touches the platform accounts.
4. Re-read `User` roles, and re-run step 1 of the check.
5. Wire the checker into CI (`npm run validate:tenant-roles`) so the next
   signup flow or schema edit can't reintroduce it.

**Portfolio status, 2026-09-24** — live `User` roles read from each app, and
`check-tenant-roles.mjs` run over each app's **workspace** entity files (the
code Base44 publishes; the deployed schema could not be read that day, so
re-run against it before calling any row closed). Built-in `admin` is held
only by the platform owner's accounts in all 14 apps.

| app | customers today | result |
|---|---|---|
| StockFlow | yes | clean (fixed and verified live the same day) |
| ArtisKids, RADAR, CateqHub, KitchOps, CtrlHQ | some | clean |
| Rumbo | yes | fix in jospabloh/rumbo#129: `DebugProbe` (bare `owner`, readable by every tenant's owner) and `TenantLicense.create`/`User.create` → sentinel; `Driver`/`User.owner_group_id` field locks tenant-scoped. Pending `deploy:entities` |
| LIUMA | yes | fix in jospabloh/liuma#181: `User.school_id`/`app_role` locked `write:false`. Not live — no `User` holds them. Pending `deploy:entities` |
| Puntos+ | no | 14 `LoyaltyAccount` field locks accept unscoped `merchant`/`business_admin` |
| FlowFin | yes | `AppChangelog`/`AppVersion` read by `role:"user"` — global release notes, harmless |
| MedControl MX | no | fixed in the Base44 app (checkpoint `6ab5ab3b`): `User.tenant_id`/`patient_id`/`app_role` `write:false`; `manageTenantUsers` writes under `data`, never hands out `platform_owner`, never pulls a user from another clinic. Pending Publish |
| FamiliasConectadas | no | fixed in the Base44 app (checkpoint `6ab5ab3e`): `User.family_id`/`family_role` `write:false`; create/join/leave go through `joinFamily`. Pending Publish |
| Sommel | no | fix in jospabloh/sommel#1: onboarding moved to `createWineBar`, `User.tenant_id`/`app_role` `write:false`, `WineBar` license fields platform-only |
| AudioVisual Order Pro | no | no entity files in the workspace — nothing to check yet |

The last three have no customer yet, which is the only reason they are not
live: they must be fixed before their first signup, not after.

---

## 25. Signup finishes — the emailed code has a screen to type it into

**Why this module exists.** On 2026-09-29 a new StockFlow customer
(cesar@domsot.com.mx) could not create his tenant. He registered, the
verification code reached his inbox, and he was stuck. Base44's
`auth.register()` sends an OTP and leaves the account unverified;
`loginViaEmailPassword()` then refuses with `Please verify your email before
logging in. Check your email for the verification code.` StockFlow's Register
page swallowed that failure, redirected to `/login`, and `/login` showed the
same message with **no field to enter the code**: `verifyOtp` and `resendOtp`
were never called anywhere in the app. Every step worked; the flow had no way
to finish. It is the Module 10 "no dead ends" rule applied to the step before
the first login, and it is invisible to the owner for the same reason as the
Rumbo Apple-button incident: a stuck signup leaves no account to notice.

**The rule.** Any app that offers email + password signup must, from the
screen where the failure happens:

1. Call `base44.auth.verifyOtp({ email, otpCode })` from an in-app field —
   never rely on the user finding a link or on the platform's hosted page.
2. Offer **resend** (`base44.auth.resendOtp(email)`) and a way back to change
   the email. Codes expire; the mail goes to spam.
3. Show the code step from **both** entry points: right after `register()`
   when the automatic login fails, **and** on `/login` when login fails with
   the unverified-email error. The second is what rescues an account that
   already exists and is stuck. Detect the state by the error message
   (`/verify your email|verification code/i`) — the SDK exposes no code.
4. After a successful `verifyOtp`, log the user in with the credentials
   already in memory (one step, no retyping) and land on the app; if that
   login fails, send them to `/login` with a message, never a blank error.

Google-only apps and apps with no password signup are exempt; record that in
the audit line instead of skipping the module silently.

**Reference implementation.** StockFlow: `src/components/VerifyEmailStep.jsx`
(code field, resend, change email; exports `needsEmailVerification`), used by
`Register.jsx` and `Login.jsx`, with `verifyOtp`/`resendOtp` on `AuthContext`.
Copy it rather than rebuilding from prose.

**How an audit proves it** (a grep is necessary, not sufficient):

- `grep -rn "verifyOtp" src/` returns a call site reachable from **both**
  `Register` and `Login`, and `resendOtp` is called too. No hit in an app that
  has password signup is a failing audit on its own.
- **Live, with a throwaway address** (use plus-addressing on an inbox you
  control, e.g. `you+m25test@…`): register in the deployed app, do **not**
  type the code, go to `/login`, and log in — the code field must appear.
  Enter the code and confirm you land inside the app; repeat with "resend"
  and confirm the new code works and the old one is refused. Delete the test
  user afterwards. This needs an inbox, not the tenant's data, so it does not
  hit Module 14's "no writing to a customer's tenant" limit.
- The audit note says which of these ran. "Grep only" is a legitimate
  result; claiming the live flow without running it is not.

**Audited across the portfolio (2026-10-07, static only):** the code step is
wired into both Register and Login in CtrlHQ, Radar, KitchOps, Rumbo,
ArtisKids, FlowFin, CateqHub, Puntos+ and Sommel (each imports
`VerifyEmailStep` and branches on the unverified-email error), and LIUMA does
it inside its single `Login.jsx` (`verifyOtp` + `resendOtp`). StockFlow was the
only app missing it, and is fixed. **Not run:** the live proof with a throwaway
address in any app — it needs an inbox, and the dev sandbox has none. Treat the
live check as still owed, one app at a time, and say so in each audit note.

## 26. Every backend function says what it is for — `function.meta.json`

**Why this module exists.** On 2026-09-30, while consolidating StockFlow's 47
functions (cap 50, `maxFunctions` set to 47, headroom zero), nobody could say
what `updateProductStockSafe` was for. The answer had to be dug out of `git
log`: created 2026-03-30 for `MovementFormDialog`, orphaned 2026-04-20 when
that caller was removed because it double-applied stock, and then **kept
deployed and maintained for five months** — it even received the 2026-09-28
security hardening — with zero callers. The same audit found five "cron"
functions (`dailyPermissionAudit`, `dailyDocumentationAudit`,
`cleanupSessions`, `dailyStockReconcile`, `sendCourseReminders`) that are
deployed but **have no scheduler anywhere**: no Base44 workflow, no Mission
Control cron, no GitHub Action. They look like running jobs in the repo and
never run. Base44 keeps function logs for roughly 13 hours, so logs cannot
answer "is this used?" either. The code is the only record, and the code did
not say.

**The rule.** Every directory with an `entry.ts`/`entry.js` has a
`function.meta.json` next to it. It does not count against the 50-function
cap (only `entry.*` does). CI fails without it.

```json
{
  "name": "quotations",
  "purpose": "Quotation CRUD and lifecycle (create, convert, deliver, cancel)",
  "status": "active",
  "created": "2026-03-26",
  "triggers": ["frontend"],
  "auth": "user",
  "tenant_scoped": true,
  "entities": { "reads": ["Quotation", "Client"], "writes": ["Quotation", "Movement"] },
  "tests": ["base44/tests/integration_test.ts"],
  "actions": {
    "createQuotationSafe": { "purpose": "…", "callers": ["src/pages/Quotations.jsx"] }
  },
  "remove_when": null
}
```

- `status`: `active` | `deprecated` | `one-off`. A `one-off` (migration,
  backfill, owner repair) or `deprecated` function **must** set `remove_when`
  (a date or a condition). A migration that stays deployed after it ran is a
  slot and an attack surface spent on nothing.
- `triggers`: any of `frontend`, `cron:<workflow name>`, `entity:<Entity>`,
  `agent:<agent name>`, `backend:<function>`, `external:<system>` (e.g.
  `external:mission-control`). A `cron:` trigger must name a workflow that
  exists in `base44/workflows/` — that is the check that would have caught the
  five unscheduled crons.
- `auth`: `user` | `service_role` | `cron_secret` | `hmac` | `public`.
- `tenant_scoped`: whether it filters by the tenant key (Module 14).
- Routers (Module 11) list every `action` from `handlers/index.ts` under
  `actions`, each with its own `purpose` and `callers`.

**CI check** (extend `validate:functions`, already wired into `npm run lint`):

1. Every endpoint directory has a valid `function.meta.json`.
2. Every action exported by a router's `handlers/index.ts` appears in `actions`.
3. Declared callers match reality: grep `invoke('<fn>'` / `action: '<a>'` in
   `src/`, `base44/workflows/`, `base44/agents/` and backend handlers. An
   undeclared caller, or a declared caller that no longer exists, fails.
4. A `cron:` trigger whose workflow file does not exist fails.
5. `one-off`/`deprecated` without `remove_when`, or past its `remove_when`, fails.
6. The check regenerates `docs/FUNCTIONS_REGISTRY.md`, a readable index.

**Deleting a function** needs three things written in the PR: the meta shows no
callers, the deployed workflows (`GET /api/apps/{id}/workflows`, not the repo
files) show no trigger, and at least 7 days of captured logs show no
invocation. Because Base44 keeps logs for about 13 hours, "captured" means
someone pulled them at least twice a day with `base44 logs` and stored them.
Today's log window alone is not evidence.

**Reference implementation.** StockFlow, during its function consolidation
(wave 0, starting 2026-10). Until it lands, this module is a contract without
a copyable script. Say so in audits instead of marking it done.

**Not yet audited across the portfolio (2026-09-30):** no app has
`function.meta.json` yet. Every app goes red on this module until it adds them.

---

## 27. Optional style — `mario_style`

`mario_style` is a **style option**, not a requirement. An app uses it only when
the owner asks for it ("aplica mario_style a <app>"). An app that does not use
it is not out of compliance; its checklist line reads N/A. This section is the
whole guideline, and the canonical files sit beside it in
[`shared/mario_style/`](shared/mario_style/). An app's own `CLAUDE.md` records
only that it adopted the style, the date and version, its call sites and what
was not verified, and points back here for everything else.

**What it looks like.** Friendly, round, chunky and a little bouncy, closer to
a well-made console game than a grey admin console. It was chosen on
2026-10-07 from a side-by-side mockup of Rumbo; Rumbo v1.36.0 is the reference
implementation.

**What the style is made of — a short list on purpose.**

- **Round.** One `--radius` knob (1rem) drives every Tailwind radius: cards
  land at 24px, buttons at 20px, and small chips stay at 6px.
- **Relief.** Filled buttons, active nav pills and KPI icon chips sit on a
  solid shadow straight down (no blur) mixed from their own fill, and travel
  down on press. Cards get a quieter relief in the edge colour. `ghost` and
  `link` stay flat, because they are text you can press, not physical buttons.
- **Round type.** Baloo 2 for headings and big figures, Nunito for body text.
- **Colour.** The app's brand colour never changes. Backgrounds move from grey
  to a sky tint (light) and night blue (dark). Borders take the same hue,
  because they are also the relief colour.
- **Rewards.** Confetti from the button that finished something, plus a short
  overshoot bounce. Nothing else moves on its own.
- **Quota as a life bar.** Plan limits of 30 or fewer render as one block per
  unit: green, then amber at 80%, then red when full. The caller sets
  `data-tone` (`ok` / `near` / `full`) on the bar; the CSS only colours it.

**Canonical files.** `mario_style.css` (relief, press, pop, life bar) and
`celebrate.js` (zero-dependency confetti) plus its test. Copy them byte for
byte. They own no colour, font or radius: each app maps seven `--play-*`
variables to its own tokens by live reference, so a tenant brand colour applied
at runtime reaches the relief without code. The class prefix stays `play-`.
Step-by-step adoption is in [`shared/mario_style/README.md`](shared/mario_style/README.md).

**Celebrate finishing, not saving.** This rule keeps rewards from turning into
noise:

- Only after the write **succeeded** — never in `catch`, never before the await.
- Only for a moment that **finishes** something: a charge fully paid, an alert
  resolved, a trip logged, a record created. An edit, a partial payment, a
  settings change or a filter does not count.
- Never awaited and never blocking. The canvas lets clicks through, and a modal
  closes and a list refetches underneath it.
- Off under `prefers-reduced-motion`. `celebrate.js` handles this itself and its
  test covers it, so a call site cannot forget.

**Tone by audience, not by app.** The same components serve the owner reading
overdue rent and the driver logging a trip. Relief, rounding and type apply
everywhere. Confetti is reserved for the "done" moments above, which keeps
money screens from feeling like a toy.

**Done means verified on screen, not merged.** Nunito is wider than Inter, so
this tends to break in a tight row of buttons at 320px. Run the app's layout
scanner if it has one (Rumbo: `scripts/layout-overlap-scan.mjs`) before and
after, in both themes, **and look at the screenshots**. In Rumbo the scanner
passed while empty quota blocks were invisible. Module 12's rule applies to
this palette too: a theme ships finished or not at all. The deploy rule also
holds: merging deploys nothing; run `npm run deploy:site` and check the served
bundle.

---

## 28. Personal data — the privacy notice describes the app that is actually deployed

**Why this module exists.** On 2026-10-07 the privacy notice of a competing
Mexican SaaS (condominium management) was read next to its own marketing
page. The notice was long, formal and wrong in the ways that matter: it cited
articles 15, 16 and 37 of a law that was abrogated in March 2025 and a
regulation article by number, it sent complaints to an authority that does not
handle them, it described a product that only reads QR codes while the home
page of the same site sold card payments, financial statements, vehicle and
visitor registries, and it asked for consent "by signing at the foot of this
document" on a web page nobody signs. Nothing in it was checked against the
app.

The same read of ACACIA's own notice (`acaciaco-site/legal/privacidad.html`,
dated 2026-04-28) found the mirror image: short, honest, and incomplete. It
names four of eleven apps, gives "Aguascalientes, Aguascalientes, México" as
the address, does not say which purposes need consent, offers no way to limit
use or disclosure, describes no way to revoke consent, and covers only what
the *site's* forms collect. It says nothing about the data that tenants load
into the apps about their own customers, employees and suppliers, which is
most of the personal data this portfolio holds. And nothing in any app repo
records what personal data that app stores, so no notice could be checked
against anything.

The failure is the one this standard keeps finding (see *Verification gates*):
a document asserted something about the system, and nobody could run a check
that would prove it false.

**The law this module is written against.** The *Ley Federal de Protección de
Datos Personales en Posesión de los Particulares* published in the DOF on
**2025-03-20** (texto vigente, last reform DOF 2025-11-14), which abrogated
the 2010 law of the same name. The authority is the **Secretaría
Anticorrupción y Buen Gobierno** (art. 2 XV; the INAI no longer exists).
Article numbers below are from that text as read on 2026-10-07. As of that
date no new *Reglamento* had been found: the 2025 decree gave the Executive 90
days, secondary sources say it has not been issued, and the 2011 Reglamento
has not been abrogated — a DOF record either way was not located. Which role
ACACIA holds for each kind of data is a legal judgement this module states as
a working assumption. This is an engineering contract, not legal advice: **a
lawyer admitted in Mexico reviews each notice before it is published**, and
that review is a line in the PR, not an assumption.

**Scope.** Any app that stores a datum about an identifiable natural person.
The signed-in account's own email is such a datum, so an app with accounts is
in scope even if it stores nothing else. Most apps store far more: a
customer's phone in StockFlow, a family member in FlowFin, a loyalty member in
Puntos+. Rules 5 and 6 add obligations when the data is
financial, sensitive, about minors, or entered by someone other than the
person it describes.

### 1. One file says what personal data the app holds — `privacy/data-inventory.json`

The notice is written *from* this file, and CI keeps the file equal to the
schema. One entry per entity that holds personal data:

```json
{
  "notice_version": "2026-10-07",
  "entities": {
    "Client": {
      "titular": "tenant_customer",
      "acacia_role": "encargado",
      "fields": {
        "name":  { "category": "identification" },
        "phone": { "category": "contact" },
        "rfc":   { "category": "fiscal" }
      },
      "minors": false,
      "purposes": [
        { "id": "fulfil_orders", "requires_consent": false },
        { "id": "marketing_whatsapp", "requires_consent": true }
      ],
      "source": "entered_by_tenant",
      "recipients": ["base44", "mission-control-bodega", "meta-whatsapp"],
      "retention": "while the tenant is active; fiscal fields for as long as tax law requires",
      "deletion": "anonymize name/phone/rfc, keep the transaction rows"
    }
  },
  "no_personal_data": ["Product", "Warehouse"],
  "stores": {
    "auth_and_sessions": { "holds": ["email", "ip_address", "user_agent"], "retention": "revoked after 48h idle (Module 20)" },
    "files": { "holds": ["ticket attachments"], "retention": "with the ticket" },
    "logs": { "holds": ["user id", "ip_address"], "retention": "platform default, about 13 hours" },
    "analytics": { "holds": [] },
    "browser_storage": { "holds": ["theme preference"] },
    "outbound_messages": { "holds": ["recipient email", "message body"], "retention": "provider default" }
  }
}
```

- `category`: `identification` | `contact` | `fiscal` | `financial` |
  `location` | `sensitive` | `credentials`. `financial` and `sensitive`
  trigger rule 5. The category says what kind of datum it is, never whose.
- `minors`: `true` when the titular may be under 18. It is a property of the
  person, set per entity next to `titular`, so a child's name stays
  `identification` and still triggers the minors rule.
- `titular`: whose data it is (`account_user`, `tenant_customer`,
  `tenant_employee`, `visitor`, `lead`, …).
- `acacia_role`: `responsable` or `encargado` (rule 2).
- A purpose that scores, profiles or decides about a person with no human in
  the loop carries `"automated_decision": true`. The titular can oppose that
  treatment (art. 26 II), so the app needs a way to switch it off per person.
- `recipients`: every system the field reaches. **Mission Control's bodega is a
  recipient** (Module 0 keeps a copy of operational data there), and so is any
  LLM provider a feature sends the field to.
- Every entity in the schema appears either under `entities` or in
  `no_personal_data`. An entity in neither fails CI, so a new entity cannot
  ship without someone deciding whether it holds personal data.
- **Not all personal data lives in an entity.** `stores` covers the rest, and
  its six keys are fixed: `auth_and_sessions`, `files` (uploads and object
  storage), `logs` (function and request logs), `analytics`, `browser_storage`
  (cookies and `localStorage`) and `outbound_messages` (what the email,
  WhatsApp or LLM provider keeps). Each key is present with what it `holds`;
  an empty list is an explicit "nothing", and a missing key fails CI. The
  schema cannot check these, so the gate does: each one is read from the
  running app and compared with the file.

### 2. Decide who is the *responsable* for each category, before writing a word

Two different relationships live in every multi-tenant app, and one notice
cannot cover both:

| data | responsable | ACACIA is | document |
|---|---|---|---|
| the account holder's own data, billing contact, leads, support tickets | ACACIA | responsable | the app's privacy notice (rule 3) |
| what a tenant loads about *its* customers, employees, suppliers, visitors | the tenant | encargada — treats it on the tenant's behalf (art. 2 XII) | a data-processing clause in the tenant terms, plus a place for the tenant to publish its own notice |

The data-processing clause commits ACACIA to treat the data only on the
tenant's instructions, keep it confidential after the relationship ends
(art. 20), apply the security measures of rule 8, name its sub-processors,
help the tenant answer ARCO requests, and return or delete the data when the
tenant leaves (Module 7's *delete tenant*). The app gives the tenant somewhere
to put its own notice in front of its own titulares: the public order page,
the loyalty sign-up, the visitor pass. A tenant that collects data through an
ACACIA app with no notice of its own is exposed, and the app made that easy.

A communication to an encargado is not a *transferencia* under art. 2 XX. The
2025 law does not use the word "remisión"; the 2011 Reglamento does, so if the
lawyer writes it, that is why.

### 3. The notice, in two forms, at a fixed address

- **Integral** — one page per app at `acaciaco-site/legal/privacidad/<slug>`
  (the slug is the Mission Control id, Module 17). It contains the six items of
  art. 15: (I) identity **and full address** of the responsable; (II) the data
  treated, generated from the inventory, marking any sensitive data; (III) the
  purposes, **separating those that need consent** from those that do not;
  (IV) the options to limit use or disclosure; (V) how to exercise ARCO rights;
  (VI) how changes are communicated. Plus what art. 7 and art. 35 require
  inside the notice: how to **revoke** consent, and a clause to accept or
  refuse any transfer to a third party that is not an encargado (that third
  party receives the notice and takes on the responsable's obligations). Plus, because
  it is cheap and it is what a reader looks for: the named sub-processors, the
  retention periods, a "what this app does not collect" line, and the date and
  version.
- **Simplificado** — at *every* point of electronic collection (signup, contact
  form, support form, public order or pass page): items I–IV in a few lines and
  a link to the integral page (art. 16 II). A footer link alone is not this.
- Linked from the login page (Module 10), signup, the About screen
  (Module 21), and the app's `apps/` page (Module 9).
- Cite the law by name and DOF date. **Do not cite article numbers in the
  public notice** unless the lawyer who reviewed it put them there: article
  numbers copied from the abrogated law are how the notice that prompted this
  module dated itself.
- Complaints go to the Secretaría Anticorrupción y Buen Gobierno. Not the
  INAI, not the SNT.

[`shared/privacy/`](shared/privacy/) has the skeleton for both forms and an
inventory example.

### 4. Consent is recorded, by notice version

Tacit consent is valid for ordinary data once the notice has been made
available (art. 7). The app still records *that* it was made available: a
`ConsentRecord` (titular, `notice_version`, timestamp, collection point,
purposes accepted) written by a backend function **at every point of
collection, not only at signup**. Most titulares never sign up: a tenant's
customer on a public order page, a visitor with a pass, a lead on a contact
form. So the record is keyed to the titular — the user id when there is one,
otherwise the record the form created (the `Client`, the `Lead`, the pass) —
and a ticked box on any form leaves a row. When `notice_version` changes in a
way that adds a purpose, a recipient or a data category, an account user sees
the change on next login and the record is rewritten; for a titular with no
login, the new purpose does not apply until they accept it at their next
contact. Purposes with `requires_consent: true`
(marketing, anything not needed to deliver the service) are separate,
unticked, and refusing them never blocks the service.

### 5. Financial, sensitive and minors' data

- **Financial or patrimonial data** needs *express* consent (art. 7): an
  explicit, recorded action, not a notice in the footer. Art. 7 excepts the
  cases of arts. 9 and 36; whether a subscriber's own billing data falls under
  art. 9 is the lawyer's call, and the recorded action stays the portfolio
  default either way. A card number never
  touches an ACACIA backend; the processor's hosted field takes it.
- **Sensitive data** (art. 2 VI, a list that says it is not exhaustive: racial
  or ethnic origin, present or future health, genetic information, religious,
  philosophical and moral beliefs, political opinions, sexual preference)
  needs express **written** consent through a signature or an
  authentication mechanism (art. 8), and a database of it must be justified by
  a concrete purpose. The portfolio default is **do not collect it**. An app
  that must says so here, by name, with the purpose. Biometric data is not in
  the law's list; treating it as sensitive is this portfolio's choice.
- **Minors** (any app aimed at children or families): the adult responsible
  consents, and the inventory marks the entity `"minors": true`. That is portfolio
  policy: the 2025 law says nothing about minors beyond letting a legal
  representative act for the titular (art. 21). Ask the lawyer.
- **Photographs of official ID, plates, faces, voice**: treat as high risk.
  Off by default, behind a tenant setting, with a retention period.

### 6. ARCO and revocation have a path that someone answers

"Send an email" is a mailbox, not a procedure. The law requires a designated
person or data-protection department that processes these requests (art. 29):
name it in the notice and in the app's `CLAUDE.md`. The path:

- In the app, under Account (Module 7): **Acceso** is the data export,
  **Rectificación** is the profile edit, **Cancelación** is the deletion
  request, **Oposición** and revocation are the consent toggles of rule 4.
- Anything those do not cover, and every request from someone who is not a
  user (a tenant's customer, a visitor), is a **Module 8 ticket of category
  `arco`**. It gets an acknowledgement with a folio at once and a due date.
  The law gives twenty days to answer and fifteen more to make it effective,
  each extendable once (art. 31), and art. 2 VIII defines *días* as business
  days. Compute the due date in **calendar** days anyway: it is always the
  earlier date, and the law does not say which days count as business days.
  The category does not exist yet — adding it is a Mission Control change
  (`ticketControl.js`, Module 17), not only an app change.
- A request is closed by telling the person what was done, through the channel
  they used; a refusal states its reason (art. 33). After a cancellation or a
  rectification, every recipient in the inventory that still holds the data is
  told to do the same (art. 24).
- When ACACIA is the encargada, the request belongs to the tenant: the ticket
  is routed to the tenant's admin, and ACACIA executes what the tenant decides.
- Identity is verified before any data is released (art. 28 II, art. 31).

### 7. Retention and deletion — and the rule about never deleting history

Data that is no longer needed for its purpose is blocked and then deleted
(art. 10). This collides with a portfolio principle (StockFlow: *adjust,
never delete history*). The resolution is the same in every app: **keep the
transaction, remove the person.** Deleting a customer anonymizes the personal
fields on the record and on the rows that reference it; the movement, the
invoice number and the amounts stay. What must be kept by another law (fiscal
records) is named in the notice with its period. The deletion reaches every
recipient in the inventory, **including the copy in Mission Control's bodega**
— a row deleted in the app and still readable in the bodega is not deleted.
Data about a contractual default is deleted after 72 months (art. 10).

### 8. Security claims are ones you can prove

Art. 18 requires administrative, technical and physical measures. Modules 4,
14, 16, 19 and 20 are those measures; the notice may say so. What the notice
and the site may **not** say is anything nobody can demonstrate: "end-to-end
encryption" for data the server reads, "guaranteed" availability with no SLA
behind it, or a certification that belongs to someone else. SOC 2 Type II and
ISO 27001 are **Base44's** certificates. The site says that correctly today;
keep the attribution on the same line as the badge, everywhere it appears.
"Cumplimos con la LFPDPPP" is a claim, and this module's gate is what backs
it.

### 9. A breach has a runbook before there is a breach

A security incident that significantly affects the titulares' "derechos
patrimoniales o morales" is reported to them **immediately** (art. 19). Each app's `CLAUDE.md` names who decides
that, the template message, and where the record goes
(`docs/incidents.md`, same format as every other incident). When ACACIA is
the encargada, the tenant is told first and at once, because the duty to tell
the titulares is the tenant's.

**Review cadence.** Each notice is re-read when the inventory changes, when a
recipient is added, and once a year against the law and the Reglamento. The
date goes on the `Privacy notice last checked` line in `CHECKLIST.md`.

**Reference implementation.** None. `shared/privacy/` holds templates, not a
checker. Until an app ships the inventory check, this module is a contract
without a copyable script. Say so in audits instead of marking it done.

**Not yet audited across the portfolio (2026-10-07):** no app has a
`privacy/data-inventory.json`, a per-app notice, a `ConsentRecord`, an `arco`
ticket category or a data-processing clause. `acaciaco-site/legal/privacidad`
has the gaps listed at the top of this module. Every app goes red on this
module until it adds them.

---

## Verification gates — what actually proves a module is live

The recurring failure across this portfolio is not writing the code. It is
believing the code is running: merging deploys nothing on Base44, a checkpoint's
`git_commit_hash` can match `main` while the served tree lags, a repo `.jsonc`
is not the deployed schema, and a documented secret can hold the wrong value.
Each module's proof is a thing you can run and read.

| module | the claim | what proves it |
|---|---|---|
| 1 licence lifecycle | only MC writes `billing_status` | no native lifecycle cron in the repo; the field's `rls.write` is admin-only in the **deployed** schema |
| 3 permissions | the server re-checks, not just the UI | a unit test on the resolver, plus the drift check that regenerates the server copies in CI |
| 4 RLS | both halves of every rule are right | `npm run validate:rls` in CI, then `list_entity_schemas` — the deployed schema, not the file |
| 5 health | MC can see the app | an `app_health` row with `status: ok` dated today |
| 8 support | tickets arrive now, not tomorrow | raise one and watch it appear in MC in seconds |
| 11 deploy | what you merged is what is served | read the served file's content; for functions, call an action that only the new code has and read its own error (`unknown action` = old code). The CLI's `unchanged` is **not** proof — on 2026-09-24 it reported every grouped function unchanged while production kept the old code until **Publish** in the Base44 panel |
| 12 theme | the switcher is the only theme writer | grep for other writers of the theme attribute; there must be none |
| 13 smoke | the live site is the one you think | `npm run test:smoke` green in Actions, against production |
| 14 isolation | no tenant can reach another | the dated audit, naming what could **not** be verified |
| 15 bridge | each app signs as itself | a full sync with zero `rejected the derived key` in MC's log |
| 16 secrets | the value is what you think | read it back from the panel, or make a call that only succeeds if it is right |
| 18 RETIRED — one account, one tenant | there is no second record of membership, and no one-way door | grep for any reader/writer of a `Membership`-style mirror — none; from an account that already has a tenant, creating another and redeeming another tenant's code both answer 409 and leave no orphaned tenant behind; the current-tenant resolver is one deterministically-ordered function called by every reader; the retired entity is gone from the **deployed** schema |
| 19 lock survives debugging | a shipped security lock is still on | deployed schema still shows it, repo file agrees with the deployed schema, and its description still states the rationale |
| 20 session control | idle logs out, stale sessions get reaped | wait past the idle threshold and confirm the warning/logout fires; check a session whose `last_seen` is older than 48h flips to `revoked` after the reap job runs |
| 21 about screen | version/changelog/manual/contact are one screen, in sync | the version shown matches `package.json` and the update banner; the changelog entry for the current version is non-empty |
| 22 server-authoritative diffing | a write decision never trusts `auth.me()`'s cached view | grep every backend function for `user.data`/`caller.data`/`user.role` used in a comparison that gates a write — none should exist outside a fresh `asServiceRole` read |
| 23 nav survives reload | the sidebar's active item and any manual expand/scroll state look right on the first frame after a reload | hard-reload on a deep route and confirm the highlight is correct immediately, then expand a group, reload again, confirm it's still expanded |
| 24 tenant roles | no tenant role reaches every tenant | only platform accounts hold built-in `admin` in live `User`; `check-tenant-roles.mjs` green in CI; deployed schema matches the checked files |
| 25 signup finishes | a new email+password user can activate their account | `grep -rn verifyOtp src/` reachable from Register **and** Login, `resendOtp` called; then live with a throwaway `+` address: register, skip the code, log in — the code field appears, the code lands you in the app |
| 26 function metadata | every function says what it is for, and nothing is deployed that nothing calls | `npm run lint` green with the metadata check; `base44 functions list` equals the directories with `function.meta.json`; every `cron:` trigger matches an **active** workflow in `GET /api/apps/{id}/workflows` |
| 27 `mario_style` (optional) | if adopted: the app has the style and celebrates only finishing | `src/styles/mario_style.css` and `src/lib/celebrate.js` byte-identical to `shared/mario_style/` (`cmp`); every `celebrate(` call sits after an awaited write, outside `catch`; layout scanner **and** screenshots clean at 320/390/834/1440 in light and dark on the **deployed** bundle. N/A for apps that did not adopt it |
| 28 personal data | the notice describes the deployed app, and a request reaches a person | the inventory check green in CI against the **deployed** schema (`list_entity_schemas`), not the repo file; each of the six `stores` read from the running app (cookies and `localStorage` in the browser, one function log, one uploaded file, the provider's message log) and matching the file; submit a public form with the optional box ticked, without an account, and find its `ConsentRecord`; every field named in the published notice exists in the inventory and the reverse; raise an `arco` ticket from a throwaway account and read the folio and due date back in Mission Control; delete a test customer and confirm the personal fields are gone from the app **and** from the bodega; the PR that published the notice names the lawyer who reviewed it |

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
9. Add the `apps/` page on `acaciaco-site` (Module 9), then do the **whole**
   Mission Control side (Module 17): the `apps` row, the adapter,
   `licenseControl.js`, `ticketControl.js`, `messaging.js` and the client
   catalogue mirror. Registration alone wires the config, not the data path.
10. Copy the auth layout in from [`shared/auth/`](shared/auth/) (Module 10)
    before writing `Login.jsx` itself — check `--primary` is the app's real
    brand color, not shadcn's scaffold default, first.
11. Copy the theme switcher in from [`shared/theme/`](shared/theme/) (Module 12)
    and delete any other theme control.
12. Copy the smoke suite in from [`shared/smoke/`](shared/smoke/) (Module 13)
    and point its config at the app's real URL.
13. Decide the tenant-admin role design (Module 24) before the first signup
    flow exists, and add `check-tenant-roles.mjs` to CI from commit one.
    Then run the Module 14 isolation audit before the **second** tenant exists —
    with one tenant nothing can leak, which is also why nothing gets caught.
14. Copy [`shared/bridge/acaciaSign.ts`](shared/bridge/acaciaSign.ts) and its
    test in (Module 15), set `ACACIA_APP_SLUG` to the app's Mission Control id,
    and start with `ACCEPT_LEGACY_MASTER = false` — the legacy path exists only
    for apps that predate the derivation.
15. Set every secret in Module 16's inventory **and read each one back**, then
    prove the whole chain with one *Sincronizar ahora*: an `app_health` row,
    an audit row, and no `rejected the derived key` in Mission Control's log.
16. Keep one account on one tenant (Module 18, retired — **do not build a
    `Membership` entity or a tenant switcher**). The user record's tenant
    field is the membership; creating a second tenant or redeeming another
    tenant's invite code answers 409 (check **before** creating, or you leave
    an orphaned tenant with a live invite code); removing a member is the one
    write that clears that field. Where the app legitimately holds more than
    one profile row per caller, the rule that picks the current one is a
    single, deterministically-ordered function every reader calls.
17. Copy [`shared/session/`](shared/session/) in (Module 20): the idle
    warning/logout pair, the activity-tracking heartbeat, the per-device
    `Session` entity with the active/passive model, and the stale-session
    reap job at the 48h default.
18. Build the About screen (Module 21) — user manual, the changelog surfaced
    from Module 6's own generated array, the version line kept in sync with
    `package.json`, and a contact + ACACIA acknowledgment card.
19. Every backend function that diffs a server-authoritative custom field
    before writing it reads that field fresh via `asServiceRole` first
    (Module 22) — never off `auth.me()`'s own `user.data`/`user.role`.
20. The left nav derives its active item from the current route on every
    render, and persists any non-route-derived UI state (expanded groups,
    scroll position) via `sessionStorage`, restored synchronously on mount
    (Module 23) — so a reload never visibly resets navigation chrome.
21. If the app has email + password signup, give it an in-app verification-code
    step reachable from both Register and Login (Module 25) and prove it with a
    throwaway address before the first customer signs up.
22. Give every backend function a `function.meta.json` from the first commit
    (Module 26), and wire the metadata check into `npm run lint`.
23. Decide whether the app uses `mario_style` (Module 27, optional). If yes,
    start from it before the first screen is built: copy
    [`shared/mario_style/`](shared/mario_style/), map the seven `--play-*`
    variables, and set `--radius: 1rem` and the two fonts. Restyling 30
    finished screens later costs far more than starting round.
24. Write `privacy/data-inventory.json` with the first entity that holds a
    person's data (Module 28), decide for each category whether ACACIA is the
    responsable or the encargada, and publish the notice (integral on
    `acaciaco-site`, simplificado at every form) **before the first real
    person's data is stored** — reviewed by a lawyer, not after launch.
25. Copy `CHECKLIST.md` from this repo into the new app's `CLAUDE.md`.

See [`CHECKLIST.md`](CHECKLIST.md) for the compact, copy-pasteable version of
this list, and [`docs/incidents.md`](docs/incidents.md) for the full postmortems
this standard was distilled from.
