# Beauty Guild | MTA, upgrade and cancellation build scope

**Status:** internal build scoping, for A2Z Cloud review. Not a commitment, estimate or approved change request.
**Version:** 0.1 | 24 October 2026
**Inputs:** [Customer portal MTA spec v0.2](../../requirements/mta/customer-portal-functional-spec.md), [MTA requirements](../../requirements/mta/README.md) (scaffold branch), [MTA API contract](../api-contracts/mta.md) (scaffold branch), Staff Workspace V2 functional spec, Portal V2 main at PR #60, signed SoW 5017 V5.

## 1. Foundation

### Where we are

- Portal V2 sells new membership, insurance and accreditation through Catalyst, Stripe Checkout and Creator. CRM holds the records.
- Fixed prices come from Books via Stripe price IDs. Insurance premiums are calculated in `insurance.js`.
- There is no MTA, upgrade-with-credit or cancellation code on any branch. The MTA Management widget is a placeholder.
- The Guild has now supplied the MTA workbook, the Cancellations pack, all policy wordings and sample documents. Final customer pricing is being entered in Books.

### What this means for scoping

Most of the MTA build is new, but the riskiest parts already exist and are tested:
- the insurance questions and help text
- the rating tables
- the underwriting rules
- the flood, subsidence and sanctions checks
- Stripe checkout with computed lines

The new work is:
- reading a member's current cover
- pricing the difference between current and proposed cover over the remaining term
- recording revisions
- handling credits
- producing revision documents

### Contract position

MTAs, the Associate upgrade with credit, and cancellation processing are not named in SoW 5017 V5:
- Section 13.4 centres Phase 1 finance on new insurance and new accreditation journeys.
- Cancellations appear only as payment visibility in Creator.
- The Portal V2 requirements baseline lists insurance MTAs as a separate workstream until scoped.

This scope should therefore be treated as a **change request** candidate. Effort below is given as complexity and drivers only. Hours are for the pre-sales lead to set, following the A2Z RoM rules (QA, UAT, go-live and PM as separate lines).

## 2. Intent

Deliver, in releasable phases:
1. Members can see their current cover and change history in the portal.
2. Members can buy membership items and pro-rated branches mid-term.
3. Members can make payable insurance changes online (add or upgrade cover, add or swap people) with correct pro-rata pricing, IPT, fee, declarations and documents.
4. Associate members can upgrade to Full membership with insurance, paying the net price.
5. Guild staff can process refunds, removals, downgrades, fee waivers, cancellations and Salon/Non-Salon replacements in CRM, using the same pricing engine.
6. Every revision produces the correct letter, schedule and email, and appears in the member's history.

Out of this scope: renewals redesign, monthly-payer rules beyond what MTA-D17 decides, GTi courses, bulk historic migration of past revisions.

## 3. Views

### Architecture principle

There is **one MTA engine**, in the existing Catalyst function `beauty_guild_api`, used by both the portal and the CRM MTA widget. This matches the Staff Workspace spec rule that there is no second pricing engine. The engine:
1. reads current cover from CRM
2. rates current and proposed cover with the existing `calculateQuote`
3. pro-rates the difference in integer pence
4. adds IPT and the fee, applies the rules and risk checks
5. returns a versioned quote that expires

The engine owns the price. Neither the browser nor the widget submits amounts.

```
Portal (member)      CRM MTA widget (staff)
      \                     /
   /portal/mta/*      /staff/mta/*   (separate auth, same domain code)
            \           /
        MTA engine (context, quote, revision, apply)
         |        |          |            |
       CRM     Stripe     Creator     WorkDrive / Writer
   (records)  (checkout)  (webhook,   (documents)
                           Books)
```

### Key design choices

