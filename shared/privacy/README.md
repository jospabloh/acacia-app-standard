# shared/privacy — Module 27

Templates for [Module 27](../../STANDARD.md#27-personal-data--the-privacy-notice-describes-the-app-that-is-actually-deployed).
There is no checker here yet: the first app that writes the inventory check
contributes it back.

| file | what it is | where it goes |
|---|---|---|
| [`data-inventory.example.json`](data-inventory.example.json) | the shape of the inventory | the app repo, as `privacy/data-inventory.json` |
| [`AVISO_TEMPLATE.md`](AVISO_TEMPLATE.md) | skeleton of the integral and simplified notices, in Spanish | integral: `acaciaco-site/legal/privacidad/<slug>.html`; simplified: next to every form in the app |

## Order of work

1. Write the inventory from the **deployed** schema (`list_entity_schemas`),
   not from the repo files. Then fill the six `stores`: they hold personal
   data no schema lists.
2. For each entity decide `acacia_role`. If any is `encargado`, the tenant
   terms need the data-processing clause (Module 27, rule 2).
3. Fill the template from the inventory. Every `[…]` is a decision; none may
   reach production.
4. A lawyer admitted in Mexico reviews the result. Name them in the PR.
5. Publish, then run Module 27's verification gate.

## What the templates are not

They are a structure that matches art. 15 and 16 of the LFPDPPP published in
the DOF on 2025-03-20, as read on 2026-10-07. They are not legal advice and
they are not a notice. Re-read the law and check whether a new Reglamento has
been published before relying on any deadline written here.
