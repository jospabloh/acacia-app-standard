# `privacy/data-inventory.json` — draft schema

**Status: draft, not normative.** Module 28's rule 1 states seven requirements
an inventory must meet. This file is one way to meet them, and
[`data-inventory.example.json`](data-inventory.example.json) is an instance of
it. No app has run a checker built on it against a deployed schema. When one
does, and its CI is green, this shape moves into `STANDARD.md`; until then an
app may change the shape and must keep the requirements. Open questions are at
the end, on purpose: do not close one by guessing.

## Principles the shape follows

- **One fact, one place.** Purposes, recipients and titulares are registries,
  referenced by id. Nothing derivable is stored: which consent boxes a form
  shows, and whether a transfer needs acceptance, are computed.
- **Everything the notice prints is in Spanish in the file** (`label`,
  `does`, `retention`, `deletion`). Ids, paths and keys are never printed.
- **A copy states its own lifecycle.** Where data goes is declared on the
  copy (a `holds` item in a store), never as a list on the entity.

## Top level

| key | what it is |
|---|---|
| `notice_version` | an integer, incremented by hand when CI says the notice text changed |
| `notice_hash` | hash of the generator's whole output (every notice, integral and simplified); CI recomputes it and fails if it differs, or if it differs from `main` while `notice_version` does not |
| `platform_fields` | personal fields the platform adds to **every** entity, described once and in full: `created_by` is the email of the account that created the row. Each has `label`, `category`, `titular`, `minors`, `acacia_role`, `purposes`, `retention`, `deletion` and `derived_from`; these are its own and are never taken from the entity it sits on (`created_by` on a tenant's `Client` row is still an account user's email, with ACACIA as responsable). They apply to every entity, including those under `no_personal_data`, and the notice prints them once |
| `titulares` | id → `label` |
| `purposes` | id → `label`, `requires_consent`, optional `automated_decision` |
| `recipients` | id → `label`, `role` (`encargado` \| `third_party`), `does`, `country`; a `third_party` also has `legal_basis`: the art. 36 fraction a lawyer confirmed, or `null`. Acceptance is required exactly when it is `null` |
| `entities` | every entity that holds personal data |
| `no_personal_data` | every other entity, mapped to the list of its fields. It means "nothing personal beyond `platform_fields`", never "nothing personal": the creator's email is on these rows too, and deleting an account anonymizes it there as everywhere else |
| `collection_points` | every way personal data enters |
| `stores` | every place personal data is kept outside an entity |

## `entities.<Entity>`

- `titular` (id), `minors` (may this person be under 18), `acacia_role`
  (`responsable` \| `encargado`).
- `fields`: each personal field with `label` and `category`
  (`identification` \| `contact` \| `fiscal` \| `financial` \| `location` \|
  `sensitive` \| `credentials`). A field the app produces itself has
  `"origin": "derived"` and `derived_from` (a field reference); it is in the
  notice and in deletion, and no form collects it.
- `non_personal_fields`: every other field. Together with `fields` and
  `platform_fields` it must equal the entity's deployed fields.
- `purposes`: ids. `retention` and `deletion`: for the entity's own rows in
  the app's database.

## `collection_points[]`

