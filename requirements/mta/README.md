# Beauty Guild | Mid-Term Adjustment requirements

**Status:** consolidated **working scope**, not a newly signed-off business specification.
**Implementation location:** [CRM MTA widget](../../widgets/crm/mta-management/README.md).
**Backend interface proposal:** [MTA API contract](../../docs/api-contracts/mta.md).

## Source register (review inputs, not committed)

- MTA's.xlsx: scenario matrix across Associate, Non-Salon and Salon membership/insurance adjustments, eligibility, fees, effective dates, refunds and declarations.
- Membership Adjustment Letter.pdf: sample itemised adjustment confirmation and total due.
- Guild Membership Insurance Adjustment Receipt.msg: sample communication and attached insurance/member documents.
- Endorsement Schedule.pdf: sample previous premium, endorsement amount, revised total and policy wording schedule.
- CRM Cartographer JSON snapshot: observed CRM modules/fields/relationships, not a live schema guarantee.
- A2Z-Cloud/beauty-guild-catalyst (Portal V1): existing quote, insurance, add-on, Stripe and CRM API code to reuse/reconcile.

**Do not commit real member names, addresses, policy numbers, emails, attachments or unapproved insurer wordings.** The originals must remain in approved customer/project document storage; add authorised source links here when available.

## Requirement areas from the earlier review

1. Membership amendments: additional branches, certificates, badges, stickers, bundles and membership-level changes.
2. Insurance adjustments: named people, treatment extensions, teaching, turnover/wage roll, business equipment and property/liability cover.
3. Eligibility: staff-enabled actions versus genuinely portal-self-service actions, with stop/referral paths.
4. A common MTA effective date for related insurance changes, with correct treatment of annual versus prorated charges.
5. Insurance Premium Tax, adjustment fee (normally GBP 5 in earlier examples), permitted exemptions/waivers and credits/refunds.
6. Repeat/updated underwriting declarations where required, captured as auditable evidence.
7. Policy replacements/cancellations rather than in-place edits for product-route changes such as Salon/Non-Salon.
8. Versioned documents, email dispatch, renewal/term integrity, payment and full change history.
9. One authoritative service used by CRM widget and eventual Portal V2 journey.
10. Only apply changes after appropriate approval/settlement and the requested effective date.

## Decisions required before implementation

| ID | Decision / gap | Owner / status |
| --- | --- | --- |
| D01 | Sign off exact MTA eligibility matrix, especially portal versus staff, and which changes require referral | Guild, open |
| D02 | Approve proration basis, calendar-day treatment, rounding and term boundaries | Guild/Finance/Insurer, open |
| D03 | Reconcile small-transaction examples with insurer schedule's GBP 30 minimum change rule (excl. IPT) | Guild/Insurer, open |
| D04 | Confirm GBP 5 fee, exemption cases and whether "less GBP 5" wording means charged or deducted | Guild/Finance, open |
| D05 | Approve refunds/credit notes and named-person swaps with net credit | Guild/Finance, open |
| D06 | Confirm cancellation/replacement formula, refunds and continuity for Salon versus Non-Salon changes | Guild/Insurer, open |
| D07 | Approve underwriting declarations, stop/refer and staff override permissions | Guild/Insurer, open |
| D08 | Confirm approved insurer document templates and versioned attachment requirements | Guild/Insurer, open |
| D09 | Verify live Policy_Revisions fields, link to membership-only transactions and Creator webhooks | CRM/Backend owner, open |
| D10 | Confirm authoritative payment, Books invoice/credit and WorkDrive document flow | Backend/Finance owner, open |
| D11 | Confirm portal deep links, Staff Workspace entry and return navigation | Portal/CRM team, open |

## Scope boundary

Creating this folder authorises **documentation and widget scaffolding only**. It does not approve CRM field additions, pricing rules, MTA processing, customer-facing payments, production release, or expanded Portal V2 scope. A specific design/requirements approval is needed for each implementation phase.
