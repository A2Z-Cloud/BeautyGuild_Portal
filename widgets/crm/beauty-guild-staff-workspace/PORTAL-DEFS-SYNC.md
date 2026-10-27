# Keeping the widget's journey logic in step with Portal V2

**Status:** rule and plan for approval, written 27 October 2026. The drift described below already exists.
**Related:** [V1.2-IMPLEMENTATION-NOTES.md](V1.2-IMPLEMENTATION-NOTES.md) ("Update discipline"), [STAFF-API-AND-IDENTITY.md](STAFF-API-AND-IDENTITY.md).

## 1. The problem

The widget lets staff fill in the same Membership, Insurance and Accreditation questions as customers. To do that without rewriting the rules, it carries **copies** of Portal V2 source files in `app/portal-defs/` (`insuranceInputs.js`, `accreditationInputs.js`, `logic.mjs`, `phones.js`, `startDate.js`, `legal.js`), and a hand-written Membership descriptor in `app/v12-journeys.mjs`.

A copy goes stale as soon as the portal changes. This one already has:

| File | State on 27 October 2026 |
| --- | --- |
| `accreditationInputs.js`, `logic.mjs`, `phones.js`, `startDate.js`, `legal.js` | Identical to `apps/portal/src` on `main` |
| `insuranceInputs.js` | **Differs.** `main` has the Salon rule the Guild confirmed on 26 October: Money, Buildings, Business Interruption and Property Away cover are only offered with Contents cover (`salonAnd('insContents')`, and a `contentsOff` helper that takes them off when Contents is removed). The widget still shows them to every salon |
| Membership descriptor in `v12-journeys.mjs` | Written by hand. It hard-codes the membership levels, the four branches and the add-on list and limits (0 to 10). The implementation notes already say it "must be kept aligned" with `BuyMembership.jsx` |

**Effect:** a staff member building a salon insurance application can currently answer questions a customer would not be asked, and the staff and customer journeys can disagree. The spec's architecture rule is one set of journey rules for staff and customers.

## 2. The rule

1. `apps/portal/src` is the **only** source of journey rules. Nobody edits `app/portal-defs/` by hand.
2. Every file in `app/portal-defs/` carries a header: `GENERATED from apps/portal/src/<file> at <commit>. Do not edit.`
3. The widget **fails its checks** if any copied file differs from its source on the branch it is built from.
4. A change to journey rules in the portal is not finished until the widget copy is refreshed, or the difference is recorded as a known, dated exception.

## 3. Proposed mechanism (interim)

Until the staff API can serve the questions (section 4):

- A script in the widget folder (for example `npm run sync:portal-defs`) copies the listed files from `apps/portal/src`, adds the header and writes a small manifest of source file names and hashes.
- A test in the widget's tests compares each copy with its source and fails on any difference. It runs in the repository's CI for pull requests that touch either side.
- The Slate branch regularly merges `main` so the sources are current. Weekly is a sensible minimum, and always before a staff UAT round.
- The Membership descriptor is replaced by an import of a shared module extracted from `BuyMembership.jsx` (levels, branches, add-ons, limits), so there is one list.

## 4. Proposed end state

The widget stops carrying rules at all. The staff API serves the journey definition and validation for a given kind (for example `GET /staff/journeys/:kind`), and the same server code that prices and assesses also validates the answers. Then:

- a rule change is made once, in the portal function;
- the widget cannot show a question the server would not accept;
- the copied folder, the script and the drift test are deleted.

This depends on the staff API, so the interim mechanism is needed first.

## 5. Acceptance tests

| ID | Scenario | Expected |
| --- | --- | --- |
| PD-01 | A copied file differs from its source | The check fails and names the file |
| PD-02 | The sync script runs on a clean tree | No changes, and the check passes |
| PD-03 | A salon answers No to Contents cover | Money, Buildings, Business Interruption and Property Away are not offered, matching the portal |
| PD-04 | A new membership level or add-on is added in the portal | The widget shows it after the shared module is updated, with no separate edit |
| PD-05 | The widget header is removed from a copy | The check fails |

## 6. Open decisions

1. Who owns the weekly merge from `main` into the Slate branch.
2. Whether CI for the widget runs in this repository or elsewhere (the Slate branch is deployed without a build step today).
3. When the staff API route for journey definitions is built, which ends this document.