| Topic | Recommendation | Why |
| --- | --- | --- |
| Revision record | One Policy_Revisions record per change, holding the quote snapshot, money columns and status; changed cover rows link to it | Matches the CRM snapshot (Change_Type, Change_Scope exist) and gives history for the portal |
| Cover history | Never edit a cover row in place. End-date the old Insurance_Extension or Insured_People row and create a new row linked to the revision | Schedules must show the revised position and history must survive |
| Effective dating | Apply at payment if the effective date is today; otherwise schedule. A daily Catalyst cron activates scheduled revisions | Future-dated changes must not show as active early |
| Pro-rata | One function, integer pence, day basis and rounding from config | MTA-D03 is not yet signed off; a config value avoids rework |
| Credits in checkout | Stripe customer balance (or one-off coupon) for the Associate refund and replacement refunds; Books credit note against the original invoice | Checkout cannot take negative lines |
| Refunds | Staff only: Stripe refund plus Books credit note, recorded on the revision | Matches the workbook and the "CRM is not the finance authority" rule in the SoW |
| Documents | Zoho Writer merge templates driven from the revision; files stored in a per-revision WorkDrive folder under the policy; email sent with attachments chosen by cover from the links workbook | Reuses the existing WorkDrive document proxy for the portal history |
| Monthly payers | Block online MTAs for monthly payers until MTA-D17 is decided; show call the office | Avoids building rules nobody has agreed |

## 4. Effort: work packages

Complexity: **L** low, **M** medium, **H** high. Hours are left blank for the pre-sales lead.

| WP | Work package | Contents | Depends on | Complexity | Main drivers | Hours |
| --- | --- | --- | --- | --- | --- | --- |
| WP0 | Decisions and sign-off | Close MTA-D01, D03, D04, D12 to D17 and D19 with the Guild and Hiscox; worked examples signed off as test data | Guild | L (A2Z), customer-dependent | Turnaround from Guild and insurer | |
| WP1 | CRM data model | Policy_Revisions fields (fee, waiver, waiver reason and user, amount paid to date, endorsement or refund amount, revised total, effective date, status, quote snapshot, document status); revision lookup and effective from/to on Insurance_Extension, Insured_People, Insured_Premises, Declarations, Membership_Extension; bordereau cancellation reason values; Contact field history tracking; Deal handling for upgrade and downgrade | WP0 for picklists | M | Live metadata check, Blueprint and workflow side effects (INS Policy Activation fires on Payment_Status) | |
| WP2 | MTA engine: context and quote | Current cover read; delta rating via calculateQuote; pro-rata; IPT; fee rules; rules and risk checks reuse; per-scenario eligibility (self-service, refer, stop); one effective date; end date fixed to policy end; quote version and expiry; unit tests against the sample letters | WP0 (rates and basis), WP1 | H | Number of scenarios (about 25 rows in the matrix), swap netting, Salon turnover band changes, exactness to the penny | |
| WP3 | MTA engine: revisions and apply | Create and update revision drafts; idempotent apply that end-dates old rows and creates new ones; scheduled activation cron; replacement policy creation for Salon/Non-Salon | WP1, WP2 | H | Exactly-once application, interaction with existing CRM workflows | |
| WP4 | Payments and finance | New checkout services (mta, branch_midterm, upgrade_full); fee line; customer balance or coupon credits; Creator webhook branches; Books items (GBP 5 fee, GBP 10 cancellation fee, GBP 10 duplicate documents, employee membership if MTA-D15 requires it); Books invoices for MTAs and credit notes for refunds | WP2, WP3, Creator and Books owners | H | Creator webhook changes, Books credit notes, Stripe credit mechanics | |
| WP5 | Portal: cover summary and history | Membership card statements and actions; current cover summary with Edit and Add; change history tab with documents | WP2 (context read) | M | New read endpoint, prefilled display of every cover type | |
| WP6 | Portal: membership-only changes | Mid-term pro-rated branch; items (existing service); cross-sell basket; Adjustment Letter on fulfilment | WP2, WP4, WP8 | L to M | Mostly reuse; branch pro-rata is new | |
| WP7 | Portal: insurance changes | Edit mode for InsuranceFields with prefill; people add and payable swap; treatments; teaching; Business Equipment and EL upgrades; Salon covers and turnover increase; premises address with risk checks; effective date; repeat declarations; review with credits, IPT and fee; checkout; call-the-office pop-ups | WP2, WP3, WP4 | H | Breadth of scenarios across two routes, keeping new-business behaviour unchanged | |
| WP8 | Documents and email | Writer templates: Membership Adjustment Letter, Endorsement Schedule, Cancellation Letter B (with membership refund line), Letter D, Cancellation Schedule C; Adjustment Receipt and Cancellation Receipt emails; attachment selection by cover; per-revision WorkDrive folders; policy wording links in the portal (POLICY_WORDING and legal.js, plus General Terms and Conditions and Property Definitions entries) | WP1, WP3 | M to H | Schedule carries the full previous cover; cumulative amounts | |
| WP9 | Associate upgrade | Upgrade button and Get a quote path; Full membership plus insurance plus Associate credit in one checkout; Associate continues until the start date; Deal changes; CRM-side upgrade action | WP2, WP4, MTA-D16 | M | Credit mechanics, two Deals and their dates | |
| WP10 | CRM MTA widget (staff) | Staff context from the Staff Workspace; same quote screens; refund, removal, downgrade and swap-with-credit flows; fee waiver with reason; cancellations (Associate, Full, cooling off, downgrade to Associate); Salon/Non-Salon replacement; Letter D selection | WP2, WP3, WP4, WP8 | H | Staff authorisation adapter, refund execution, all cancellation variants | |
| WP11 | Contact details | Phone and email change in the portal; email change updates Catalyst and CRM together with re-verification; CRM audit | Catalyst auth | M | Login change without losing record access | |
| WP12 | Test and UAT support | Scenario tests from spec section 17 and the scaffold UAT plan; sample-letter reconciliation; staff and member UAT rounds through the UAT action log | All | M | Scenario count, insurer sign-off of outputs | |