`id`, `kind` (`signup` \| `login` \| `form` \| `public_form` \| `import` \|
`api` \| `inbound_message`), `path`, `handler` (`function#action`, or
`platform:auth` when the platform's own signup receives the data),
`filled_by` (`titular` \| `representative` \| `tenant_staff` \| `system`),
`collects` (`Entity.field`, or `store:<key>` for data that only lands in a
store), `purposes` (ids, each one a purpose of what it collects), `notice`
(`acacia` \| `tenant`).

A simplified notice and a `ConsentRecord` exist where `filled_by` is
`titular` or `representative`. A point filled in by staff or by a system
serves no optional purpose, and has `"notice_to_titular"`: `attested` or
`sent` (Module 28, rule 3). A point that collects a `sensitive` field has
`"authenticated": true` (a signed-in user, a confirmed code, or a signature);
a `public_form` without it that collects one is an error.

## `stores.<key>`

Seven fixed keys: `auth_and_sessions`, `files`, `logs`, `analytics`,
`browser_storage`, `outbound_messages`, `mission_control`. Each has:

- `producers`: the files that write to it through its one module, or
  `["platform"]` when the platform writes it with no app code.
- `non_personal_keys`: payload keys allowed that carry no personal data. The
  module's redactor runs over their values.
- `holds`: each item is either
  - a copy of an entity field — `ref`, `key` (the property it travels under),
    `recipient`, and the copy's own `retention` and `deletion`; what the datum
    is and whose comes from the field — or
  - data that exists nowhere else — `keys`, `label`, `category`, `titular`,
    `minors`, `acacia_role`, `purposes`, `recipient`, `retention`, `deletion`,
    and `written_by`: the handlers (`function#action`) that put it there, or
    `["platform"]`.

An app's own `Session` entity (Module 20) is an entity, not this store;
`auth_and_sessions` is for what the platform's auth holds.

## Checks a checker built on this would run

1. Every deployed entity is in `entities` or `no_personal_data`; every
   deployed field is in `fields`, `non_personal_fields`, `platform_fields` or
   the entity's list under `no_personal_data`.
2. Every id resolves: titulares, purposes, recipients, `ref`, `collects`,
   `derived_from`.
3. Every collected field is collected by at least one point; no derived field
   is; a point's purposes are purposes of what it collects.
4. Every deployed entity is closed to client writes, the ones under
   `no_personal_data` included: Module 3 already requires it of all of them,
   and with `platform_fields` every row carries a person's email.
5. The set of functions and router actions with non-empty `ingress` equals
   the set of handlers that collect an entity field, and each one's `ingress`
   equals the entity fields in its point's `collects` (`platform:auth`
   excepted: it is not app code). Store-only data arrives in headers, not in
   the request body, so it is matched the other way: every handler named in a
   `written_by` is the handler of a collection point that collects that
   `store:<key>`, and every point that collects `store:<key>` is named in a
   `written_by` there. `["platform"]` is exempt from both.
6. Every function, and on a router every action, whose `acts_on` names a
   purpose with `requires_consent` or `automated_decision`, or a transfer to
   a recipient with `legal_basis: null`, or that reads a field of category
   `financial` or `sensitive`, calls the consent helper. That the
   handler then *obeys* the answer is not something a static check can see;
   the verification gate tests it at runtime, for optional purposes,
   transfers and objections to automated decisions alike.
7. Lint: no raw write to a store outside its module. Test: an undeclared key
   and a personal-looking value under a non-personal key both throw.
8. `notice_hash` equals the hash of the generator's output; if it differs
   from `main`, so does `notice_version`.
9. Every recipient declared holds something.

The example passes 2, 3 and 9 and the parts of 1 that need no deployed
schema; nothing has run the rest.

## Open questions

Each of these came out of review and none can be settled without building it.

- **One box or two.** In the example the insurer receives a name only to
  serve one optional purpose, so the purpose and the transfer are the same
  decision asked twice. Whether one box can record both is a legal question.
- **Purposes at the entity's grain.** Purposes are listed per entity, so the
  notice says every field of `Client` may be used for marketing, including
  the RFC. Per-field purposes would be exact and much longer.
- **`acts_on` has no second source.** `ingress` is derived from a request
  schema; `acts_on` is typed by hand, and a function that sends marketing and
  declares nothing passes.
- **Keys inside provider payloads.** `key` is a property path in *our* call
  to the provider. Whether the allowlist can be enforced on nested template
  parameters depends on each provider's SDK.
- **Consent across versions.** Rule 4 says prior choices carry over unless
  the purpose's printed text changed. Detecting "text changed" per purpose
  from a hash of the whole output needs a per-purpose hash as well.
- **The tenant's notice.** It has its own version on the tenant. Where a
  tenant replaced the generated text, the gate has nothing to diff against.
- **Staff-entered consent.** `basis: tenant_attestation` is recorded on the
  person; its shape and who may write it are undecided.
- **Mission Control.** Deleting from the bodega, the `arco` category and the
  public intake with tenant routing do not exist there yet.
- **Platform-written logs.** Declared as `producers: ["platform"]`; whether
  the platform's log retention is really what the file says has to be read
  from the platform, not asserted.
- **The served-notice diff spans two repos.** The app generates the integral
  page and `acaciaco-site` serves it; nothing yet stops the app deploying
  version N+1 while the site serves N.
