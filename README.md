# ACACIA App Standard

The single source of truth for what every app in the ACACIA portfolio must
implement to plug into [Mission Control](https://github.com/jospabloh/acacia-mission-control)
at the same quality bar as the rest of the portfolio — license lifecycle, user
and role control, granular permissions, multi-tenant RLS, health/latency
reporting, changelog, account & danger zone, support/mejoras, its page on
[acaciaco-site](https://github.com/jospabloh/acaciaco-site), and its login
screen.

- **[`STANDARD.md`](STANDARD.md)** — the full contract, module by module, with
  the reasoning behind each rule. Start here. It ends with two tables worth
  knowing about before you need them: the portfolio-wide **secrets inventory**
  (Module 16) and **verification gates**, which says for each module what you
  can run to prove it is actually live rather than merely merged.
- **[`CHECKLIST.md`](CHECKLIST.md)** — the compact version, meant to be copied
  into a new app's own `CLAUDE.md` so every session working on that app sees
  it, not just the one that created it.
- **[`docs/incidents.md`](docs/incidents.md)** — the real production incidents
  (across stockflow, flowfin, and others) each rule was distilled from. Read
  the relevant one before arguing a rule doesn't apply to your case.

This repo is documentation only — no code, no build step. When Mission
Control's own model changes (a new bodega table, a new adapter capability),
update `STANDARD.md` here first, then bring apps into compliance.
