# Incidents this standard was distilled from

Postmortems from across the portfolio that turned into a rule in
[`STANDARD.md`](../STANDARD.md). Kept here instead of duplicated inline so the
standard stays a contract, not a story — but the story is why each rule exists,
so read the relevant one before arguing a rule doesn't apply to your case.

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

Merging a PR to `main` redeploys the **frontend** only. Everything under the
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
