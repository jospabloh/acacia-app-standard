# Session control — the canonical files

Module 20 of `STANDARD.md`. Three layers, and an app needs all three — a
client-side idle timer alone protects only the tab that's still open and
running JavaScript, not a device that died mid-session.

**Change these first, then copy out**, the same discipline as
[`shared/theme/`](../theme/) and [`shared/bridge/`](../bridge/) — an app that
edits its own copy in place drifts, and the whole point is that an operator
running two ACACIA apps meets the same idle warning at the same threshold in
both.

| File | Goes to | For |
|---|---|---|
| `useSessionManager.js` | `src/hooks/useSessionManager.js` | Layer 1 + 2: idle detection, heartbeat, device identity |
| `useActivityTracker.js` | `src/hooks/useActivityTracker.js` | Usage/engagement signal — separate from the heartbeat above |
| `IdleWarningDialog.jsx` | `src/components/IdleWarningDialog.jsx` | The countdown dialog shown at the idle-warning threshold |
| `SessionExpiredDialog.jsx` | `src/components/SessionExpiredDialog.jsx` | Shown once the session is closed — locally by idle timeout or remotely by Layer 3 |
| `purgeStaleSessions.example.ts` | adapt into this app's own cron function | Layer 3: the server-side reap job — copy the *shape*, not the literal file, since the Session entity name and cron-guard import are app-specific |

## Wiring the frontend

1. Copy the two hooks and two dialogs in unchanged.
2. Render both dialogs once, high in the app shell (`App.jsx`, next to where
   the theme provider and toaster already live), driven by
   `useSessionManager()`:

   ```jsx
   const { idleState, sessionExpired, continueSession } = useSessionManager();

   <IdleWarningDialog open={idleState === 'idle_warning'} onContinue={continueSession} />
   <SessionExpiredDialog open={sessionExpired} />
   ```
3. Call `useActivityTracker(tenantId)` once the app knows the caller's
   tenant-scoping id (family_id, business_id, ...) — not before, and not on
   every render; the hook itself no-ops until it has one.
4. Both dialogs block interaction with `onPointerDownOutside={e =>
   e.preventDefault()}` — this is deliberate. A session about to close is not
   a moment to let the user click past the warning by accident.

## What the backend needs

A `Session` entity, one row per `(user_id, device_id)`, with at minimum
`user_id`, `device_id`, `device_name`, `status` (`'active' | 'passive' |
'revoked'`), `last_seen`. Three actions a Base44-style function router
exposes (see FlowFin's `base44/functions/session/handlers/` for a full
implementation):

- **`manageSession`** — find-or-create the row for `(user, device_id)`, mark
  it `active`, and demote every *other* `active` session for that user to
  `passive`. This is Layer 2: a user can be logged in on several devices at
  once, but the app always knows which one is "current" and can surface the
  others (`también activo en: iPhone, hace 3 min`) for the user to review or
  revoke — see Module 7's danger zone, which is the natural place to expose
  that list.
- **`sessionHeartbeat`** — bump `last_seen`, and return `403` (client-side:
  treat identically to an idle timeout) if the session's `status` is already
  `'revoked'`. This one check is what makes Layer 3 actually take effect —
  revoking a session server-side does nothing on its own until the next
  heartbeat reads it back.
- **`trackActivity`** — a separate, much lower-frequency write (throttled to
  once/hour in `useActivityTracker`) for usage/engagement reporting. Do not
  conflate this with the heartbeat above: the heartbeat proves "this tab is
  still open," this proves "a person did something in it."

## Layer 3 — the reap job

`purgeStaleSessions.example.ts` is a shape to adapt, not a file to copy
byte-for-byte — the Session entity name and this app's own fail-closed cron
guard (Module 16) are app-specific. What must not change: the **48-hour**
default threshold (long enough that a legitimate multi-day-away laptop sleep
doesn't get logged out from under someone; short enough that a dead session
doesn't sit "active" for weeks), reaping **both** `active` and `passive`
sessions (a `passive` — not-currently-primary — device goes stale exactly the
same way an `active` one does), and wiring it behind the same fail-closed
cron guard every other scheduled endpoint in the app already uses.

> **Known defect (measured in ArtisKids, 2026-10-07): a Base44 automation
> never passes this guard.** Base44's scheduler invokes a function with no
> user and no custom headers, so a guard that demands
> `Authorization: Bearer <CRON_SECRET>` answers 401 to every scheduled run
> and the job never reaps anything. A headerless `POST` to ArtisKids'
> deployed `purgeStaleSessions` returned `401 {"error":"unauthorized"}`, and
> sessions idle since 2026-09-22 were still `passive` two weeks later. A
> schedule set up as a Base44 automation alone is not proof the job runs:
> prove it the way the gate below says, by watching a stale row get revoked.
> The replacement for this guard on Base44-scheduled jobs is an open
> decision (see ArtisKids' `CLAUDE.md`, "Cierre de brechas"); until it is
> made, the in-function 48h check in `session` is what actually enforces
> the threshold.

## Verifying it's live

Per the Verification gates table in `STANDARD.md`: wait past the idle
threshold in a real browser session and confirm the warning dialog actually
fires, then the forced logout; separately, hand-set a test session's
`last_seen` to 49 hours ago, run the reap job, and confirm it flips to
`revoked` and the next heartbeat from that "device" gets rejected.
