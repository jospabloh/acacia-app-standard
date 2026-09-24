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
