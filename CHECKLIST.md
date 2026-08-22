# Portfolio Standard — Checklist

Copy this block into the app's own `CLAUDE.md`. Full rationale for each item is
in [`STANDARD.md`](https://github.com/jospabloh/acacia-app-standard/blob/main/STANDARD.md)
in `jospabloh/acacia-app-standard` — read it before implementing any item below
for the first time, and re-read the relevant section before touching a module
that's already implemented.

```
## ACACIA Portfolio Standard

This app is part of the ACACIA portfolio and must stay compliant with
jospabloh/acacia-app-standard. Status:

- [ ] Module 1 — License lifecycle: tenant entity has `billing_status`
      (trial|active|view_only|suspended), written ONLY by Mission Control's
      unified cron. No native lifecycle/renewal/reminder cron in this repo.
- [ ] Module 2 — Roles: app role model declared in one file, mapped onto the
      backend's built-in role field; Mission Control operator roles
      (owner/admin/viewer) are a separate layer, never conflated.
- [ ] Module 3 — Granular permissions: one client registry file + server-side
      re-check on every write path (permission key, in the same precedence
      order as the client), gated behind billing_status too. No entity is
      written to directly from the client without a Safe-function equivalent.
- [ ] Module 4 — RLS: every tenant-scoped entity has the four-op `$or` shape
      (tenant branch + service-role admin branch), both halves of every rule
      verified (data.* on the entity side, {{user.data.*}} on the user side).
      Static validator wired into CI. Schema changes are deployed, not just
      committed.
- [ ] Module 5 — Health: a real (not hardcoded-200) health/latency endpoint
      Mission Control's adapter can poll.
- [ ] Module 6 — Changelog: APP_VERSION/RELEASE_DATE + in-app changelog,
      generated only by the release script, never by the routine build.
- [ ] Module 7 — Account & danger zone: member management gated by Module 3,
      data export, irreversible delete with a real confirmation step.
- [ ] Module 8 — Support/mejoras: entry point writes to this app first, then
      syncs into Mission Control's tickets/leads bodega. No parallel triage UI.
- [ ] Module 9 — acaciaco-site: this app has a page under apps/ (or freeware/),
      using styles/base.css tokens, dark-theme correct.
- [ ] Module 10 — Login page: on-brand, real error/suspended/view_only states,
      links to trial and support, dark-theme correct.

- [ ] Module 11 — Deploy discipline: `base44.app.json` + `npm run deploy`
      (refuses `--app-id`), `deploy:site` for the frontend (merging to `main`
      deploys nothing), `deploy:entities` behind a typed confirmation, and
      `validate:functions` in lint keeping endpoints under 40 (Base44 caps at
      50). Run `npm run functions:audit` before consolidating anything, and
      verify every deploy by reading the served file, not by a hash or a merge.

- [ ] Module 12 — Theme control: the shared corner switcher from
      `shared/theme/`, offering claro / oscuro / sistema, copied in unchanged
      and rendered once inside the theme provider. Preference stored as
      'light' | 'dark' | 'system' (never the resolved colour), pre-mount script
      in index.html so there is no flash, and no other theme control left in
      the app. An app that ships only one theme says so, with its reason, here.

- [ ] Module 13 — Live-site smoke test: `npm run test:smoke` runs the shared
      suite from `shared/smoke/` against the DEPLOYED site (title, no throw,
      theme painted pre-mount, switcher works), wired to
      `.github/workflows/smoke.yml` on workflow_dispatch + a daily cron. Red
      here means the last merge was never deployed — that is the suite working.

Last audited against the standard: <date> — <what changed / what's still open>
```
