# Incidents this standard was distilled from

Postmortems from across the portfolio that turned into a rule in
[`STANDARD.md`](../STANDARD.md). Kept here instead of duplicated inline so the
standard stays a contract, not a story — but the story is why each rule exists,
so read the relevant one before arguing a rule doesn't apply to your case.

## StockFlow — the verification code had nowhere to be typed (2026-09-29)

A new customer registered, received the emailed code, and could not create his
tenant. Base44's `register()` leaves the account unverified until `verifyOtp`
is called, and `loginViaEmailPassword()` refuses until then. StockFlow's
Register page caught that login failure and redirected to `/login`, which
showed Base44's "Please verify your email" message with no input for the
code — `verifyOtp` and `resendOtp` were called nowhere in the app. It went
unnoticed because every screen worked in isolation and a stuck signup creates
no visible account; it surfaced only because the customer wrote to the owner.

Fixed the same day (jospabloh/stockflow#412): a shared code step used by both
Register and Login, so an already-stuck account could finish from `/login`
too. Deployed and confirmed by content (the served bundle contains the new
code). The live flow with a fresh unverified user was **not** run from the
sandbox; the customer's own completion is the only evidence so far.

Lesson: **Module 25**. The SDK supplies `verifyOtp`/`resendOtp`; it does not
supply the screen, and no other module would have caught its absence. Other
password-signup apps are unaudited for the same gap.

## StockFlow — a tenant's admin held the platform's role (2026-09-24)

A new customer signed up and nothing told the platform owner; looking into
why led to a bigger finding. StockFlow's `createBusinessSafe` gave every new
business admin Base44's built-in `role: "admin"`, and every entity's RLS
carried Module 4's `{"user_condition":{"role":"admin"}}` service branch,
which is not tied to a tenant. The combination let any business admin —
including anyone who self-signed up — reach other businesses' records
outside the app's UI. The app itself never showed it, because every screen
filters by the caller's business.

Confirmed live with a throwaway account rather than inferred, then fixed the
same day: business admins became `owner`, tenant-level checks accept both
values, platform-only checks kept `admin`, and a platform-owner-only
migration moved the two real customers. The same throwaway account, as
`owner`, then read zero rows from other businesses. A lint step now fails if
any function writes `role: 'admin'`.

Two lessons went into the standard. **Module 24**: a tenant's role must be
ANDed with the tenant match, and built-in `admin` belongs to the platform
alone — with a shared checker any app can run in CI. **Gates table, row
11**: the Base44 CLI reported every grouped function `unchanged` after a real
change, and production kept the old code until the app was published from
the panel; a deploy is proven by calling code only the new version has.

A portfolio sweep the same day read every app's live `User` roles: outside
StockFlow, built-in `admin` is held only by the platform owner's accounts.

## Rumbo — an unconfigured login provider locked a new user out entirely (2026-08-26)

Feedback from two prospective users trying to join a live tenant ("Car-Go
Rent") surfaced three unrelated problems in the same WhatsApp thread; this is
the one that generalized into a rule. One of them (Fer Díaz) tapped
"Continuar con Apple" on Rumbo's login screen and got Base44's raw platform
error back verbatim: `Apple authentication is not enabled for this app.
Please contact the app admin for access.` — Sign in with Apple had never
actually been configured for this app. No account was ever created for that
email; querying the app's own `User` entity directly confirmed it — there
was nothing to notice was missing until the person locked out said so by
hand. The button had been there, unconditionally, since the login screen was
built to Module 10's bar — nothing checked whether the provider behind it
was actually live before showing it.

The other two problems from the same feedback were unrelated causes (the
tenant's own vehicle-limit override sat below its plan's real default, and a
client-side error wrapper was swallowing the real message behind a generic
HTTP status code on every guarded write) — see Rumbo's own `CLAUDE.md` for
those. This one generalized cleanly because the shape isn't Rumbo-specific:
a login screen gets built once, against whichever providers happen to be
enabled at the time, and nothing revisits that list later when a provider
quietly isn't wired up (or never was).

Generalized into Module 10: every social login button shown must correspond
to a provider actually enabled for that Base44 app, checked at build time —
not discovered by a user it locks out.

## FlowFin — a security fix reverted by a second, uncoordinated agent (2026-08-25)

A user (`roseta.cafeteria@gmail.com`, Mochi Family) reported being stuck on
the onboarding screen — "create a family or join one by code" — despite
already belonging to one. Two independent investigations ran on the same app
at the same time without either knowing about the other: a Claude Code
session working through git/PRs, and Base44's own in-app AI builder, invoked
directly against the live app.

The Claude Code session confirmed the user's stored data was clean —
`FamilyMembership.status: 'approved'`, `family_id` matching on both the
membership row and `User.data.family_id` — and the deployed `FamilyMembership`
RLS correctly allowed her to read her own row (`data.user_id ===
{{user.id}}`). That ruled out both a data bug and an isolation bug; the
remaining live lead was a stale frontend build never reaching the user's
custom domain, still unresolved when this incident overtook it.

The in-app builder, working from the same symptom with no visibility into
that investigation, reasoned instead that the field-level `rls.write` lock on
`User.family_id` — Module 14 finding #1's fix, shipped and deployed the day
before — was "stripping `family_id` from non-admin reads," and removed it.
**That reasoning does not hold**: a field's `rls.write` rule governs write
eligibility only; it has zero effect on what a read returns. Removing the
lock could not have fixed a read-resolution symptom, and it didn't — the user
was still stuck afterward, through a stale-session-clearing attempt and
finally a real fix (a client-side fallback to service-role-backed backend
functions when a direct entity read comes back empty, which the user
confirmed worked). Meanwhile the lock stayed off: any authenticated user
could set their own `family_id` to an arbitrary value and read that family's
data through every `family_id`-keyed RLS rule in the app — the exact hole
Module 14 finding #1 existed to close, reopened by a session chasing an
unrelated symptom, framed by the user afterward as "your dumb security
checks" having caused the outage in the first place.

Caught only because a later pass re-read the **deployed** schema directly
instead of trusting either session's account of what it had done — by which
point the revert had round-tripped into the git-tracked schema file too, via
this platform's own bidirectional sync, so restoring it live was necessary
but not sufficient; the repo needed the identical fix or the next routine
`entities deploy` would have silently stripped it again.

Generalized into Module 19: a security-relevant RLS lock's own field
description must state its rationale and, critically, which operation it
governs — write vs. read are not interchangeable, and a fix proposed against
the wrong one is wrong regardless of how plausible it sounds. A "fix" that
doesn't resolve the reported symptom is evidence the diagnosis was wrong, not
license to leave the hole open while trying the next theory. And wherever
more than one path can write to an app's schema, a security-relevant change on
either side needs to be checked against the other immediately — not left to
the next audit to discover the drift.

## StockFlow — permission bypass via direct entity write (fixed 2026-08-17)

RLS only enforced tenant isolation, never the app's granular permission keys
(`Caja Chica:add_fund`, `Utilidad:add_withdrawal`, etc.). Those keys were
enforced **client-side only** for `PettyCashMovement`, `UtilityMovement` and
`SupplierPayment` — the client wrote them directly via
`base44.entities.X.create/update/delete(...)`, no server function in between.
An authenticated low-privilege user (`almacenista`) could bypass the UI (e.g.
from devtools) and perform an action their admin had explicitly denied them,
on their own tenant's real data. Deferred twice before (2026-08-03, 2026-08-10)
for lack of a way to deploy and verify the fix. Closed by adding a Safe
function per entity that re-checks auth → tenant → the specific permission key
→ billing_status → field validation, in that order — see `STANDARD.md` Module 3.

Caught along the way: `deno test` had never actually run in this repo's CI —
the test-detection step used `rg -l`, and `rg` isn't installed on the runner,
so it silently fell through to "no tests found" for the life of the check.
A broken assertion would have gone green forever. Lesson generalized into
Module 3's note: a permission check that isn't run by CI isn't verified.

## StockFlow — RLS narrowed one half at a time (2026-06-16, 2026-06-17)

Three outages in three days, each from touching the same live RLS rules:

- **Reads (2026-06-16):** a fix corrected the entity-side path
  (`business_id` → `data.business_id`) but left the user-side template as the
  non-resolving `{{user.business_id}}`. Before the fix, *both* halves were
  wrong, which canceled out into a no-op (everyone saw everything). Fixing
  only one half flipped it to matching **nothing** — every tenant saw zero
  items in the app, portfolio-wide.
- **Writes (2026-06-17):** the follow-up fix corrected the user-side path on
  all four operations, which broke every write app-wide. The backend's Safe
  functions write via a service-role client with no end-user context, so the
  now-correct `{{user.data.business_id}}` template resolved to empty for those
  calls and Base44 rejected the write outright. Nothing saved, anywhere, for
  any tenant.
- **Reads again, same day:** leaving `read` strict (tenant-only, no
  service-role branch) broke every backend action that reads a record before
  acting on it — marking an order delivered did nothing, for both admin and
  non-admin users, because the service-role read matched zero rows and the
  function silently no-op'd on "not found."

Net lesson, generalized into Module 4: RLS changes are not safe to reason
about one half of one rule at a time, and a service-role/admin branch is not
optional on any of the four operations for a tenant-scoped entity — omit it
and something that isn't obviously related (a "not found" on delivery status)
breaks instead of an obvious permission error.

## StockFlow — double-counted petty cash on partial payments (fixed 2026-08-07)

Two independent code paths could mark the same quotation "paid": one always
reconciled the entered amount correctly; the other (a quick-confirm button)
reconciled petty cash against the quotation's **full total**, unconditionally,
regardless of how much had already been collected via the first path. A
quotation paid in two partial installments, finished off via the quick-confirm
path, got double-counted — the ledger showed more collected than the sale was
worth. Lesson: **when two flows can reach the same end state, they must share
the reconciliation logic, not just agree on the final flag.** A field like
`paid: true` being correct is not proof the numbers behind it are.

## StockFlow — race condition in create-or-update petty cash sync

A "does a record already exist for this origin_id" check followed by a
separate create/update was not atomic — two near-simultaneous calls (e.g. a
double-click) could both see "no existing record" and both create one.
Base44 entity schemas have no DB-level uniqueness constraint, so this can't be
closed from the write side alone. Fixed by re-reading actual state right after
every write and deterministically keeping one survivor (oldest `created_date`,
id tiebreak — same rule on every caller, so concurrent requests converge),
neutralizing (not deleting) the rest. A duplicate can still exist for a few
hundred ms mid-race, but never survives past the losing request's own return.
Lesson: **if your backend can't enforce a uniqueness constraint, reconcile
after every write instead of only checking before it.**

A first version of this fix regressed a tenant's explicit
`config_json.prevent_duplicates: false` opt-out — the pre-existing pre-write
cleanup respected the flag, the new post-write one didn't, because the flag
wasn't threaded through. Caught by automated PR review before it shipped.
Lesson: a fix touching one of two symmetric code paths needs the same
configuration surface threaded through both, checked explicitly, not assumed.

## FlowFin — RLS silently over-restricted for 9 days (2026-06-29)

An automated bot commit ("Apply RLS security recommendations") pushed
**directly to `main`, no PR, no review**, and removed the clause letting a
non-admin family member read their own data on ~20 entities, leaving `read`
scoped to platform-admin only. Every non-admin user in every family lost
access to their own financial history; onboarding looped them back to "join a
family" even though they already belonged to one. The existing static RLS
validator didn't catch it — the resulting rule was syntactically valid, just
missing business logic (over-restrictive, not malformed). Nobody noticed for
9 days, until a user reported the symptom.

Lesson, generalized into Module 4: a static syntax validator only catches
*malformed* RLS. It will not catch a rule that's valid but forgot who needs
access. Add a specific check for every over-restriction shape you've actually
been burned by (this portfolio's validator now specifically fails if a
`family_id`/`admin_user_id`-bearing entity's `read` narrows to admin-only with
no member fallback) — and treat a bot pushing directly to `main` with no
review as a standing risk on any repo where that's configured, not a one-time
event.

## FlowFin — `npm run build` mutating committed files broke `git pull` (2026-08-08)

Two scripts regenerating git-tracked files (a permission manifest snapshot and
a docs snapshot, both consumed only by the backend, never the frontend) ran as
part of `build`. Both scripts stamp a "last synced: today" comment, so
**every** routine build produced a local diff on those two files even when
nothing meaningful changed. The next `git pull` for the repo then aborted with
a local-changes-would-be-overwritten error the moment `main` had a newer copy
of either file from someone else's real release. CI never caught it because CI
never ran `build` at all.

Lesson, generalized into Module 6: a routine `build` must be side-effect-free
on the working tree. If a generated file needs refreshing, that belongs in a
named `release`/`sync` step a human runs deliberately, never in the path every
build invocation walks.

## FlowFin — deploying without `CRON_SECRET` silently disabled three crons (2026-08-05)

A guard used by internal cron-only functions was changed from fail-open to
fail-closed by a bot's direct push to `main` (again, no PR, no review — same
pattern as the RLS incident above). Fail-closed is the right design — but it
means a deploy performed without `CRON_SECRET` already set in the backend's
secrets silently disables every function using that guard, including the two
audit crons that exist specifically to catch this class of regression. No CI
check catches it; it only shows up as crons that quietly stop reporting.

Lesson, generalized into Module 1/5/6: when a fail-closed guard exists,
document and enforce the *order of operations* around it explicitly (secret
must exist → automation config must reference it → only then deploy → then
verify in the scheduler panel), because "fail closed" only protects you if the
precondition is actually met before the thing that depends on it ships.

## FlowFin & StockFlow — Base44 functions don't auto-deploy from GitHub

> **Correction (2026-08-21):** this entry used to open with "merging a PR to
> `main` redeploys the **frontend** only." The second half was right; the first
> half was not. Merging redeploys *nothing* — see the next entry.

Everything under the
Base44 functions directory needs a separate, manual
`npx base44 functions deploy --app-id <id> --force`. Skipping this step means
a redeployed frontend calls endpoints that don't exist in the backend yet —
404s wherever the missing function was in the call path, indistinguishable at
first glance from a real outage. Same failure mode applies to entity schema
changes (Module 4's "schema-as-code trap"): the repo file is not the runtime
until someone deploys it.

Lesson: **"committed" and "deployed" are different claims for this whole
portfolio's backend of choice.** Never report a Base44-side change as done
without confirming the deploy step actually ran.

## Portfolio — deploying the wrong repo into four apps (2026-08-21)

A `git pull` failed in `flowfin` (a dirty `package-lock.json`), the shell
stayed in that directory, and the next six deploy commands ran from there.
Each one named the right `--app-id` but took its source from the **current
directory**, so FlowFin's `base44/` was pushed into puntos, radar, stockflow
and ctrlhq. Nothing anywhere checks that the directory and the target app
agree.

Damage: same-named functions were overwritten in the receiving apps —
including `acaciaControl`, the Mission Control bridge, in three of them. In
radar, `entities push` completed and **deleted the entire data model**
(`Company`, `Employee`, `AttendanceRecord`, `PTORequest`, …), replacing it
with FlowFin's 36 entities. No records were lost only because radar had no
tenants yet: Base44 refuses to drop a schema that holds rows, which is also
what saved puntos — its push aborted on `Cannot delete entity schema for
'LicenseEvent': it has existing records`.

Recovery exposed a second trap. `--force` prunes remote functions absent
locally, but **only after a deploy that finished cleanly**. Three of the four
apps were now over Base44's 50-function cap, so the deploy errored partway,
the CLI exited non-zero, and the prune phase never ran — leaving the foreign
functions squatting slots and blocking the very deploy that would remove
them. Breaking the loop means temporarily moving the *new* functions out of
the repo, deploying so the prune runs, then moving them back.

Lessons, now enforced in every app repo:

1. **Bind the app id to the directory, not to the operator's memory.**
   `base44.app.json` holds the id; `npm run deploy` reads it and *refuses* an
   `--app-id` from argv. The mismatch becomes unrepresentable.
2. **Show the blast radius before a destructive push.** `entities push`
   deletes every remote entity absent locally. The wrapper prints the app name
   and the entity list, then requires the operator to type the app's name.
   Standing in a radar deploy and reading "36 entities of FlowFin" is the stop
   sign that did not exist.
3. **Keep headroom under the cap.** `validate:functions` fails the build above
   40 endpoints (Base44 cuts at 50). The margin is what stops a routine deploy
   from turning into a half-applied one.
4. **"No caller in the repo" does not mean dead.** Both flowfin's and
   stockflow's own reorg docs carry a "left untouched — invoked out-of-band"
   list: entity hooks, dashboard crons, agent `tool_configs`, webhook URLs.
   An audit that only greps the repo will confidently propose deleting them.
   `npm run functions:audit` prints what the repo can prove and flags the rest
   as needing a dashboard check, rather than guessing.

## FlowFin — merging deploys nothing, frontend included (2026-08-21)

Two findings on the same day, one cheap and one expensive, both the same shape:
code sitting in `main` that nothing had shipped.

**The expensive one — three days of 404s on the main write path.**
`guardedEntityWrite` (the Module 3 server-side permission and billing gate)
landed in `main` on 2026-08-18 together with `src/lib/guardedWrite.js` and 19
migrated call sites. The frontend was being served and calling it; the backend
function had never been deployed. Every `Transaction`/`Category`/`Goal`/`Trip`
write in the app went to an endpoint that did not exist, for three days. Closed
by a deploy on 2026-08-21.

**The cheap one, which explains why the expensive one was possible.** A fix for
a user-reported bug (Mochi Family: the setup tutorial kept reappearing after
pressing "Omitir") was merged to `main` as `5922916` at 17:14 UTC and CI went
green. **Four hours later the app was still serving the unfixed file** — read
straight out of the running app, `src/hooks/useTutorialState.js` was 352 lines
with zero occurrences of any identifier the fix introduced, and
`enqueuePersist` still carried the exact race the fix removes.

Four hours is a short window only because somebody went and looked. Nothing
indicates it would have closed on its own, and a fix merged on a Friday stays
that way until someone notices.

Nothing was wrong with the code. The cause was a sentence in the repo's own
`CLAUDE.md` — and in the entry above — asserting that merging to `main`
redeploys the frontend. It does not. Nobody ran a site deploy because the
documentation said one wasn't needed.

**The detail that makes this hard to catch:** the app's checkpoint reports a
`git_commit_hash` equal to `main`'s HEAD *even when the tree being served is
behind*. Base44 mirrors the commits into its metadata, but what gets built and
served is the app's working tree, and the two can diverge. A hash that matches
is not evidence the fix is live.

Lessons:

1. **Verify a deploy by content, not by hash or by a green merge.** Read the
   deployed file and grep for an identifier that exists *only* in the fix.
   `wc -l` against the repo's own line count is a decent second signal.
2. **Every manual deploy step gets a command.** `npm run deploy:site` now
   exists in all nine app repos, next to `deploy` and `deploy:entities`. The
   2026-08-21 incident above and this one are the same shape: a step that
   depended on somebody remembering it.
3. **A user-reported bug is not closed when the PR merges.** It is closed when
   the thing the user touches behaves differently. For this portfolio that is
   always at least one deploy past the merge.

---

## Plink FX — two copies of one app, and a crash a transpiler hid (2026-08-22)

Plink FX exists twice: `jospabloh/plink_fx`, a standalone PWA build, and
`freeware/plink-fx/` inside `jospabloh/acaciaco-site`, which is the copy
acaciaco.com.mx actually serves. Nothing kept them in step, and they drifted for
months.

**Both sides lost ground, which is why this is worse than a stale fork.** The
served copy had gone that whole time with no error boundary (a render fault =
blank page), no focus trap on the post-trip dialog, no guard against dividing by
a zero budget, no `<h1>`, `role="tablist"` on buttons that govern no tabs, and
358 KB of jsPDF pulled from a third-party CDN on every visit. The repo copy had
gone the same months without the stale-trip-date fix and without a single
translated authentication error. Each side had been improved by someone who
could only see one of them.

**The find that only appeared when the two files were put side by side:** the
served copy's `downloadSummary` read `effectiveLang` in its dependency array
before the `const` that declares it. A textbook TDZ `ReferenceError` — and it
had never once been observed, because `@babel/standalone` compiles `const` down
to `var` for its browser targets, so the read quietly produced `undefined`
instead of throwing. The identical file died on mount the moment it went through
the other repo's es2020 bundle.

Lessons:

1. **A permissive transpiler can hide a crash indefinitely.** In-browser Babel
   is not a neutral way to ship the same source; it changes which bugs are
   fatal. The jsdom test that mounts the *built bundle* with production React is
   what surfaced this, and it is worth having wherever a file is served two ways.
2. **Duplicated source needs an automated comparison or it will diverge** — and
   it will diverge in both directions, so "just copy the good one over" destroys
   work. `npm run check:mirror` now compares `app.jsx`, `tweaks-panel.jsx` and
   the shared stylesheet against **what the site actually serves**, on a daily
   cron, for the same reason every other check in this portfolio reads content
   rather than a commit hash.
3. **Name which copy is canonical, in both repos' `CLAUDE.md`.** Reconciling
   these took reading 874 lines of diff and judging each hunk on its merits;
   the cost of that is the price of never having written down which one wins.

## Nine deploys, five red: what the first real smoke run found (2026-08-22)

The portfolio's `test:smoke` suites were fired across all twelve UI repos for
the first time right after a nine-app deploy round. **Seven green, five red** —
and none of the five was the suite being wrong. They were three genuinely
different failures that had been invisible until something looked at the served
site instead of the repo.

### 1. Nine deploys shipped the wrong commit

Every `git pull` in the deploy round ran *before* the PRs merged, so every
`npm run deploy:site` uploaded the previous commit. For six apps this cost
nothing — the only delta was `tests/smoke/smoke.spec.js`, which never enters the
bundle. For **kitchops** it cost everything: its local `main` was two merges
behind, missing the PR that added the light theme, so the deploy shipped 13
missing site files including `ThemeSwitcher.jsx`, `index.css` and `index.html`.
The served page came back 3021 bytes with no pre-mount script.

The lesson is the mirror image of the one every CLAUDE.md already carries.
"Merging does not deploy" is true; so is **"deploying does not merge"** — a
deploy is only as current as the checkout it runs from, and `✓ desplegado` says
nothing about which commit that was. `git pull && npm run deploy:site`, in that
order, in one command.

To check afterwards, compare what was deployed against `origin/main`, restricted
to files that actually reach the bundle:

    git diff --name-only <deployed-sha>..origin/main -- src/ index.html public/

Zero files means the deploy was equivalent even if the SHAs differ. Anything
else means the served site is behind.

### 2. Three apps are behind Base44's platform login, so their own build is never served

`liuma`, `puntos` and `radar` return ~14 KB of Base44's *own* frontend —
`/static/index-*.js`, Monaco, Google SSO — on both their custom domain and their
`.base44.app` subdomain. A working app (`rumbo-fleet-flow.base44.app`, 11 KB)
serves `/assets/index-*.js`, the Vite output.

**The first reading of this was wrong and is worth recording as such.** It looked
like a failed publish — the sites were redeployed twice more, each reporting
success, and nothing changed. The status line is what actually settles it:

    rumbo, kitchops, cateqhub, ctrlhq, flowfin, stockflow → 200, no redirect
    liuma, puntos, radar                                  → 302 → /login

Those three have Base44's **platform-level authentication gate** switched on. The
deploy uploads the build correctly every time; the platform simply never serves
it to an anonymous visitor, answering with its own login instead. No amount of
redeploying can fix a setting, which is exactly why three "successful" deploys
looked like a mystery.

Two consequences, and the second is the one that matters:

- **The suite structurally cannot test an app behind that gate.** It holds no
  credentials, by design. Those three repos need their smoke config to say so
  rather than stay red forever.
- **An anonymous visitor to `liuma.acaciaco.com.mx` does not reach LIUMA's login
  page.** They get a Base44 page — no app `<title>`, no app OG tags, none of the
  branding a working app like `rumbo` serves. That is a Module 10 problem
  (login on-brand) hiding inside a Module 13 failure, and it is customer-facing.

The tell, on any app, in one line:

    curl -sI <url> | grep -i location            # /login = platform gate
    curl -sL <url> | grep -c '/assets/index-'    # 1+ = the app's own build
    curl -sL <url> | grep -c '/static/index-'    # 1+ = the platform shell

**This is worth its own assertion in the suite.** Today the platform shell fails
the theme tests with `element(s) not found`, which reads like a missing
component and cost an hour to trace. Worse, assertion #1 ("responds, and is this
app") *passes* — the platform shell boots something that sets the right
`<title>` — so the one check meant to prove "this is the right app" says yes
while the app is not being served at all.

### 3. An app's registered URL had no DNS record

`radar.acaciaco.com.mx` does not resolve. Every assertion failed on
`net::ERR_NAME_NOT_RESOLVED` before it could test anything. That hostname is not
a guess in the test config: it is what Mission Control has registered for the
app (`0015_seed_radar_app.sql`), so the same dead name is what the panel polls
and what any customer-facing link points at.

The config was deliberately **not** repointed at a `.base44.app` URL. Doing so
would have turned the suite green while the app's official address stayed broken
for everyone else — exactly the "green suite that means less than it looks like"
the standard warns about.

### 4. And one real bug, which is the point

`cateqhub` failed with `something is painted over the switcher on tablet
(plegado)`, reproducibly. The Radix toast container in `src/components/ui/toast.jsx`
is a fixed, full-width strip pinned bottom-right (`max-w-[420px]` from `md` up)
at `z-[100]`, invisible when empty but still taking pointer events over the
corner the switcher lives in. Six repos had it unguarded; `pointer-events-none`
on the container fixes it, since the toasts themselves already carry
`pointer-events-auto`.

That one is what the module-12 collision check exists for, and no local build
would ever have shown it.

### What a dev sandbox cannot do here, established by trying

- Outbound HTTPS to these domains is blocked by the proxy allowlist
  (`CONNECT tunnel failed, 403`). The Base44 app sandbox *can* reach them and
  makes a usable probe.
- The Base44 CLI inside that sandbox is unauthenticated and needs an interactive
  device-code login; `~/.base44` holds no credentials. **Deploys need a human.**
- Testing GitHub reachability with `api.github.com/rate_limit` proves nothing —
  it answers 200 unauthenticated. A watcher built on that assumption polled an
  error body for fifteen minutes. Check an endpoint that actually requires auth.

---

## Portfolio — the bridge went dark for four apps on a sentence nobody checked (2026-08-24)

Module 15 replaced the one shared `INGEST_HMAC_SECRET` with a key derived per
app. The last step — flip `ACCEPT_LEGACY_MASTER` to `false` and delete Mission
Control's fallback to the master — is gated on evidence: a full sync of all nine
apps whose log carries zero `rejected the derived key` warnings.

The sync ran at 13:37–13:38 UTC. The flag was flipped and the fallback deleted
at 13:53, with this in the commit message:

> *every call verified derived on the first attempt; the fallback never fired
> once, and never logged the warning it existed to emit*

The log of that exact sync said:

```
13:38 UTC, dpl_EbLRHFmiUGCG92exxgBEQDqL4HWR
callBridge: app=radar  rejected the derived key and accepted the master…
callBridge: app=rumbo  rejected the derived key and accepted the master…
callBridge: app=puntos rejected the derived key and accepted the master…
callBridge: app=liuma  rejected the derived key and accepted the master…
```

Four of nine. The sentence was composed, not checked. Mission Control deployed
to production at 13:55 signing derived-only with no fallback, and those four
lost licences, usage, sessions and health until the revert deployed at 16:07 —
two hours and twelve minutes.

**The cause of the rejection was a secret, not code.** The split was exact and
diagnostic: the five that verified derived were the five whose
`ACACIA_APP_SLUG` had been set that morning; the four that failed were the four
whose `CLAUDE.md` said the secret was "already set" from an earlier feature.
The CLI confirmed their `acaciaControl` was `unchanged` — the deployed code
already had derived verification — so the only variable left was the value.
Correcting it in the four and re-running the sync gave nine audit rows and a
clean log at 16:29.

**The revert cost more than it should have**, because the nine app PRs carrying
the bad flip were merged in the two minutes before the revert was pushed. Nine
branches had to be rebased onto their new `main`s and re-PRed. A change that is
being reverted is worth saying so *before* the merge queue drains.

Four things this produced, all now in `STANDARD.md`:

- **Module 16** exists at all — an inventory of every portfolio-wide secret and
  the instruction to read each one back. A value documented as set is a claim
  about someone's memory.
- Module 15's step 3 now states the gate as a log you read, and records that it
  was skipped here.
- The revert kept `ACCEPT_LEGACY_MASTER = false` for MC's **inbound**
  verification while restoring the **outbound** fallback, because only inbound
  was ever the vulnerability: MC picks its destination by appId, so it cannot
  be tricked into talking to the wrong app. Splitting the two directions let
  service come back without reopening the hole. It was reverted in full
  anyway — with four apps in an unknown state, the honest move was the whole
  dual-accept posture back, not the half that looked better.
- **Absence of a warning is not evidence unless you looked.** Hours earlier in
  the same rollout, three apps showed doubled bridge latency; that was
  hypothesised as the fallback firing and correctly disproved as cold starts.
  Having disproved one signal, the next step treated the absence of a different
  signal as proof — without opening the log. Disproving a false alarm says
  nothing about a signal you never read.

## StockFlow — a function nobody could explain, and crons that never ran (2026-09-30)

**What happened.** A consolidation audit of StockFlow's 47 functions (Base44
cap 50, `maxFunctions` 47, headroom zero) needed to know which ones were in use.
`updateProductStockSafe` had no caller anywhere: not in `src/`, workflows,
agents, other repos or Mission Control. Its history had to be reconstructed
from git. It was added 2026-03-30 for `MovementFormDialog` and orphaned
2026-04-20, when that call was removed because it double-applied stock on top
of the `syncProductStock` workflow. After that it stayed deployed. It was still
maintained: the 2026-09-28 security sweep hardened it like every other function.
Its audit-log line has never been written since. It also sets stock without a
movement, which breaks the inventory single source of truth.

The same audit found `dailyPermissionAudit`, `dailyDocumentationAudit`,
`cleanupSessions`, `dailyStockReconcile` and `sendCourseReminders` deployed as
"crons" with **no scheduler**. Only 3 workflows are active in the panel. The
setup doc described crons that were never created, and the 09:00 audit did not
appear in that day's logs.

**Why it went unnoticed.** Base44 keeps function logs for about 13 hours, so
nobody could look back to see what ran. The repo showed files, not whether
anything called them. A function with an entry point looks alive whether or not
anything reaches it.

**What changed.** Module 26: a `function.meta.json` per function, CI that checks
declared callers and triggers against the code and the workflows, and a
deletion rule that needs 7 days of *captured* logs, not today's window.

## Portfolio — a privacy notice nobody could check against the app (2026-10-07)

**What happened.** Reading a competitor's privacy notice as a possible model
showed a document that cited articles of the 2010 data-protection law
(abrogated 2025-03-20), sent complaints to the wrong authority, and described
a QR reader while its own home page sold payments, finances and visitor
registries. Reading ACACIA's own notice the same day showed different gaps:
four of eleven apps named, a city instead of an address, no purposes marked as
needing consent, no way to limit use or revoke consent, and nothing about the
data tenants load into the apps about their own customers. No app repo records
what personal data it stores.

**Why it went unnoticed.** A privacy notice is prose on a marketing site, in a
different repo from every app. Adding an entity with a phone number changes
nothing there, and no check connects the two. The notice was last edited
2026-04-28; the apps have changed many times since.

**What changed.** Module 27: a `privacy/data-inventory.json` per app that CI
keeps equal to the schema, the notice written from it, ACACIA's role decided
per data category, an ARCO path through Module 8, and deletion that reaches
Mission Control's bodega. Nothing was fixed in any app or on the site by this
entry; every app is red on Module 27 until it does the work.
