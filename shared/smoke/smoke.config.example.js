// Per-app half of the shared smoke suite. Copy this next to smoke.spec.js as
// `smoke.config.js` and fill it in; the spec itself stays byte-identical.
export default {
  // Shown in the test title.
  name: 'FlowFin',

  // The deployed site. SMOKE_URL overrides it, which is how the workflow points
  // the same suite at a preview deployment.
  url: 'https://flowfin.acaciaco.com.mx',

  // Proves the deploy served THIS app and not a stale or unrelated one. Taken
  // verbatim from this repo's index.html.
  title: /FlowFin/,

  // Optional: a one-time overlay a first-time visitor has to clear before the
  // corner of the screen is clickable (a cookie modal, a welcome sheet).
  // dismissOverlay: '.cookie-banner button',

  theme: {
    // How the app represents the resolved colour, and where its switcher lives:
    //   'class'     — Tailwind `.dark` on <html>;  root '[data-theme-switcher]'
    //   'attribute' — `data-theme` on <html>;      root '.acacia-theme-switcher'
    //   'plink'     — `.app.theme-ink`;            root '.fx-theme'
    //   'none'      — the app ships one theme on purpose; no switcher, and the
    //                 suite asserts its absence instead. Say why in CLAUDE.md.
    kind: 'class',
    root: '[data-theme-switcher]',
  },
};
