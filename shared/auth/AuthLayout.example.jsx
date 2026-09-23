import React from "react";

/**
 * Module 10's structural bar, as code: a real in-app auth screen — never
 * Base44's hosted login — split into a form column and a brand panel, not a
 * single generic centered card. Two apps converged on this shape
 * independently (FlowFin, StockFlow) before it was written down here; a
 * third (ArtisKids) shipped without it, got flagged, and had to retrofit it
 * after users were already comparing it to its siblings. Copy this in for
 * every new app instead of relying on Login.jsx alone to carry the whole bar.
 *
 * Unlike shared/theme/ThemeSwitcher.jsx or shared/bridge/acaciaSign.ts, this
 * file is NOT meant to stay byte-identical across apps — it's a shape to
 * adapt (same convention as shared/session/purgeStaleSessions.example.ts).
 * Every color here is a shadcn design-token class (bg-primary,
 * text-muted-foreground, border-input, ...), never a literal Tailwind color,
 * so the panel inherits whatever brand color the app's own
 * --primary/--primary-foreground resolve to in src/index.css. That's the
 * one thing worth checking BEFORE wiring this in, not after: a fresh
 * create-base44-app scaffold's --primary is shadcn's own near-black/white
 * default, never the app's real brand color. If every other page already
 * uses bg-amber-500 (or whatever) for its primary buttons and this layout
 * still renders black, --primary was never customized — fix it in
 * index.css, not with a one-off override here (see ArtisKids' CLAUDE.md,
 * 2026-09-23, for the incident this note exists to prevent a repeat of).
 *
 * Props beyond the existing icon/title/subtitle/footer/children (unchanged
 * from every app's current AuthLayout) are the brand panel's own copy —
 * supply real copy for the product, not a placeholder left in from this
 * file:
 *   appName        - shown in the top-left lockup and the bottom tagline
 *   logoSrc         - path to the app's real logo image
 *   tagline         - one line under appName at the bottom of the form column
 *   eyebrow         - short pill label on the brand panel ("Finanzas familiares · presupuestos")
 *   headline        - the panel's main line (a string or a fragment)
 *   headlineAccent  - the differently-colored closing phrase, rendered on its own line
 *   description     - one supporting paragraph under the headline
 */
export default function AuthLayout({
  icon: Icon,
  title,
  subtitle = null,
  footer = null,
  children,
  appName,
  logoSrc,
  tagline,
  eyebrow,
  headline,
  headlineAccent,
  description,
}) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
      {/* Form column */}
      <div className="flex min-h-screen flex-col px-6 py-8 lg:min-h-0 lg:px-12">
        <a href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
          {logoSrc && <img src={logoSrc} alt={appName} className="h-9 w-9 rounded-xl object-cover shadow-sm" />}
          {appName}
        </a>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-7 text-center">
            {Icon && (
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {appName}
          {tagline ? ` · ${tagline}` : ""}
        </p>
      </div>

      {/* Brand panel (desktop only — collapses away below lg, not hidden with opacity/height tricks) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-background lg:block">
        <div className="absolute inset-0 flex flex-col justify-center px-12">
          {eyebrow && (
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {eyebrow}
            </span>
          )}
          <h2 className="mt-5 text-4xl font-bold leading-tight">
            {headline}
            {headlineAccent && (
              <>
                <br />
                <span className="text-primary">{headlineAccent}</span>
              </>
            )}
          </h2>
          {description && <p className="mt-4 max-w-sm text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
  );
}
