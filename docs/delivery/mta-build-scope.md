# Beauty Guild | MTA, upgrade and cancellation build scope

**Status:** internal build scoping, for A2Z Cloud review. Not a commitment, estimate or approved change request.
**Version:** 0.4 | 27 October 2026
**Change from 0.3:** decisions of 27 October: MTA-D22 (charge the joining fee and flat items in month 1 for monthly payers, no 12-month schedule), MTA-D24 (one checkout for several dated revisions) and MTA-D25 (a swap carries the membership fee over) are decided. Adds WP13 (month-1 charging) as a prerequisite for monthly MTAs, updates the build order and tells the Creator owner now.
**Change from 0.2:** adds the Guild's replies of 26 October (spec v0.4): the 365/366 days rule, one GBP 5 per set of regenerated documents (revisions by effective date), the swap rule, saved requests, contents before other property cover, the joining fee gap rule, monthly payers (one-off for the billing month, higher payment from next month) and online Salon/Non-Salon quotes. Adds two changes to existing journeys, new decisions D22 to D26, and a metadata contract note.
**Change from 0.1:** re-baselined on Portal V2 main (8c85ca1). Adds subscriptions (every purchase now renews, yearly or monthly) to WP2 to WP4, WP9 and WP10; replaces price IDs with lookup keys; moves Creator work to the new payments app; updates decision references (D12, D13, D15 closed, D14 and D17 partly answered, D20 and D21 added).
**Inputs:** [Customer portal MTA spec v0.5](../../requirements/mta/customer-portal-functional-spec.md), the MTA requirements README and MTA API contract (`requirements/mta/README.md` and `docs/api-contracts/mta.md`, which exist only on the scaffold branch `feature/mta-management-scaffold`, PR #3, not on this branch or main), Staff Workspace V2 functional spec, [pricing and payments](../api-contracts/pricing-payments.md), [Creator payments app](creator-payments-app.md), [Stripe metadata contract](../api-contracts/stripe-metadata.md), Portal V2 main at 8c85ca1, signed SoW 5017 V5.

## 1. Foundation

### Where we are

- Portal V2 sells new membership, insurance and accreditation through Catalyst, Stripe Checkout and Creator. CRM holds the records. A Contact is created when the member presses Pay, or when a referred or stopped insurance application is recorded.
- Fixed prices are found in Stripe by **lookup key**, which is the price list code and the Books SKU (for example `MEM-BRANCH`, `MEM-FULLNS-Y`). The portal stores no price IDs, and a price change is a new Stripe price with the same key. Insurance premiums are calculated in `insurance.js` and sent as inline lines. Every inline line carries its price list code in product metadata.
- **Everything renews.** Membership, insurance, extra branches, named employee fees and accreditation are Stripe subscriptions, yearly or monthly. A monthly plan is the yearly price plus a GBP 1.50 admin fee, divided by 12 and rounded up, with the joining fee and add-ons spread over the first 12 payments and a Stripe schedule dropping them at payment 13 (`plans.js`).
- Price list v2 (agreed with the Guild on 21 October) is built. Books has the items, including FEE-MTA (GBP 5, including VAT) and FEE-CANCEL (GBP 10, including VAT). The GBP 10 duplicate documents fee is not on the list.
- There is no MTA, upgrade-with-credit or cancellation code on any branch, and nothing changes or ends a subscription after purchase. The MTA Management widget is a placeholder.
- Creator is being rebuilt as a **new payments app** (forms Stripe Webhook Log, Invoice Records and Subscription), payments first. Mid-term changes and cancellations come afterwards.
- The Guild has supplied the MTA workbook, the Cancellations pack, all policy wordings and sample documents.

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
- **changing or ending the member's Stripe subscription** (and monthly schedule) so renewals match the revised cover
- MTA invoices, credit notes and subscription changes in the new Creator payments app
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

Out of this scope: renewals redesign (renewal charges stay as built: same amounts as year one), GTi courses, bulk historic migration of past revisions. Monthly payers are in scope once MTA-D17 and MTA-D20 are settled; until then they are blocked online (section 3).

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
       CRM     Stripe     Creator       WorkDrive / Writer
   (records)  (checkout,  (new payments  (documents)
              subscript-   app, Books)
              ions)
```

### Key design choices

| Topic | Recommendation | Why |
| --- | --- | --- |
| Revision record | One Policy_Revisions record per change, holding the quote snapshot, money columns and status; changed cover rows link to it | Matches the CRM snapshot (Change_Type, Change_Scope exist) and gives history for the portal |
| Cover history | Never edit a cover row in place. End-date the old Insurance_Extension or Insured_People row and create a new row linked to the revision | Schedules must show the revised position and history must survive |
| Effective dating | Apply at payment if the effective date is today; otherwise schedule. A daily Catalyst cron activates scheduled revisions | Future-dated changes must not show as active early |
| Pro-rata | One function, integer pence. Basis (Guild, 26 October): days remaining divided by the days on the policy (365, or 366 in a leap year), both end days counted, for charges and refunds. Premium rounded to the penny, then IPT on it (rounding order still to confirm) | Replaces the earlier 364-day assumption, which came from the old system. Same function for portal, CRM widget and documents so they agree to the penny |
| Revisions and the GBP 5 | One revision per effective date; one GBP 5 per set of regenerated documents. A basket with several dates becomes several revisions in one checkout, ordered by date, each priced against the cover as it will be, each applied once by Creator | Guild: the fee follows the documents (spec 10A). One checkout decided 27 October (MTA-D24); the Guild tests and confirms |
| Saved requests | A request that needs the office is saved as a CRM record with every answer (like the Referred insurance records) so staff continue it without re-asking | Guild, 26 October (MTA-D10 closed) |
| Subscriptions | Treat an MTA as two things tied to one revision: a pro-rated one-off charge for the rest of the term (Checkout, payment mode) and a change to the existing subscription so renewals carry the new cover. Monthly plans need no schedule once WP13 is built; until then a monthly plan with year-one lines must have its schedule updated too | Everything now renews. Checkout cannot change a subscription, and a missed schedule update would drop or repeat a line. Who makes the change (portal function or Creator) is MTA-D21 |
| Price lookup | Fixed items (branch, items, membership fees, FEE-MTA, FEE-CANCEL) by Stripe lookup key; computed lines inline with the price list code in product metadata | Matches Portal V2 and lets Books and Creator match every line by code |
| Credits in checkout | Stripe customer balance (or one-off coupon) for the Associate refund and replacement refunds; Books credit note against the original invoice | Checkout cannot take negative lines |
| Refunds | Staff only: Stripe refund plus Books credit note, recorded on the revision | Matches the workbook and the "CRM is not the finance authority" rule in the SoW |
| Documents | Zoho Writer merge templates driven from the revision; files stored in a per-revision WorkDrive folder under the policy; email sent with attachments chosen by cover from the links workbook | Reuses the existing WorkDrive document proxy for the portal history |
| Monthly payers | Build yearly payers first. For monthly payers: one-off for the rest of the member's own billing month including the GBP 5, higher monthly payment from the next billing month without the fee, flat items paid at once (spec 13B). Future-dated changes in a later month wait for MTA-D20 | The rules are largely agreed; the future-dated case and refunds on monthly plans are not |
| Flat items at joining | **Decided 27 October (MTA-D22): proceed.** For monthly payers the joining fee and flat items are charged on the first payment as one-off lines, every subscription line is ongoing, and the 12-month schedule is retired (WP13) | Guild suggestion, agreed by A2Z. It removes the schedule that a mid-term change would otherwise have to rewrite and keeps the monthly amount the same at renewal. Changes the 21 October rule and the first-payment examples |

## 4. Effort: work packages

Complexity: **L** low, **M** medium, **H** high. Hours are left blank for the pre-sales lead.

| WP | Work package | Contents | Depends on | Complexity | Main drivers | Hours |
| --- | --- | --- | --- | --- | --- | --- |
| WP0 | Decisions and sign-off | Close MTA-D03 (rounding), D04 (membership fee refunds against the Terms of Business), D14 (duplicate documents fee), D20, D23 and D26 with the Guild, Hiscox and the Creator owner (D10, D12, D13, D15, D16, D18, D19, D22, D24 and D25 are closed, and D01, D06, D17 are largely answered); worked examples signed off as test data | Guild | L (A2Z), customer-dependent | Turnaround from Guild and insurer | |
| WP1 | CRM data model | Policy_Revisions fields (fee, waiver, waiver reason and user, amount paid to date, endorsement or refund amount, revised total, effective date, status, quote snapshot, document status); revision lookup and effective from/to on Insurance_Extension, Insured_People, Insured_Premises, Declarations, Membership_Extension; bordereau cancellation reason values; Contact field history tracking; Deal handling for upgrade and downgrade | WP0 for picklists | M | Live metadata check, Blueprint and workflow side effects (INS Policy Activation fires on Payment_Status) | |
| WP2 | MTA engine: context and quote | Current cover read; delta rating via calculateQuote on price list v2; pro-rata; IPT; fee rules (FEE-MTA by lookup key); rules and risk checks reuse; per-scenario eligibility (self-service, refer, stop); one effective date; end date fixed to policy end; the subscription view of the change (new yearly amount, or new monthly amount and remaining payments, using the `plans.js` rule); quote version and expiry; unit tests against the sample letters | WP0 (basis, employee fee, monthly rules), WP1 | H | Number of scenarios (about 25 rows in the matrix), swap netting, Salon turnover band changes, exactness to the penny, yearly and monthly outcomes | |
| WP3 | MTA engine: revisions and apply | Create and update revision drafts, one per effective date, ordered by date; idempotent apply that end-dates old rows and creates new ones; scheduled activation cron; replacement policy creation for Salon/Non-Salon; save a request that needs the office as a CRM record with every answer; **apply the subscription change** (add or change items on the yearly subscription, change the monthly amount, with no schedule to update once WP13 is built) exactly once alongside the cover change | WP1, WP2 | H | Exactly-once application across CRM and Stripe, interaction with existing CRM workflows, schedule handling | |
| WP4 | Payments and finance | New checkout services (mta, branch_midterm, upgrade_full) with every inline line carrying its price list code; fee line; customer balance or coupon credits; **subscription update and cancellation calls** (stop a subscription, end its schedule, replace Full with Associate); a single checkout for several revisions (each with its own GBP 5 line and revision reference, kept inside the 50 key metadata limit by adding the MTA type to `metadataContract.js` and regenerating stripe-metadata.md); the monthly one-off for the billing month and the higher payment from the next; MTA branches in the **new Creator payments app** (Stripe Webhook Log, Invoice Records, Subscription: an MTA charge must not be read as a renewal or a new activation, and must cope with events arriving out of order); Books invoices for MTAs and credit notes for refunds. FEE-MTA and FEE-CANCEL already exist in Books; the GBP 10 duplicate documents fee does not and needs adding if it is kept | WP2, WP3, Creator and Books owners | H | Creator payments app (MTAs come after its payments slices), Books credit notes, Stripe credit and subscription mechanics | |
| WP5 | Portal: cover summary and history | Membership card statements and actions; current cover summary with Edit and Add; change history tab with documents | WP2 (context read) | M | New read endpoint, prefilled display of every cover type | |
| WP6 | Portal: membership-only changes | Mid-term pro-rated branch (also added to the subscription so it renews at the full yearly price); items (existing service); cross-sell basket; Adjustment Letter on fulfilment | WP2, WP3, WP4, WP8 | M | Items are reuse; branch pro-rata and joining the subscription are new | |
| WP7 | Portal: insurance changes | Edit mode for InsuranceFields with prefill; people add and swap (like-for-like carries the membership fee over, subcontractor to employee is payable, employee to subcontractor is referred; spec 7A); treatments; teaching; Business Equipment and EL upgrades; Salon covers (Money, Buildings, Business Interruption and Property Away only once Contents is held) and turnover changes; premises address with risk checks; effective date; repeat declarations; review with credits, IPT and fee; checkout; call-the-office pop-ups | WP2, WP3, WP4 | H | Breadth of scenarios across two routes, keeping new-business behaviour unchanged | |
| WP8 | Documents and email | Writer templates: Membership Adjustment Letter, Endorsement Schedule, Cancellation Letter B (with membership refund line), Letter D, Cancellation Schedule C; Adjustment Receipt and Cancellation Receipt emails; attachment selection by cover; per-revision WorkDrive folders; policy wording links in the portal (POLICY_WORDING and legal.js, plus General Terms and Conditions and Property Definitions entries) | WP1, WP3 | M to H | Schedule carries the full previous cover; cumulative amounts | |
| WP9 | Associate upgrade | Upgrade button and Get a quote path; Full membership plus insurance plus Associate credit in one checkout; Associate continues until the start date, then its subscription ends and the Full one starts; Deal changes; CRM-side upgrade action | WP2, WP4, MTA-D16 | M to H | Credit mechanics, two Deals and their dates, ending one subscription and starting another without a gap or a double charge | |
| WP10 | CRM MTA widget (staff) | Staff context from the Staff Workspace; same quote screens; refund, removal, downgrade and swap-with-credit flows; fee waiver with reason; cancellations (Associate, Full, cooling off, downgrade to Associate), each **stopping or replacing the Stripe subscription and ending any monthly schedule**; Salon/Non-Salon replacement (new subscription for the new policy); Letter D selection | WP2, WP3, WP4, WP8 | H | Staff authorisation adapter, refund execution, all cancellation variants, subscription and schedule endings | |
| WP11 | Contact details | Phone and email change in the portal; email change updates Catalyst and CRM together with re-verification; CRM audit | Catalyst auth | M | Login change without losing record access | |
| WP12 | Test and UAT support | Scenario tests from spec section 17 and the scaffold UAT plan; sample-letter reconciliation; staff and member UAT rounds through the UAT action log | All | M | Scenario count, insurer sign-off of outputs | |
| WP13 | Month-1 charging for monthly payers (MTA-D22) | Change the plan rule so the joining fee and add-ons are one-off lines on the first invoice and every subscription line is ongoing; first payment = ongoing monthly payment plus the one-off items, later payments = ongoing monthly payment; retire `ensureSchedule`, the payment return call and the portal's schedule webhook for plans (keep only if something else needs them); update the plan and metadata tests, `metadataContract.js` and stripe-metadata.md (per-item amounts for these items become full amounts), pricing-payments.md and the Creator handover. Tell the Creator owner before the Subscription and Invoice forms are finished. Confirm there are no live monthly subscriptions first | Finance confirms first-payment amounts in testing | M | Touches new-business checkout, plan tests and the Creator contract; Stripe is in test mode so no live migration | |

Quick wins that do not wait for the MTA build:
- policy wording links (WP8 part)
- the GBP 10 duplicate documents fee in Books, if the Guild keeps it (MTA-D14)

Already done on main and no longer part of this scope: the price list v2 rating (named people, Advanced Electrolysis, Salon bands), and the FEE-MTA and FEE-CANCEL Books items.

## 5. Path Forward

### Suggested build order

| Release | Contents | Can start | Gate to release |
| --- | --- | --- | --- |
| R0 | Policy wording links; duplicate documents fee in Books (if kept). Three changes to existing journeys, each its own reviewed change: (1) the joining fee gap rule on new business and renewal (spec 8C), (2) Contents required before Money, Buildings, Business Interruption and Property Away at new business (spec 7), (3) month-1 charging for monthly payers (WP13, MTA-D22). Rating fixes from price list v2 are already built | Now | Guild confirms rules (1) and (2) in writing; Finance confirms the new first-payment amounts for (3) |
| R1 | WP1, WP2 read-only context, WP5 summary and history | WP1 metadata check now | Live CRM fields verified |
| R2 | WP6 membership-only changes (yearly payers), plus the WP3, WP4 and WP8 pieces they need, including the subscription change | After R1, and the Creator payments app handling MTA events | Adjustment Letter template approved; MTA-D20 and D21 agreed |
| R3 | WP2 quote, WP3, WP4, WP7 payable insurance changes (yearly payers), WP8 schedules | After WP0 rates and basis | Sample letters reproduced to the penny; insurer sign-off |
| R3b | Monthly payers for R2 and R3 changes | After R3 | MTA-D17 and MTA-D20 settled; monthly amount change tested and WP13 in place |
| R4 | WP9 Associate upgrade | After R3 payments | MTA-D16 |
| R5 | WP10 staff widget: refunds, waivers, cancellations, replacements | After R3 | MTA-D04 resolved; subscription stop and replace tested |
| R6 | WP11 contact details; WP12 full UAT and hardening | Parallel from R2 | UAT sign-off |

The staff widget could be started before the portal journeys if the Guild would rather process MTAs in CRM first. The engine is shared, so changing the order does not create rework.

R3 (payable insurance changes) is planned in detail in [mta-r3-plan.md](mta-r3-plan.md): the live CRM fields it uses, the revision lifecycle, the PR sequence and the verification gate.

### Next actions

1. Send the Guild only what is still open: D23 (a change in the last month of a policy already renewed), D26 (employee certificates and logins), D03 rounding, D04 membership fee refunds, D14 duplicate documents fee, and D20 (future-dated changes for monthly payers). D22, D24 and D25 are decided; the Guild confirms them in testing.
2. Tell the Creator owner now about MTA-D22 (month-1 charging, no 12-payment schedule), because the new payments app is being built and its Subscription and Invoice forms should not assume the old shape.
3. Pre-sales lead to set hours per work package and decide on the change request route.
4. Run a live CRM metadata check on Policy_Revisions and the cover modules (WP1) to confirm the field list before design sign-off.
5. Scope MTA invoices, credit notes and subscription changes against the **new Creator payments app** (Stripe Webhook Log, Invoice Records, Subscription), not the V1 handler, and agree with its owner where the subscription change is made (MTA-D21).

### Risks

- Pricing conflicts unresolved when Books is finalised, which would make new business and MTAs disagree.
- Existing CRM workflows (for example INS Policy Activation on Payment_Status) firing on revision payments and activating cover early.
- Insurer sign-off of pro-rata and refund rules arriving late, which blocks R3 and R5.
- Monthly payers asking for MTAs before MTA-D17 and MTA-D20 are settled.
- A subscription that no longer matches the cover (a change applied to the CRM but not to Stripe, or the reverse), which would bill the wrong renewal amount or keep billing after a cancellation.
- The Creator payments app reaching MTAs late, because it builds payments first and mid-term changes afterwards.
- A renewal date that sits up to 30 days from the policy anniversary, so added cover may renew on a different day from the policy.
- The two changes to live journeys (joining fee gap rule, Contents first) landing while UAT on new business is still running, and surprising members who relied on the old behaviour.
- Changing the monthly rule (WP13) after the Creator payments app has started on the 12-payment shape: mitigated by telling the Creator owner now and by Stripe still being in test mode.
- Several dated revisions in one checkout: partial application if one revision fails, and double application on a retry. Each revision must be applied once and reported on its own.