Quick wins that do not wait for the MTA build:
- policy wording links (WP8 part)
- Books fee items (WP4 part)
- the Advanced Electrolysis rate once MTA-D12 is answered

## 5. Path Forward

### Suggested build order

| Release | Contents | Can start | Gate to release |
| --- | --- | --- | --- |
| R0 | Policy wording links; Books fee items; rating fixes from MTA-D12, D13, D15 | Now (links), on answers (rates) | Guild confirms rates |
| R1 | WP1, WP2 read-only context, WP5 summary and history | WP1 metadata check now | Live CRM fields verified |
| R2 | WP6 membership-only changes, plus the WP4 and WP8 pieces they need | After R1 | Adjustment Letter template approved |
| R3 | WP2 quote, WP3, WP4, WP7 payable insurance changes, WP8 schedules | After WP0 rates and basis | Sample letters reproduced to the penny; insurer sign-off |
| R4 | WP9 Associate upgrade | After R3 payments | MTA-D16 |
| R5 | WP10 staff widget: refunds, waivers, cancellations, replacements | After R3 | MTA-D04 resolved |
| R6 | WP11 contact details; WP12 full UAT and hardening | Parallel from R2 | UAT sign-off |

The staff widget could be started before the portal journeys if the Guild would rather process MTAs in CRM first. The engine is shared, so changing the order does not create rework.

### Next actions

1. Send the Guild the decision list (spec section 18): D12, D13, D15 first because they affect what goes into Books now.
2. Pre-sales lead to set hours per work package and decide on the change request route.
3. Run a live CRM metadata check on Policy_Revisions and the cover modules (WP1) to confirm the field list before design sign-off.
4. Confirm with the Creator and Books owners how MTA invoices, credit notes and the new webhook types fit the current Creator flow.

### Risks

- Pricing conflicts unresolved when Books is finalised, which would make new business and MTAs disagree.
- Existing CRM workflows (for example INS Policy Activation on Payment_Status) firing on revision payments and activating cover early.
- Insurer sign-off of pro-rata and refund rules arriving late, which blocks R3 and R5.
- Monthly payers asking for MTAs before MTA-D17 is decided.
