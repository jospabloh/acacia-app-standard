# shared/privacy — Module 28

Templates for [Module 28](../../STANDARD.md#28-personal-data--the-privacy-notice-describes-the-app-that-is-actually-deployed).
There is no checker and no generator here yet: the first app that writes
them contributes them back, and that is when the draft schema becomes part of
the standard.

| file | what it is | where it goes |
|---|---|---|
| [`SCHEMA.md`](SCHEMA.md) | **draft** shape of the inventory, the checks it is meant to support, and its open questions | read it; it is not normative |
| [`data-inventory.example.json`](data-inventory.example.json) | an instance of that draft | the app repo, as `privacy/data-inventory.json` |
| [`AVISO_TEMPLATE.md`](AVISO_TEMPLATE.md) | skeleton of the integral and simplified notices, in Spanish, saying where each section's content comes from | the generator's template; output goes to `acaciaco-site/legal/privacidad/<slug>.html` and next to each form |

## Order of work

1. Write the inventory from the **deployed** schema (`list_entity_schemas`),
   not from the repo files. Then fill the `stores`: they hold personal data
   no schema lists.
2. For each entity decide `acacia_role`. If any is `encargado`, the tenant
   terms need the data-processing clause (Module 28, rule 2). List every
   collection point.
3. Write the generator that fills the template from the inventory, and keep
   the fixed text (identity, address, ARCO procedure) in its own file. Every
   `[…]` is a decision; none may reach production, and nobody edits the
   generated notice by hand.
4. A lawyer admitted in Mexico reviews the result. Name them in the PR.
5. Publish, then run Module 28's verification gate.

## What the templates are not

They are a structure that matches art. 15 and 16 of the LFPDPPP published in
the DOF on 2025-03-20, as read on 2026-10-07. They are not legal advice and
they are not a notice. Re-read the law and check whether a new Reglamento has
been published before relying on any deadline written here.
