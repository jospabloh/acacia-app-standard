// ACACIA portfolio session control — Module 20 of STANDARD.md, Layer 3.
//
// This is the piece a client-side idle timer structurally cannot provide: a
// session whose device died (battery drained, tab killed by the OS, laptop
// closed and never reopened) never sends another heartbeat, so it sits
// 'active'/'passive' forever — nothing client-side is left running to log it
// out. A scheduled job has to close it from the server side instead.
//
// Adapt the entity name and the guard import to this app's own conventions
// (this example follows the Base44/Deno shape most of the portfolio uses —
// see FlowFin's base44/functions/session/ for the entity and its
// manageSession/sessionHeartbeat/trackActivity actions this job assumes).
//
// Wire this behind the SAME fail-closed cron guard every other scheduled
// endpoint in this app already uses (Module 16) — an unset CRON_SECRET must
// mean 503, never "ran anyway."
//
// KNOWN DEFECT on Base44: a scheduled automation calls the function with no
// headers, so requireCron answers 401 to every run and nothing is reaped.
// See shared/session/README.md, "Layer 3", before copying this shape.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { requireCron } from '../_internalGuard.ts'; // this app's own fail-closed cron guard

const STALE_AFTER_MS = 48 * 60 * 60 * 1000; // 48h — the portfolio default, see Module 20

Deno.serve(async (req: Request) => {
  const guardResponse = requireCron(req);
  if (guardResponse) return guardResponse; // fails closed: no secret → 503, never runs

  const base44 = createClientFromRequest(req);
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  // Adjust the filter to this app's Session entity shape — the two
  // properties that matter are "not already revoked" and "last_seen older
  // than the cutoff." Do NOT filter by status: 'active' only — a 'passive'
  // session (an older device the user is no longer primarily using) goes
  // just as stale as an 'active' one, and both need reaping.
  const stale = await base44.asServiceRole.entities.Session.filter({
    status_ne: 'revoked',
    last_seen_before: cutoff,
  });

  let revoked = 0;
  for (const session of stale ?? []) {
    await base44.asServiceRole.entities.Session.update(session.id, { status: 'revoked' });
    revoked++;
  }

  // Revoking here is the whole fix: sessionHeartbeat.ts's own existing check
  // (`if (found.status === 'revoked') return 403`) turns this into a forced
  // re-auth the next time that device's tab wakes up — no separate client
  // change needed, this reuses the guard rail Mission Control's own
  // remote-force-logout path already relies on.
  return Response.json({ ok: true, revoked, cutoff });
});
