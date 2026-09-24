// node --test shared/tenant-roles/check-tenant-roles.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findUnscoped, checkEntity, findAdminAssignments, stripJsonc } from './check-tenant-roles.mjs'

const TENANT = { 'data.business_id': '{{user.data.business_id}}' }

test('the Module 4 shape passes: tenant match OR the platform tier', () => {
  const rule = { $or: [TENANT, { user_condition: { role: 'admin' } }] }
  assert.deepEqual(findUnscoped(rule), [])
})

test('a tenant role in a bare $or branch is caught — it matches every tenant', () => {
  const rule = { $or: [TENANT, { user_condition: { role: 'business_admin' } }] }
  const f = findUnscoped(rule)
  assert.equal(f.length, 1)
  assert.equal(f[0].kind, 'unscoped-tenant-role')
})

test('the same tenant role inside an $and with the tenant match is fine (Rumbo design)', () => {
  const rule = { $and: [{ 'data.tenant_id': '{{user.data.tenant_id}}' }, { $or: [{ user_condition: { role: 'owner' } }, { user_condition: { role: 'admin' } }] }] }
  assert.deepEqual(findUnscoped(rule), [])
})

test('a data.* role field unscoped is caught too, not just built-in role', () => {
  const f = findUnscoped({ user_condition: { 'data.parish_role': 'admin' } })
  assert.equal(f[0].kind, 'unscoped-tenant-role')
})

test('user_condition with sibling keys is flagged, because Base44 drops the siblings', () => {
  const f = findUnscoped({ user_condition: { role: 'owner' }, 'data.business_id': '{{user.data.business_id}}' })
  assert.ok(f.some((x) => x.kind === 'sibling-keys'))
})

test('an $and without a tenant match does not scope anything', () => {
  const rule = { $and: [{ user_condition: { role: 'owner' } }, { user_condition: { 'data.write_access': 'enabled' } }] }
  assert.equal(findUnscoped(rule).length, 2)
})

test('field-level locks are checked as well as entity rules', () => {
  const schema = { rls: { read: TENANT }, properties: { billing_status: { rls: { write: { user_condition: { role: 'owner' } } } } } }
  const f = checkEntity('Business', schema)
  assert.equal(f.length, 1)
  assert.match(f[0].path, /billing_status/)
})

test('code that hands a user built-in admin is caught; the RLS literal is not', () => {
  const src = "await sr.entities.User.update(user.id, { business_id: b.id, role: 'admin' });\n" +
    "const rule = { user_condition: { role: 'admin' } };\n// role: 'admin' in a comment"
  assert.deepEqual(findAdminAssignments(src).map((h) => h.line), [1])
})

test('jsonc comments and trailing commas parse', () => {
  const s = stripJsonc('{ // c\n "a": "http://x", /* b */ "b": [1,2,], }')
  assert.deepEqual(JSON.parse(s), { a: 'http://x', b: [1, 2] })
})

import { userDataFieldsUsed, unlockedUserFields } from './check-tenant-roles.mjs'

test('a tenant pointer read by RLS must be locked on User, or users re-point themselves', () => {
  const patient = { rls: { read: { 'data.tenant_id': '{{user.data.tenant_id}}' } } }
  const used = userDataFieldsUsed(patient)
  assert.deepEqual([...used], ['tenant_id'])
  assert.deepEqual(unlockedUserFields(used, { properties: { tenant_id: { type: 'string' } } }), ['tenant_id'])
  assert.deepEqual(unlockedUserFields(used, null), ['tenant_id'], 'no User schema at all is also unlocked')
  const locked = { properties: { tenant_id: { rls: { write: { user_condition: { role: 'admin' } } } } } }
  assert.deepEqual(unlockedUserFields(used, locked), [])
})

test('a data role tested in user_condition counts as a field RLS depends on', () => {
  const sub = { rls: { read: { $and: [{ user_condition: { 'data.app_role': 'ADMIN' } }, { 'data.school_id': '{{user.data.school_id}}' }] } } }
  assert.deepEqual([...userDataFieldsUsed(sub)].sort(), ['app_role', 'school_id'])
})

