#!/usr/bin/env node
// STANDARD Module 24 — a tenant's role must never match rows of every tenant.
//
// Copy into an app as scripts/check-tenant-roles.mjs and run it in CI
// (`npm run validate:tenant-roles`). It fails the build on:
//   1. an RLS `user_condition` that tests anything other than the platform tier
//      (built-in role "admin" / "__service_role_only__") WITHOUT being ANDed
//      with a tenant match — i.e. a tenant role (owner, business_admin, a
//      data.*_role field…) that would match every tenant's rows;
//   2. an object holding `user_condition` next to sibling keys — Base44 drops
//      the siblings silently, so the condition ends up unscoped;
//   3. backend code that writes built-in role "admin" to a user outside the
//      platform-owner files listed in --allow.
// It reads the repo's schema files, not the deployed schema: pair it with the
// Module 4 rule of verifying what is deployed.
//
//   node scripts/check-tenant-roles.mjs [--root .] [--allow path1,path2]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const PLATFORM_ROLES = new Set(['admin', '__service_role_only__'])
const TENANT_TEMPLATE = /^\{\{\s*user\.(id|email|data\.[A-Za-z0-9_]+)\s*\}\}$/

export function stripJsonc(text) {
  let out = ''
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      out += c
      if (c === '\\') { out += text[++i] ?? ''; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue }
    out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

// A node "matches the caller's tenant" if it pins a record field to a user template.
function isTenantMatch(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false
  return Object.entries(node).some(([k, v]) =>
    k !== 'user_condition' && !k.startsWith('$') && typeof v === 'string' && TENANT_TEMPLATE.test(v))
}

function isPlatformCondition(cond) {
  const keys = Object.keys(cond ?? {})
  return keys.length === 1 && keys[0] === 'role' && PLATFORM_ROLES.has(cond.role)
}

// Walk one rule; `scoped` is true once an enclosing $and carries a tenant match.
export function findUnscoped(rule, path = '', scoped = false, out = []) {
  if (!rule || typeof rule !== 'object') return out
  if (Array.isArray(rule)) { rule.forEach((r, i) => findUnscoped(r, `${path}[${i}]`, scoped, out)); return out }
  if ('user_condition' in rule) {
    const siblings = Object.keys(rule).filter((k) => k !== 'user_condition')
    if (siblings.length) out.push({ path, kind: 'sibling-keys', detail: `user_condition beside ${siblings.join(', ')} (siblings are dropped)` })
    if (!scoped && !isPlatformCondition(rule.user_condition)) {
      out.push({ path, kind: 'unscoped-tenant-role', detail: JSON.stringify(rule.user_condition) })
    }
  }
  if (Array.isArray(rule.$and)) {
    const tenantScoped = scoped || rule.$and.some(isTenantMatch)
    rule.$and.forEach((r, i) => findUnscoped(r, `${path}.$and[${i}]`, tenantScoped, out))
  }
  if (Array.isArray(rule.$or)) rule.$or.forEach((r, i) => findUnscoped(r, `${path}.$or[${i}]`, scoped, out))
  return out
}

export function checkEntity(name, schema) {
  const findings = []
  for (const [op, rule] of Object.entries(schema?.rls ?? {})) {
    for (const f of findUnscoped(rule, `rls.${op}`)) findings.push({ entity: name, ...f })
  }
  for (const [field, def] of Object.entries(schema?.properties ?? {})) {
    for (const [op, rule] of Object.entries(def?.rls ?? {})) {
      for (const f of findUnscoped(rule, `properties.${field}.rls.${op}`)) findings.push({ entity: name, ...f })
    }
  }
  return findings
}

const ASSIGN_ADMIN = /\brole\s*:\s*['"]admin['"]/

export function findAdminAssignments(source) {
  const hits = []
  source.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    if (ASSIGN_ADMIN.test(code) && !/user_condition/.test(code)) hits.push({ line: i + 1, text: line.trim() })
  })
  return hits
}

function walk(dir, exts) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
  const root = opt('--root') ?? '.'
  const allow = new Set((opt('--allow') ?? '').split(',').filter(Boolean))
  const problems = []

  const entDir = [join(root, 'base44/entities'), join(root, 'entities')].find(existsSync)
  if (!entDir) { console.error('✗ no base44/entities directory found'); process.exit(1) }
  for (const file of walk(entDir, ['.jsonc', '.json'])) {
    let schema
    try { schema = JSON.parse(stripJsonc(readFileSync(file, 'utf8'))) } catch (e) {
      problems.push(`${relative(root, file)}: cannot parse (${e.message})`); continue
    }
    for (const f of checkEntity(schema.name ?? file, schema)) {
      problems.push(`${relative(root, file)} ${f.path}: ${f.kind} — ${f.detail}`)
    }
  }
  for (const file of walk(join(root, 'base44/functions'), ['.ts', '.js'])) {
    const rel = relative(root, file)
    if (allow.has(rel) || /\.test\.(ts|js)$/.test(rel)) continue
    for (const h of findAdminAssignments(readFileSync(file, 'utf8'))) {
      problems.push(`${rel}:${h.line}: assigns built-in role 'admin' — ${h.text}`)
    }
  }

  if (problems.length) {
    console.error(`✗ Module 24 — ${problems.length} problem(s):`)
    for (const p of problems) console.error('  ' + p)
    console.error("  A tenant's role must be ANDed with a tenant match; built-in 'admin' is the platform's only.")
    process.exit(1)
  }
  console.log('✓ Module 24 — no tenant role reaches every tenant; no code hands out built-in admin.')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
