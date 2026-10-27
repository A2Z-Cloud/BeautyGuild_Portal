# Staff-assisted mid-term adjustments (future build notes)

**Status:** not in scope for the V1.2 widget or the current staff API. This note records how it should be built later, so the widget and the staff API can pick it up without redesign. Nothing here is built, approved or tested.
**Related:** [SPECIFICATION.md](SPECIFICATION.md) section 5.8 (what staff see today, read only), [V1.2-BUILD-BRIEF.md](V1.2-BUILD-BRIEF.md) section 5.1 (staff API), `requirements/mta/customer-portal-functional-spec.md`, `docs/delivery/mta-r3-plan.md`, `docs/api-contracts/pricing-payments.md`.

## 1. What this adds

A staff member, acting for a selected customer, can quote and save a mid-term change to a policy (and later a membership), and send the customer a payment link. It is the same journey the customer has in Portal V2, run by staff. Until it exists, staff handle changes in native CRM and the customer uses the portal.

Not in this note: applying a paid revision (Creator payments app), documents, emails and the bordereau (CRM and Creator), and cancellations.

## 2. What already exists to reuse (Portal V2 function, off by default)

Do not clone this logic into the widget or the staff routes. Extract it into shared modules, as the staff brief already requires for pricing and risk.

| Module in `apps/portal/functions/beauty_guild_api/src` | Reuse for staff |
| --- | --- |
| `cover.js` `loadCover` | Current cover for a selected Contact and Deal (it checks the Deal belongs to the Contact it is given) |
| `insuranceChange.js` `cleanChange`, `quoteChange`, `quoteBasket` | Side-effect free quote of one change or a basket of dated changes. Returns payable or referred, with reasons |
| `insuranceRevisions.js` `saveRevision`, `markAwaitingPayment` | Writes the Policy_Revisions header and Draft rows, then marks Awaiting Payment with the session id |
| `prorata.js` | Pro-rata days and rounding (remaining days over days on the policy, both end days counted, IPT 12% once on the net) |
| `catalogue.js` `membershipChangeOptions`, `membershipForChange` | Membership branch and flat-item options and pricing |
| `checkout.js` | Stripe Checkout Session creation with inline pro-rata lines and `FEE-MTA` |

The customer routes today are `POST /insurance-change/revision`, `POST /membership-options` and the checkout route. They identify the Contact from the signed-in Catalyst customer, so they cannot take a staff-supplied Contact ID. As with new business, a separate staff route must resolve the Contact on the server.

## 3. Proposed staff API (illustrative, follows V1.2 section 5.1)

| Route | Method | Purpose |
| --- | --- | --- |
| `/staff/policies/:policyId/cover` | GET | Current cover, people, premises, revisions (read only; also feeds the 5.8 Changes group) |
| `/staff/policies/:policyId/changes/quote` | POST | Quote one change or a basket of dated changes. **No CRM writes, no Stripe.** Same result shape as the portal quote |
| `/staff/policies/:policyId/changes` | POST | Save the quoted basket as revisions (Quoted, or Under Review if referred). Idempotent on the quote id |
| `/staff/policies/:policyId/changes/payment-link` | POST | Create or resume the Checkout Session, mark each revision Awaiting Payment, return a link for the customer. **Only after Creator readiness and explicit approval** |
| `/staff/memberships/:dealId/options` | GET/POST | Membership change options and quote |
| `/staff/revisions/:id` | GET | One revision with its draft rows and Request_Details |

Rules carried over from the portal and the V1.2 brief:
- Authenticate the real staff identity and role on the server, through the CRM-side function or Connection. Check that the selected Contact owns the policy, never trust a client-supplied ID.
- A quote must stay side-effect free. Never reuse the customer checkout route for a staff quote.
- Return the quote the server computes. The widget never prices, never rates and never decides eligibility.
- Rate limit repeated quotes, and keep the previous result if a newer one errors.

## 4. Safety rules that must hold for staff as well

- **Live cover is never edited.** Everything written is new, Status Draft, linked to the revision, dated from the effective date to the policy end. Replaced rows and people are listed in `Request_Details.endings` and ended by Creator after verified payment.
- **Draft records must not trigger policy activation** or alter the existing active cover. Check the INS workflows against draft rows first (gate in `mta-r3-plan.md`).
- **Staff never set Approved, Scheduled or Applied, and never mark a revision paid.** Payment is the verified Stripe webhook handled by Creator (INS-G07).
- **Eligibility is server side.** Payment_Frequency Annual proceeds. Monthly or unknown is saved and referred. Employers' Liability changes, increases on policies without a stored Sum_Insured, and new equipment needing premises details go to the office.
- Only one change in flight per policy (Awaiting Payment, Approved or Scheduled blocks another). The same quote id returns the same revision.
- Up to three dated revisions in one basket, one checkout, one £5 `FEE-MTA` per effective date.

## 5. Staff identity, declarations and audit

- Record the staff user on each revision separately from the customer. This needs a field or a note on Policy_Revisions (for example `Requested_By_Staff`, name to be agreed), not yet created.
- The portal's repeated declarations are customer confirmations. For a staff-entered change, store them as **staff-attested** or send the link for the customer to confirm, matching the existing rule in SPECIFICATION.md section 6.3 and acceptance A14. Do not mark staff entries as customer-confirmed.
- Use the revision name prefix `MTA` as the portal does (`PORTAL_REVISION_NAME_PREFIX`), so staff and customer revisions share one numbering style.

## 6. Hand-off between staff and customer

- A revision saved by staff as Quoted can be paid by the customer in the portal, which resumes the open quote. A revision saved by the customer can be picked up by staff when it is Under Review.
- Treat a revision like a draft for conflicts: if the customer has changed it since staff loaded it, show a recoverable conflict, not a silent overwrite (A30).

## 7. Build order

1. Extract the quote and save logic from the Portal V2 function into shared modules with tests (no behaviour change).
2. Staff read route (cover and revisions). This also powers the section 5.8 Changes group.
3. Staff quote route and the widget quote screen (no writes).
4. Staff save route (writes), behind its own switch, after the activation check.
5. Staff payment link, after the Creator `insurance_change` handler is live and tested.
6. Membership changes for staff.

## 8. Acceptance tests to add when built

| ID | Scenario | Evidence |
| --- | --- | --- |
| SM-01 | Staff quote a change | Same total as the portal for the same inputs, no CRM or Stripe writes |
| SM-02 | Staff save a payable change | Revision Quoted, Draft rows linked, live cover untouched, no activation |
| SM-03 | Staff save a referred change | Under Review, no draft rows, reasons shown |
| SM-04 | Staff save the same quote twice | One revision |
| SM-05 | Staff create a payment link | Contact-specific session, one FEE-MTA per date, revisions Awaiting Payment with the session id, safe reuse and expiry |
| SM-06 | Customer pays a staff link | Creator applies it once; widget shows Applied only then |
| SM-07 | Customer and staff edit the same revision | Conflict shown, nothing overwritten |
| SM-08 | Staff without the role | No quote, save or link |
| SM-09 | Monthly payer, Employers' Liability change | Referred to the office, not payable |

## 9. Open decisions

- Staff-attested versus customer-confirmed declarations, and who signs off the wording (Guild and insurance).
- The staff-identity field on Policy_Revisions.
- Whether staff may waive the £5 MTA fee (the CRM has `Fee_Waived`; the portal always sets it false).
- Whether staff may quote monthly payers once the Guild defines the rules (today they are referred).
- Who owns and closes Under Review revisions in CRM.