test('a lock that a tenant role can satisfy is not a lock', () => {
  const used = new Set(['business_id'])
  const weak = { properties: { business_id: { rls: { write: { user_condition: { role: 'owner' } } } } } }
  assert.deepEqual(unlockedUserFields(used, weak), ['business_id'])
})

import { SERVICE_ONLY } from './check-tenant-roles.mjs'

test('write:false is the strongest lock — Rumbo locks tenant_id this way and must pass', () => {
  const user = { properties: { tenant_id: { rls: { write: false } } } }
  assert.deepEqual(unlockedUserFields(new Set(['tenant_id']), user), [])
})

test('design B: a bare built-in admin is a tenant role there, so it is caught', () => {
  // Rumbo's tenant admins hold built-in "admin"; a bare branch would match every tenant's admin.
  const rule = { $or: [{ user_condition: { role: 'admin' } }] }
  assert.equal(findUnscoped(rule).length, 0, 'design A: admin is the platform tier')
  assert.equal(findUnscoped(rule, '', false, [], SERVICE_ONLY).length, 1, 'design B: admin is a tenant role')
  const scoped = { $and: [{ 'data.tenant_id': '{{user.data.tenant_id}}' }, rule] }
  assert.equal(findUnscoped(scoped, '', false, [], SERVICE_ONLY).length, 0)
})

test('a delegated field may be locked to a tenant role, but only scoped to the tenant', () => {
  const scopedLock = { $and: [{ 'data.tenant_id': '{{user.data.tenant_id}}' }, { $or: [{ user_condition: { role: 'owner' } }] }] }
  const bareLock = { $or: [{ user_condition: { role: 'owner' } }] }
  const opts = { platform: SERVICE_ONLY, delegated: new Set(['owner_group_id']) }
  assert.deepEqual(unlockedUserFields(new Set(['owner_group_id']), { properties: { owner_group_id: { rls: { write: scopedLock } } } }, opts), [])
  assert.deepEqual(unlockedUserFields(new Set(['owner_group_id']), { properties: { owner_group_id: { rls: { write: bareLock } } } }, opts), ['owner_group_id'])
  // Not delegated: a tenant-scoped role lock still fails — tenant pointers need the platform tier.
  assert.deepEqual(unlockedUserFields(new Set(['tenant_id']), { properties: { tenant_id: { rls: { write: scopedLock } } } }, opts), ['tenant_id'])
})

import { setTenantKeys, DEFAULT_TENANT_KEYS } from './check-tenant-roles.mjs'

test('only a tenant key scopes a rule: a shared value like status matches every tenant', () => {
  const role = { user_condition: { role: 'owner' } }
  const byStatus = { $and: [{ 'data.status': '{{user.data.status}}' }, role] }
  const byTenant = { $and: [{ 'data.tenant_id': '{{user.data.tenant_id}}' }, role] }
  const bySelf = { $and: [{ created_by_id: '{{user.id}}' }, role] }
  assert.equal(findUnscoped(byStatus).length, 1)
  assert.equal(findUnscoped(byTenant).length, 0)
  assert.equal(findUnscoped(bySelf).length, 0)
  // An app whose tenant key isn't in the defaults declares it.
  const byClinic = { $and: [{ 'data.clinic_id': '{{user.data.clinic_id}}' }, role] }
  assert.equal(findUnscoped(byClinic).length, 1)
  setTenantKeys([...DEFAULT_TENANT_KEYS, 'clinic_id'])
  assert.equal(findUnscoped(byClinic).length, 0)
  setTenantKeys(DEFAULT_TENANT_KEYS)
})

test('a positional grant of built-in admin is caught, not just role: "admin"', () => {
  assert.equal(findAdminAssignments("await base44.users.inviteUser(email, 'admin')").length, 1)
  assert.equal(findAdminAssignments("await base44.users.inviteUser(email, 'user')").length, 0)
})
