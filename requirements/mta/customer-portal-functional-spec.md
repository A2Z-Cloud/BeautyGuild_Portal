# Beauty Guild | Customer Portal MTA Functional Specification

**Status:** Proposed for Guild, Finance and insurer review. Not approved for implementation or production.
**Version:** 0.3 | 24 October 2026
**Change from 0.2:** brought up to date with Portal V2 main (8c85ca1). Price list v2 (agreed with the Guild on 21 October) closes MTA-D12, D13 and D15 and mostly closes D14; section 7 now uses the v2 figures. New section 13A covers renewing subscriptions (yearly and monthly), which every membership, insurance, branch, employee fee and accreditation purchase now is; MTA-D17 is re-worded and MTA-D20 and D21 are added. Section 15A is re-baselined. Prices are found in Stripe by lookup key, not price ID.
**Change from 0.1 (in 0.2):** adds the Cancellations pack, Policy Documents pack and the sample adjustment letters; records what the samples settle; maps every journey to Portal V2 as built (section 15A); unblocks the Associate upgrade and Salon/Non-Salon replacement rules; adds new pricing conflicts to section 18. Build planning is in [docs/delivery/mta-build-scope.md](../../docs/delivery/mta-build-scope.md).
**Scope:** Authenticated customer-facing Mid-Term Adjustments (MTA) in Portal V2. Separate from the staff MTA CRM widget.
**System:** A2Z-Cloud/BeautyGuild_Portal, frontend under apps/portal and future secure MTA backend services.
**Terminology:** Customer-facing language should say "Make changes", "Your changes" and "Change history", rather than assuming members understand the acronym MTA.

## 1. Source basis and precedence

The following supplied material informs this draft:

- **MTA's.xlsx**: Summary, Associate MTA, Non-salon MTA and Salon MTA worksheets. Primary source for requested customer journeys, eligibility, amounts, fees, dates and documentation.
- **1. Membership Adjustment Letter.pdf**, **2. Guild Membership Insurance Adjustment Receipt.msg**, **3. Endorsement Schedule.pdf**: example adjustment confirmation and policy-version documentation.
- **CRM Cartographer JSON snapshot**: observed modules, fields and relationships. This is not proof of current CRM field permissions or automation behaviour.
- **BeautyGuild_Portal (main at 8c85ca1, 24 October 2026)**: V2 route structure, MembershipManagement, records, document access, authenticated read services, the checkout adapter, plans and subscriptions ([pricing-payments.md](../../docs/api-contracts/pricing-payments.md)) and the Creator payments app notes ([creator-payments-app.md](../../docs/delivery/creator-payments-app.md)).
- **Price list v2 (agreed with the Guild on 21 October 2026)**: the current prices for membership, named people, treatments and fees. It replaces the workbook figures where they differ (section 7).
- **beauty-guild-catalyst (V1)**: insurance questionnaire, rule logic, membership add-on journeys and pricing code to reconcile, not blindly import.
- **MTA Management widget workstream (PR #3)**: proposed shared MTA service and staff-only controls.
- **Cancellations pack (added in 0.2)**: Cancellations.xlsx (Cancellation Summary, Upgrade to full, Documents tabs), A. Guild Membership Insurance Cancellation Receipt.msg, B. Membership Cancellation Letter.pdf, C. Cancellation Schedule.pdf, D. Membership Cancellation Letter 2.pdf.
- **Policy Documents pack (added in 0.2)**: the twelve numbered policy wordings, Terms of Business (October 2026) and "Links & Policy documents for customer journey.xlsx" (which document is linked at each step, and which attachments go on acceptance and renewal emails).
- **Sample adjustment letters (added in 0.2)**: four worked Membership Adjustment Letters embedded as images in MTA's.xlsx (Business Equipment added, subcontractor added, treatment cancelled with a refund, employee swap). These are the best evidence available for fee and pro-rata treatment (section 1A).

The Cancellation rules referenced by the workbook were supplied on 24 October 2026 and are reflected in sections 8, 8A and 8B. Some of them conflict with the insurer General Terms and Conditions and the Terms of Business (section 18). Prices now come from price list v2, whose Books items already exist (including FEE-MTA and FEE-CANCEL) and are found in Stripe by lookup key. Illustrative examples from the sample documents must still be reconciled with that list, the insurer terms and the Stripe/Books/Creator integration before live quoting.

Requirement classification throughout:
- **[SOURCE]** Directly requested in the MTA workbook or sample documents.
- **[DESIGN]** Recommended Portal V2 behaviour or technical design, subject to confirmation.
- **[DECISION]** Unresolved requirement, dependency or conflict.

## 1A. Evidence from the supplied sample documents

These points are read from the Guild's own sample letters and schedules. They are strong evidence of current practice, but each still needs the confirmation listed in section 18.

| Topic | What the samples show | Effect on this spec |
| --- | --- | --- |
| GBP 5 adjustment fee | Added to the transaction when the customer pays (GBP 219.69 + GBP 5.00 = GBP 224.69). Netted against a refund when money is due back (minus GBP 33.60 + GBP 5.00 = minus GBP 28.60). | "Less the GBP 5 fee" in the upgrade wording means the fee is still charged. Resolves the addition versus deduction question previously open in section 10. |
| Fee and IPT | The Endorsement Schedule shows the fee as "Policy Fees" with no IPT on it. IPT is 12% of the premium element only. | Fee is a separate line, outside IPT. The price list confirms the GBP 5 MTA fee (Books item FEE-MTA) and the GBP 10 cancellation fee (FEE-CANCEL) include VAT (MTA-D14). |
| Pro-rata basis | GBP 200.00 Business Equipment, effective 07/10/2026, policy ending 29/09/2027, charged GBP 196.15. This equals 200 x 357/364 exactly; 358/365 would give GBP 196.16. | Day-count basis appears to be days remaining divided by 364. Must be confirmed with the Guild and Hiscox before coding (MTA-D03). |
| Advanced Electrolysis | Journey screenshot and the refund letter both use GBP 33.60 including IPT (GBP 30.00 net). | Settled by price list v2: GBP 30.00 net (GBP 33.60 with IPT), and Portal V2 now rates it so. MTA-D12 is closed. |
| Cooling-off cancellation | Letter B refunds GBP 160.60, of which GBP 112.00 is insurance and IPT (Schedule C) and GBP 48.60 is the membership fee. | Letter B mislabels the whole amount as insurance. The template needs a separate membership refund line. |
| Refund smaller than the fee | Letter D: GBP 8.00 refund less GBP 10.00 fee shows minus GBP 2.00 and "no refund is payable". | The customer is never invoiced the shortfall. The system must pick Letter D when the fee exceeds the refund. |
| Salon base premium | Schedule C (May 2026, turnover GBP 18,000) shows a GBP 100.00 premium. | The Guild confirmed the Salon medical malpractice bands of GBP 75, GBP 100 and GBP 150 (price list v2), so GBP 75.00 applies up to GBP 100,000 turnover. Schedule C pre-dates the list. MTA-D13 is closed. |

## 2. Goal and boundary

Allow a signed-in member to inspect their current membership/insurance term, propose eligible mid-term changes and complete the permissible changes online. Reuse existing questionnaire controls and approved policy rules. Do not treat an adjustment as an entirely new quote unless the rules require policy replacement.

The portal must not grant self-service access to a staff-only refund, cancellation decision, fee waiver, underwriting override, approval or premium adjustment. Those remain in the separately packaged CRM MTA Management widget and the verified backend services.

[DESIGN] Do not add a standalone MTA item to the primary sidebar. Entry belongs in the contextual Membership/Insurance records, with a clear route back.

## 3. Entry, context and starting conditions

- [SOURCE] **Associate:** Membership screen shows membership type, current term and a clear statement that Associate membership does not include insurance. Actions: "Make changes to your membership", "Add a membership branch", "Purchase certificates, badges or window stickers", and "Add insurance to your membership".
- [SOURCE] **Non-Salon / Salon:** Membership screen shows the current insurance and its cover details, with "Make changes to my insurance", "Add a membership branch" and "Purchase membership items".
- [SOURCE] Initiating any of those journeys must allow the customer to add other eligible branches/items/insurance changes before checkout rather than forcing separate unrelated transactions.
- [DESIGN] Open from the existing V2 Membership Management route and, where appropriate, Insurance record detail. Preserve membershipDealId, policyId, selected section, return route and tab. Use stable record IDs and restore state after login/payment.
- [DESIGN] Verify signed-in Catalyst identity to exactly one authorised CRM Contact on the server. Never trust policy, Deal or Contact IDs supplied in browser queries as proof of ownership.
- [DESIGN] Only an **active and eligible** membership/policy permits a new customer MTA. Pending issuance, expired, cancelled, replaced, referred or locked records show the applicable status and a Guild assistance path.
- [DESIGN] Prevent or explicitly resolve overlapping in-progress revisions against the same policy/term; show a recoverable message rather than silently overwriting one.

## 4. Recommended page structure and navigation

Use the established Portal V2 visual language: compact context header, understated status, section tabs and one clear next action. A new top-level menu is not necessary.

### Screen A: Membership & Insurance summary

Show membership number/reference, type, main/secondary branches, start/end date, policy reference/status (when insured), paid/current cover summary and applicable actions. For Salon/Non-Salon show each existing insurance section with an **Edit** action and eligible absent sections with **Add cover**.

An optional "Changes" or "Adjustment history" tab lists previous revisions and downloadable documents.

### Screen B: Choose and edit changes

Prefill current member/policy data, including insured people, covers, limits, treatments, teaching and premises where applicable. Maintain a **proposed change basket** separate from live cover. Each item shows before -> after, requested effective date and whether it is eligible for self-service.

Customer can remove an unapplied proposal from the basket. A removal/refund against *live* cover is a different, restricted operation.

### Screen C: Date and insurance declarations

For changes affecting insurance, choose the requested effective date, repeat all required declarations (including treatment declarations), and display the applicable questions, informational pop-ups and policy wordings. Membership-only branch/item purchases must not be forced through irrelevant underwriting declarations.

### Screen D: Review and quote

Display previous and proposed values, individual charges/credits, remaining-term calculation, IPT explicitly, membership/product taxes where applicable, £5 adjustment fee or exemption, and a clear **Amount to pay now** or **Guild review required** result. The price and eligibility decision must come from the backend.

### Screen E: Checkout or referral

Eligible positive-value changes proceed to secure Stripe Checkout tied to an immutable server-quoted revision. Referred, blocked or refund-due cases do not expose an online payment/apply button. Present the Guild contact/callback pathway and preserve the request for staff handling if that feature is agreed.

### Screen F: Confirmation, status and history

Explain **Payment received**, **Awaiting confirmation**, **Scheduled for [date]** or **Adjustment completed** accurately, according to verified backend state. List revision reference, effective date, financial summary, cover impact and available documents. Do not present future-dated cover as already effective.

## 5. Customer self-service eligibility matrix

| Scenario | Associate | Non-Salon | Salon | Portal outcome | Source/conditions |
| --- | --- | --- | --- | --- | --- |
| Buy additional membership branch | Yes | Yes | Yes | Self-service | GBP 15 annual price, prorated to term end; no GBP 5 MTA fee |
| Buy membership bundle | Yes | Yes | Yes | Self-service | GBP 10 each, not prorated, no GBP 5 fee |
| Buy extra certificate, badge, window sticker | Yes | Yes | Yes | Self-service | GBP 4 per item, not prorated, no GBP 5 fee |
| Add insurance to Associate membership (upgrade to Full) | Yes | N/A | N/A | Self-service, full new insurance quote | Section 8A. Net price after Associate refund; Full term runs 12 months from the insurance start date |
| Change phone number | Yes | Yes | Yes | Self-service | CRM audit date and timestamp |
| Change login email | Yes | Yes | Yes | Self-service with verified identity transition | CRM + Catalyst login must remain synchronised |
| Change first/last name, trading name or correspondence address | No | No | No | Guild staff only | These fields are CRM-editable, not customer editable |
| Change insured premises address as part of property risk | N/A | Conditional | Conditional | Self-service if eligible and underwriting passes | Different from correspondence address; rerun checks/declarations |
| Add named employee or subcontractor (up to four in total) | N/A | Yes | Yes | Self-service subject to rules | Effective date, fee, classification declaration and member/policy rules |
| More than four named people | N/A | Refer | Refer | Contact Guild | Requires staff underwriting referral |
| Remove named person only | N/A | Refer | Refer | Contact Guild | Possible refund, staff-only process |
| Swap named people with amount due | N/A | Yes | Yes | Self-service | Calculate net change, add applicable fee |
| Swap named people with refund due | N/A | Refer | Refer | Contact Guild | Refund/credit staff-only |
| Swap named people with no net premium difference | N/A | To confirm | To confirm | Decision needed | Workbook does not explicitly define neutral swap handling |
| Add advanced treatment extension | N/A | Yes | Yes | Self-service subject to qualifying rules | Display options, price incl. IPT, requirements, fee, prorate |
| Add/change teaching insurance | N/A | Yes | Yes | Self-service subject to treatment coverage | Standard vs advanced teaching variants |
| Add/increase business equipment | N/A | Yes | Applicable property cover | Self-service for increases | Non-Salon: 5k/10k/15k/20k bands; current tier comparison |
| Decrease equipment/other insured value | N/A | Refer | Refer | Contact Guild | Potential refund |
| Add/increase Employers' Liability | N/A | Yes | Yes | Self-service where underwriting passes | Non-Salon: up to 1, 3 or 5; Salon: wage roll-based |
| Decrease Employers' Liability | N/A | Refer | Refer | Contact Guild | Potential refund |
| Add/increase Contents, Buildings, Money, Business Interruption, Property Away/In Transit | N/A | Only options applicable to product | Yes | Eligible additions/increases | Follow original conditional questionnaire, risk checks and wordings |
| Decrease existing property/liability cover | N/A | Refer | Refer | Contact Guild | Possible refund |
| Increase Salon turnover band / wage roll | N/A | N/A | Yes, where approved | Self-service for permissible increases | Recheck underwriting and prorated premium difference |
| Decrease Salon turnover band | N/A | N/A | Refer | Contact Guild | Possible refund |
| Salon <-> Non-Salon product switch | N/A | Conditional | Conditional | Replacement policy journey | Section 8. New full-year policy, net of pro-rata refund on the old one, GBP 5 fee. Refund conflicts in MTA-D04 |
| Cancel Associate membership | No | N/A | N/A | Guild staff only (CRM) | No refund by default; staff may override with a full or partial refund. No fee |
| Cancel Full membership | N/A | No | No | Guild staff only (CRM) | Section 8B. Pro-rata insurance refund less GBP 10; full refund within 14 days |
| Downgrade Full to Associate | N/A | No | No | Guild staff only (CRM) | Section 8B. Associate runs to the original Full expiry date |

**Interpretation:** "Yes" means requested self-service functionality, NOT that the existing V2 portal/API currently implements or has insurer approval for it. Where the sheet states that a reduction/refund requires calling the office, the portal must not independently execute the refund.

## 6. Membership-only changes

### Additional branches [SOURCE]

- Display primary and existing additional branches. Only present branches not already held.
- Price GBP 15 on an annual basis (Books item MEM-BRANCH, read live from Stripe), **prorated for the remaining applicable membership term**.
- A branch now renews with the membership (section 13A): the pro-rated amount is charged for the rest of this term, and the branch joins the subscription at the full yearly price from the next renewal. Monthly payers see their remaining payments change instead.
- No GBP 5 adjustment fee for a branch-only amendment.
- Following completion, issue the additional branch certificate, add the member to the relevant register and email a Membership Adjustment Letter describing this and any other approved changes.

### Membership items [SOURCE]

- Bundle GBP 10, extra certificate GBP 4, badge GBP 4, window sticker GBP 4.
- Quantity selector, clear item totals and delivery/fulfilment information.
- No remaining-term proration and no GBP 5 adjustment fee when purchasing those items alone.
- Email the Membership Adjustment Letter detailing purchased items and other adjustments, if any.

### Combining with insurance

[SOURCE] Before completing a branch or item purchase, offer the member relevant insurance or other membership changes. [DESIGN] Treat the combination as a single revision/checkout only where common eligibility, dates, invoicing and fulfilment rules permit it. **Decision:** clarify whether the non-exempt insurance MTA fee is applied once when exempt branch/items share that transaction (proposed: one fee for the insurance revision, none on the exempt items).

## 7. Insurance amendments: common behaviour

- [SOURCE] Show all currently held cover and **Add** only for cover not held; **Edit** existing cover from the summary without re-entering unchanged baseline information.
- [SOURCE] Reuse all relevant wording, explanatory pop-ups, eligibility checks, policy document links and declaration questions from the original insurance journey.
- [SOURCE] Charge the applicable pro-rata premium difference, plus IPT and the adjustment fee unless exempt.
- [SOURCE] For eligible named-person, treatment, teaching and property additions/changes, allow requested start up to **30 days in advance**, and keep extension expiry aligned with the existing policy end. Confirm precise date limits for categories where the workbook is silent.
- [SOURCE] **One insurance effective date per revision.** Differing dates require separate revisions, each potentially subject to the GBP 5 fee.
- [SOURCE] Re-ask all insurance declarations, including treatment declarations, even when cover was previously purchased.
- [DESIGN] If a risk check generates STOP or REFER, disable checkout; explain next steps without disclosing confidential internal underwriting details.
- [DESIGN] Use the current live policy snapshot and rule version; reject or re-quote if the source policy changes while the draft is in progress.

### Insured people [SOURCE]

Request first name, last name and Employee/Subcontractor. Show the original explanatory text defining the difference and clarifying that subcontractors trading in their own name are not covered for their own treatment, public and product liability under this policy. Limit customer-managed named people to four total, counting those that will remain after the proposed amendment.

Annual rates (price list v2, agreed with the Guild on 21 October 2026, and what Portal V2 charges at new business):
- Non-Salon employee: GBP 91.40, being the GBP 55.00 membership fee (Stripe lookup key MEM-FULLNS-Y), the GBP 32.50 premium and GBP 3.90 IPT.
- Non-Salon subcontractor: GBP 16.80, being the GBP 15.00 premium and GBP 1.80 IPT.
- Salon employee: the GBP 55.00 membership fee only (MEM-FULLS-Y), with no premium or IPT.
- Salon subcontractor: nothing.
- The membership fee carries VAT (the GBP 38.00 zero-rated split applies), sits outside IPT and is one line per employee group.
- Insurance MTA fee: GBP 5.00 including VAT (FEE-MTA), in addition, even where a Salon subcontractor adds no person premium.

The workbook figures (GBP 85.00 and a GBP 48.60 membership component) are out of date and must not be used.

Additions, and swaps where the net transaction is payable, are intended for online completion. Standalone removals and net refunds go to Guild staff.

**MTA-D15 (answered by price list v2):** the MTA engine and new business now use one table. One point remains for MTA-D03: whether the GBP 55.00 employee membership fee is pro-rated over the remaining term like the premium, or charged in full when a person is added mid-term. The sample letters show premium and IPT only.

### Advanced treatments and teaching [SOURCE]

- Show the five advanced treatment options carried over from the original journey: advanced electrolysis; microneedling/dermarolling; nose/cartilage piercing; microblading/SPMU/micropigmentation; dermaplaning.
- Display each approved price including IPT, requirements and explanatory pop-ups. The workbook screenshot uses GBP 33.60, GBP 200.76, GBP 15.85, GBP 200.76 and GBP 200.76 respectively. Portal V2 now matches all five (Advanced Electrolysis is GBP 30.00 net under price list v2; MTA-D12 is closed).
- Teaching: standard teaching/student cover or teaching with additional purchased treatments, chosen based on treatment-extension status. Workbook screenshot indicates GBP 84 and GBP 168 incl. IPT respectively, also subject to rate validation.
- Show policy wording and qualification/patch-testing confirmations; stop/refer according to approved underwriting rules.

### Non-Salon equipment and Employers' Liability [SOURCE]

- Business equipment absent: choose GBP 5,000 / 10,000 / 15,000 / 20,000 cover. Capture premises address and relevant property underwriting details.
- Business equipment already present: show current tier and allow only upgrades online; downgrade or possible refund -> Guild.
- Employers' Liability absent: tiers **up to 1, up to 3, up to 5**; if held, permit increases only.
- Changed tier premium is based on cancellation/credit of the old remaining cover and charging the prorated new remaining cover, not an additional full new annual policy premium. Preserve the original extension for history.

### Salon business risk and property [SOURCE]

- Prefill turnover, estimated annual gross wage roll and number of salons. Show dates of the actual policy in the question wording. Recheck limits and referral rules when answers change.
- Turnover band increase: prorated increase where otherwise eligible. Decrease: refer to Guild.
- New Employers' Liability: capture wage roll and apply original policy/questionnaire conditions.
- New Contents: show all original values/underwriting questions; support insured premises address correction, flood/subsidence checks and property declarations. Offer Business Interruption, Property Away/In Transit, Buildings and Money cover when now eligible.
- Existing property/other cover: increase online subject to rules, decrease/refund -> Guild. A limit increase with no premium difference may remain self-service if backend confirms eligibility; the GBP 5 fee rule still needs reconciliation.
- Show selected new cover levels and unchanged continuing cover on the revised schedule.

## 8. Changes that replace rather than endorse a policy

[SOURCE] Reassess the five "How you work" options from the original insurance journey: working from home; mobile; solely occupying a room in another establishment; self-employed subcontractor in a multi-therapist salon; owning/operating a salon.

If these answers change Salon <-> Non-Salon eligibility:
- Quote the new product for a **fresh one-year policy term**.
- Cancel the former policy with the appropriate bordereau cancellation reason.
- Reflect the approved remaining-term membership/policy refund and new policy amount, with the GBP 5 adjustment fee.
- Issue a cancellation email for the old policy and a new membership acceptance/insurance document pack for the replacement.
- Retain both policy references and their cancellation/replacement lineage.

[SOURCE] The rules supplied on 24 October 2026 state:
- The replacement is a cancellation of the original policy plus a new policy for a full year, so the end date changes.
- Bordereau cancellation reason: "Moving from salon policy to non-salon policy" or "Moving from non-salon policy to salon policy".
- The customer pays the net of the pro-rata refund on the original policy and the cost of the new policy.
- The original membership fees are refunded pro-rata, and the GBP 5 adjustment fee is charged.
- The customer receives a cancellation email for the old policy and a membership acceptance email (full document pack) for the new one.

**[DECISION]** Checkout on this path stays disabled until MTA-D04 (refund rules versus the insurer's GBP 30 minimum premium) is answered and Stripe can collect a net amount after a credit (see build scope, payments work package). If the net amount is a refund, the customer is sent to the office.

## 8A. Associate upgrade to Full membership with insurance

[SOURCE] From the "Upgrade to full" tab and the Cancellation Summary:
- The dashboard Membership card gains an **"Upgrade to Membership with Insurance"** button. The existing **"Get an insurance quote"** action follows the same path for an Associate member.
- Either action opens the full insurance quote journey. The member picks an insurance start date up to 30 days ahead, as for a new quote.
- Associate membership continues until the insurance start date.
- The quote summary shows the insurance quote, then the refund due on the Associate membership, then the **net price**. Example: GBP 20 refund and GBP 85 due, so GBP 65 is charged.
- Full membership runs for 12 months from its start date. It is **not** shortened to match the old Associate end date.
- No cancellation email is sent for the Associate membership and no GBP 10 fee applies. The member receives the normal Full membership acceptance email and pack.
- Guild staff must also be able to perform the upgrade in CRM.

[DESIGN] Portal V2 currently refuses insurance for an Associate (409 INSURANCE_NEEDS_FULL_MEMBERSHIP), and its membership upgrade path waives the joining fee but gives no credit. This journey therefore needs a new service that combines the Full membership, the insurance quote and an Associate credit. Stripe Checkout cannot take a negative line item, so the credit is applied through the Stripe customer balance or a one-off coupon and recorded in Books as a credit note against the Associate invoice. The Associate membership is itself a yearly or monthly subscription, so the upgrade also ends that subscription and starts the Full one (section 13A).

[DECISION] MTA-D16: confirm how the Associate refund is calculated (pro-rata to the insurance start date, on the same day basis as MTA-D03), and whether the joining fee is charged on upgrade (the portal currently waives it).

## 8B. Cancellations and downgrades (Guild staff only)

None of these are available online. The portal shows the result (status, dates and documents) after staff process them in CRM. Each also changes the member's Stripe subscription: a cancellation stops it (and ends any monthly schedule), and a downgrade replaces the Full subscription with an Associate one (section 13A).

| Option | Online | CRM | Membership fee refund | Insurance premium and IPT refund | GBP 10 fee | Customer documents |
| --- | --- | --- | --- | --- | --- | --- |
| Cancel Associate | No | Yes | No by default; staff can apply a full or partial refund | N/A | No | None |
| Upgrade Associate to Full | Yes | Yes | Yes, netted against the new price | N/A | No | Full membership acceptance only (section 8A) |
| Cancel Full | No | Yes | No by default; staff can refund in full or pro-rata | Pro-rata | Yes, on pro-rata insurance refunds | A. Cancellation Receipt email with B. Cancellation Letter and C. Cancellation Schedule |
| Downgrade Full to Associate | No | Yes | No | Pro-rata | Yes | As Cancel Full |

[SOURCE] Rules that apply to the rows above:
- Within 14 days of inception (cooling off) everything is refunded (membership fees, premium and IPT) and no GBP 10 fee is charged.
- When the GBP 10 fee exceeds the pro-rata refund, nothing is refunded and Letter D replaces Letter B.
- On a downgrade, the new Associate membership runs to the date the Full membership would have expired.

[DECISION] MTA-D04: these rules conflict with the policy documents. General Terms and Conditions condition 7 applies a GBP 30 minimum non-refundable premium after 14 days, and the Terms of Business say no membership fees are refunded once a membership is accepted.

## 9. Contact changes versus risk-address changes

- [SOURCE] Customers can edit phone number and email; log who changed what and the timestamp in CRM. Email change also affects portal login.
- [SOURCE] Customers cannot edit first name, surname, trading/business name or correspondence address. Show "Contact the Guild" rather than an editable field for these.
- [SOURCE] The **insured premises address** is a separate risk input: eligible business equipment or Contents amendments may allow editing this address with fresh flood/subsidence checks and declarations.
- [DESIGN] Email changes need verified ownership of the old account, verification of the new email and coordinated CRM/identity changes; prevent a partial update leaving the user locked out.

## 10. Effective dates, financial breakdown and tax

### Date validation [SOURCE + DESIGN]

- One effective date for all insurance changes within a revision.
- Future dates up to 30 days ahead for the amendment types explicitly listed in the workbook.
- Date cannot precede permitted policy cover or exceed the existing policy end for an endorsement.
- A replacement policy starts a new term rather than inheriting the previous end date.
- Show the date chosen in the quote, confirmations, revised schedule and history.
- [DECISION] Confirm treatment of same-day cut-off, retrospective dates, weekends and whether a membership branch should share an insurance-effective date in a combined transaction.

### Price breakdown [SOURCE]

The summary must show:
1. Current annual policy/cover values (context only).
2. Item-level additions and credits resulting from this adjustment.
3. Remaining-term/proration basis and effective date.
4. Insurance Premium Tax (IPT) separately.
5. Membership item taxes where applicable, without misclassifying them as IPT.
6. The GBP 5 adjustment fee (including VAT, Books item FEE-MTA), or an explicit exemption (Guild staff may waive it in CRM).
7. **Amount to pay now**, **Potential credit/refund requiring staff review**, and the revised cumulative insurance position where relevant.

[SOURCE] The sample letters settle the fee direction (section 1A): the GBP 5 fee is added when the customer pays and netted off when a refund is due. It is not charged on branch or item purchases alone. Guild staff can waive it in CRM. Two cases remain open: a cover change with no premium difference (which the workbook allows online), and a swap with no net difference (MTA-D01).

[DECISION] The endorsement example fits days remaining / 364 (section 1A). Confirm this basis, the rounding (premium rounded to the penny, then IPT at 12% rounded once, as Portal V2 does for new business) and the insurer's GBP 30 minimum premium clause before coding rate outcomes (MTA-D03).

[DESIGN] Server price service alone determines line amounts. The portal displays the signed quote and its version/expiry, never submits a payable amount of its own.

## 11. Declarations, terms and evidence

- [SOURCE] Repeat all insurance declarations, including specialist-treatment declarations where relevant.
- [SOURCE] Show all relevant policy wording and original journey guidance in context (not merely a final generic link).
- [DESIGN] Version the exact declaration prompts, accepted answers, disclosure text, policy wording links, timestamp, user identity and related revision.
- [DESIGN] A material change to proposed cover or risk answers invalidates the prior quote and prompts any required new declarations/requote.
- [DESIGN] Show a final positive acknowledgement before checkout, and distinguish insured-cover terms from membership item terms.

## 12. Referral and non-self-service UX

No customer-side button should issue a refund, override an underwriting decision or activate cover.

- More than four named people -> explain that the Guild Insurance team must review.
- Named-person removal, net credit swap or risk cover downgrade -> explain the Guild must calculate/authorise the potential refund.
- STOP/REFER based on new declaration/risk -> show the relevant approved customer-facing reason and contact route.
- Product replacement where cancellation rules are not configured -> do not allow automatic checkout.
- [DESIGN] Optionally persist a **Request sent for review** item with the proposed changes and context, rather than discard customer inputs, if Guild approves this workflow. The workbook itself requires a "call office" prompt, not a confirmed request-submission system.

Suggested wording: "This change needs help from our Membership and Insurance team because it may affect a refund or the terms of cover. Your current cover has not changed."

## 13. Checkout, application and confirmation

- [DESIGN] Create/reuse a server-authorised Stripe Checkout Session linked to the exact MTA quote and revision. Reuse existing V2 checkout transport pattern but **do not route an MTA through the ordinary new membership/insurance purchase path**. An MTA is a charge for the rest of the current term plus a change to an existing subscription (section 13A), which the new-purchase path does not do.
- [DESIGN] Every inline line carries its price list code in product metadata (`sku`), as at new business, so Books and the Creator payments app can match it. Fixed items are found in Stripe by lookup key (for example `MEM-BRANCH`, `MEM-BUNDLE`), not by price ID.
- [DESIGN] Check current eligibility, quote version, amount and user ownership again immediately before checkout.
- [DESIGN] Creator/Stripe webhook and reconciliation, not the return page, confirm payment. No duplicate charges/revisions on retries.
- [DESIGN] If the approved amendment is future-dated, settlement now must not activate added cover before that date.
- [DESIGN] A zero-premium revision with fee only, or a true zero-charge revision, needs an explicitly approved settlement path.
- [DESIGN] If user cancels checkout or payment fails, current cover is untouched and the draft can be resumed.
- [DESIGN] After successful application, update/supersede the relevant CRM cover records with linked history and initiate document generation. Recover from partial downstream failures without reapplying the transaction.

## 13A. Renewing subscriptions and the Creator payments app

[SOURCE: Portal V2 as built, see pricing-payments.md] Everything a member buys now renews automatically, yearly or monthly: the membership, extra branches, insurance premiums, IPT, named employee fees and accreditation are Stripe subscription lines (insurance on its own is a subscription too). The earlier drafts of this spec assumed one-off insurance payments. Facts an MTA has to work with:
- **Yearly plan.** Each renewing item is an inline yearly line. The renewal charges the same amounts as year one (no re-rating), and renews a year after payment, which can be up to 30 days away from the policy anniversary.
- **Monthly plan.** Each payment is the yearly price plus the GBP 1.50 monthly admin fee, divided by 12 and rounded up. The joining fee and add-ons are spread over the first 12 payments and a Stripe schedule drops them at payment 13. Lines carry a `phase` (`ongoing` or `year_one`); the subscription carries `plan=monthly`, `phased` and `contact_id`.
- **Metadata.** Insurance amounts stay yearly in the CRM even on a monthly plan. Per-item amounts for a monthly plan are monthly shares.

What an MTA must therefore do beyond taking a payment [DESIGN, subject to MTA-D17 and MTA-D20]:
- **Charge for the rest of this term.** The Guild's rule is that MTA and cancellation prices are pro-rated by the action date and the policy end date (MTA-D17). This is a one-off charge, taken through Checkout.
- **Change the subscription.** A new branch, person, treatment or cover must also join the subscription, so the renewal amount changes. A yearly plan renews at the new yearly amount. A monthly plan's remaining payments change: the price list says monthly prices are amended going forward, and the new monthly amount follows the plan rule above. A monthly schedule must be updated, not just the subscription, or the extra line would be dropped or repeated at payment 13.
- **Stop or change it on cancellation.** A cancellation stops the subscription and ends its schedule. A downgrade replaces the Full subscription with an Associate one. An Associate upgrade ends the Associate subscription and starts the Full one (section 8A). Cooling-off cancellations also refund the payments already taken.
- **Never double-charge or double-apply.** The one-off MTA payment and the subscription change must be tied to one revision, applied once, and safe to retry.
- **Keep the CRM and Stripe in step.** The renewal amount in Stripe, the policy's cover rows and the shown renewal date must agree, including after a future-dated change.

The Creator side is being rebuilt as a new payments app (forms Stripe Webhook Log, Invoice Records, Subscription), covering payments first; mid-term changes, cancellations and vouchers come afterwards ([creator-payments-app.md](../../docs/delivery/creator-payments-app.md)). Its event model affects MTAs:
- A subscription activates on its first paid invoice (`billing_reason=subscription_create`), a one-off on `checkout.session.completed`, and later invoices (`subscription_cycle`) only extend dates and record the payment. A pro-rated charge raised by a subscription change would arrive as a different invoice reason and needs its own rule, so it is not read as a renewal.
- Events can arrive out of order (`invoice.paid` before `checkout.session.completed`), and Creator fetches the object from Stripe by id rather than trusting the payload. An MTA must carry `policy_revision_id` and its type in metadata that Creator can read for either event.
- MTA invoices need lines by price list code, credit notes for refunds and credits, and subscription updates. These are new Creator work (MTA-D21), not the V1 handler.

## 14. Documents, email and revision history

### Associate/membership-only [SOURCE]

Email a **Membership Adjustment Letter** listing all approved changes and their costs. Additional branches also require the branch certificate and registration on the appropriate Guild register.

### Insurance revisions [SOURCE]

Email the **Guild Membership Insurance Adjustment Receipt** with a list in the email body of *all relevant documents*. Include:
- Membership Adjustment Letter instead of the initial Membership Acceptance/Renewal Letter.
- **Endorsement Schedule** instead of the initial Insurance Schedule.
- Relevant unchanged and newly required policy wordings, General Terms, Statement of Fact, property definitions, membership certificate and other affected cover documents according to actual policy content.

The eight-PDF sample email is illustrative; do not send every attachment to every policy regardless of applicability.

The Membership Adjustment Letter lists the financial elements of **this transaction**, while the Endorsement Schedule shows cover details, current/revised terms, the previous cumulative paid position, endorsement premium/IPT and revised cumulative position. Preserve the existing unchanged cover sections and endorsements.

### Cancellation documents [SOURCE]

- **A. Guild Membership Insurance Cancellation Receipt** email, attaching B and C.
- **B. Membership Cancellation Letter** (dynamic): effective date, insurance dates, unused premium and IPT, cancellation fee, total refund. Needs a separate membership-fee refund line for cooling-off cancellations (section 1A).
- **C. Cancellation Schedule** (dynamic): as the Endorsement Schedule, with the period ending on the cancellation date and a Refund amount column instead of an Endorsement amount column.
- **D. Membership Cancellation Letter 2**: used when the GBP 10 fee exceeds the refund.

### Policy wordings and links [SOURCE]

The twelve wordings are now supplied, which unblocks AL-INS-039. "Links & Policy documents for customer journey.xlsx" defines which wording is linked at each journey step and which are attached to acceptance, renewal and adjustment emails by cover. The MTA journey and emails must use the same mapping (section 15A lists where the links are set in Portal V2).

### Portal records [SOURCE + DESIGN]

- [SOURCE] Display **all revisions throughout the policy term** and all related downloadable documents.
- [DESIGN] Each history item shows date requested, effective date, changed sections, reference, status, amount, document versions and a link to its record.
- [DESIGN] Keep former schedules, older wordings and superseded revisions in an immutable historical view; do not overwrite the old files.
- [DESIGN] Show generation/delivery error states and a contact path; do not represent an unavailable schedule as successfully issued.

## 15. Proposed route/component placement (Portal V2)

**Existing V2 routes (reviewed on main):**
- Membership: /membership, /membership/:id, /membership/buy (with ?renew= and &change=upgrade) and /membership/manage/:id (MembershipManagement in SchoolWorkspace.jsx: Details, Add-ons and Invoices tabs, Renew button)
- Insurance record: /insurance/:id
- Records: /records/:kind/:id
- Documents: /documents
- Checkout: /pay/:service/:recordId and /payment-return
- Portal uses HashRouter in deployed client examples, such as /app/#/membership/manage/:id.

**Proposed routes, NOT implemented:**
- /membership/manage/:dealId/changes/new : prefilled MTA composer
- /membership/manage/:dealId/changes/:revisionId : draft/quote/status/revision detail
- /insurance/:policyId/changes : filtered policy adjustment history, if needed

**Proposed frontend integration:**
- Extend MembershipManagement (apps/portal/src/SchoolWorkspace.jsx) with contextual change actions, insurance cover summary and a revisions tab.
- Keep existing details/add-ons/invoices functionality working; do not regress membership renewal or item purchases.
- Add dedicated MTA components and a typed adapter to apps/portal/src/services/api.js, gated until backend endpoints exist.
- Extend DocumentsPanel / existing authorised WorkDrive services to present revision-specific documents.
- Extend apps/portal/src/App.jsx routing; keep selected tab and intended action across authentication, record views and payment return.
- Reuse the existing V2 checkout display pattern but only with a new approved MTA quote/fulfilment contract.
- Separate customer permissions and UI from widgets/crm/mta-management (staff widget).

**Proposed backend service boundary:**
Portal-specific authenticated context, current policy snapshot, quote, revision draft/save/read, declarations, referral, checkout initiation, settlement status and documents. Backend verifies Contact ownership and enforces role/eligibility for every write. The MTA staff widget may consume common domain services through separately authorised staff endpoints.

**Not currently present:** dedicated /portal/mta routes, MTA state machine, insurer-approved MTA pricing and application worker, replacement-policy settlement and revision document generation. Neither this spec nor the CRM scaffold implements them.

## 15A. Portal V2 capability baseline (main at 8c85ca1, 24 October 2026)

There is **no MTA code on any branch**. The MTA Management widget is a placeholder that makes no CRM calls. The table below records what each journey can reuse and what must be built. Changes since 0.2 (from PR #60 to current main): prices are found in Stripe by lookup key; extra branches are yearly recurring inline lines; membership, insurance and accreditation all renew (yearly or monthly, with a schedule for monthly plans); named people and Advanced Electrolysis follow price list v2; a Contact is created when the member presses Pay or when a referred or stopped insurance application is recorded; every inline Stripe line carries its price list code.

### Reusable as built

| Building block | Where | Use in MTAs |
| --- | --- | --- |
| Insurance questions, help text and pop-ups | apps/portal/src/insuranceInputs.js, InsuranceFields.jsx | The five "how do you work" options; the employee/subcontractor wording (matches the workbook text exactly); Business Equipment tiers GBP 5k to 20k; Employers' Liability tiers 1, 3 and 5; Salon wage roll figure; treatment and teaching options; contents questions and declarations. Needs an edit mode that prefills current cover |
| Rating tables | functions/beauty_guild_api/src/insurance.js (calculateQuote) | Annual price of each cover row, now on price list v2 (named employees with the GBP 55.00 membership fee, subcontractors, Advanced Electrolysis GBP 30.00). The MTA engine pro-rates the difference between the current and proposed rows |
| Price lookup | checkout.js, catalogue.js, plans.js | Fixed items (MEM-BRANCH, MEM-BUNDLE, MEM-CERT, MEM-BADGE, MEM-STICKER, the membership fees) are read from Stripe by lookup key. FEE-MTA and FEE-CANCEL exist in Books; the portal does not yet look them up |
| Monthly plan rule | plans.js | Yearly price plus GBP 1.50 admin fee, divided by 12, rounded up; `ensureSchedule` and the portal's own Stripe webhook manage the 12-month schedule. An MTA must reuse this rule for monthly payers (section 13A) |
| Underwriting rules | insurance.js (evaluateRules) | More than four named people is already a REFER, matching "call the office". Turnover, wage roll, contents, buildings, Business Interruption and Property Away limits reused as is |
| Flood, subsidence and sanctions checks | riskChecks.js | Premises address changes for contents and Business Equipment |
| Start date window | catalogue.js (resolveStart, START_WINDOW_DAYS 30) | Reuse the 30-day window. The end date must be the existing policy end, not the anniversary that resolveStart returns |
| Checkout with computed amounts | checkout.js, inline price_data | Pro-rated lines, IPT line and fee line, each carrying its price list code in product metadata. Needs a new metadata type, and a subscription change in addition to the payment (section 13A) |
| Membership items mid-term | catalogue.js, membership_addon service; MembershipManagement Add-ons tab | Already correct: flat price, no pro-rata, no fee |
| Membership extensions read | GET /portal/management/memberships/:id/extensions | Current branches and items on the summary |
| Records and WorkDrive documents | records.js, documents.js, DocumentsPanel.jsx | Revision history and documents need per-revision folders under the policy |
| Declarations record | insurance.js (createRecords) | Same record, linked to the revision |
| Call-the-office message | insuranceInputs.js (CALL_OFFICE) | Refund and downgrade pop-ups |

### Not built

| Requirement | Gap |
| --- | --- |
| Current cover summary with Edit and Add | records.js returns the Insurance_Policy header only. A new read of Insurance_Extension, Insured_People, Insured_Premises and Declarations for the policy is needed |
| Associate statement and four actions; Full member actions | Not present on the Membership card, record page or MembershipManagement |
| Change basket with cross-sell before checkout | Not present |
| Mid-term additional branch, pro-rated | Branch is only sold at join or renewal, as an inline yearly line at the live MEM-BRANCH amount. Needs an inline pro-rated amount for the rest of the term and the branch added to the subscription |
| Changing or ending a subscription | Nothing changes an existing Stripe subscription or schedule after purchase. MTAs, upgrades, downgrades and cancellations all need it (section 13A) |
| Creator handling of MTAs | The Creator payments app is being rebuilt and covers payments first. No MTA, credit note or subscription-change handling exists (MTA-D21) |
| Delta pricing, fee, credits, quote versioning | Not present |
| One effective date per revision; end date fixed to policy end | Not present |
| Associate upgrade with credit (section 8A) | Insurance refused for Associates (409 INSURANCE_NEEDS_FULL_MEMBERSHIP); upgrade gives no credit and does not end the Associate subscription |
| Salon turnover and wage roll wording with policy dates | Current wording says "for the next 12 months" |
| Revision history and documents per revision | Not present |
| Phone and email self-service | My Profile is a placeholder. Contact resolution depends on the verified email matching the CRM Contact, so an email change must update Catalyst and CRM together or the member loses access to their records |
| Policy wording links | POLICY_WORDING (insuranceInputs.js) and policyDocuments (legal.js) name the documents but have no links. POLICY_WORDING has no entries for General Terms and Conditions or the two Property Definitions documents |

[DECISION] MTA-D19: in the new-business journey Portal V2 offers Money, Buildings, Business Interruption and Property Away to any Salon applicant. The workbook says a member adding Contents for the first time may be offered these "as they wouldn't have had this option in the original customer journey", which implies they depend on Contents. Confirm the intended rule for both journeys.

## 16. States and customer messaging (proposed)

| Backend/business condition | Customer label | Action |
| --- | --- | --- |
| No active eligible term | Changes unavailable | Show current records, ask Guild |
| Draft changes | Draft | Resume or discard |
| Quote ready / eligible | Review your changes | Continue declarations/checkout |
| Referred or stopped | Guild review required | Contact Guild, no payment |
| Awaiting Checkout | Awaiting payment | Continue/retry checkout |
| Paid but webhook/application pending | Processing your change | Do not display as active |
| Approved for future effective date | Scheduled | Show effective date and existing active cover |
| Applied and documentation complete | Completed | Updated cover + revision documents |
| Downstream failure | We're completing your change | Support/retry path; never false success |
| Withdrawn/cancelled proposal | Cancelled | History retained; no cover changed |

These labels are suggested. Map to actual CRM statuses after verifying layouts, Blueprints and Creator webhook transitions.

## 17. Acceptance scenarios

| ID | Customer journey and acceptance |
| --- | --- |
| CP-MTA-01 | Associate sees no-insurance description, membership dates and four actions. |
| CP-MTA-02 | Add branch quotes prorated GBP 15 annual amount, no GBP 5 fee, creates certificate/register/letter after fulfilment. |
| CP-MTA-03 | Buy bundle/badge/sticker/certificate at flat non-prorated quantities without MTA fee. |
| CP-MTA-04 | Customer can add a second eligible change before checkout with one consistent financial summary. |
| CP-MTA-05 | Insurance summary pre-fills every current cover and can add omitted eligible cover. |
| CP-MTA-06 | Named people limit of four enforced for customer self-service; all required classification information captured. |
| CP-MTA-07 | Removal/net refund directs to Guild, preserving existing live cover. |
| CP-MTA-08 | Named-person swap with payable net difference uses correct delta and one approved adjustment fee. |
| CP-MTA-09 | New treatment or teaching selections display applicable qualification rules, wording and pro-rata price. |
| CP-MTA-10 | Non-Salon equipment and EL upgrades use current tier -> revised tier delta; downgrades refer. |
| CP-MTA-11 | Salon turnover/wage-roll and property changes recheck underwriting and premises risk. |
| CP-MTA-12 | Different insurance effective dates cannot be combined in one revision; future date limited as approved. |
| CP-MTA-13 | Every required insurance declaration is repeated and stored against the revision. |
| CP-MTA-14 | Quote shows IPT, fees, credits, due-now and cumulative totals distinctly. |
| CP-MTA-15 | Email change re-verifies login; name/trading/correspondence address remain non-editable. |
| CP-MTA-16 | Stripe return alone cannot activate cover; late/duplicate webhook does not duplicate a revision. |
| CP-MTA-17 | Future-dated paid change remains scheduled until effective date. |
| CP-MTA-18 | Adjustment letter, endorsement schedule and applicable wordings are revision-specific and historically accessible. |
| CP-MTA-19 | Browser refresh, navigation back and deep link preserve correct member/record/tab context without disclosing another member's data. |
| CP-MTA-20 | Salon/Non-Salon replacement charges the net of the old-policy refund and the new full-year price plus GBP 5; checkout is enabled only after MTA-D04 is signed off; old/new policy lineage and bordereau reason are recorded. |
| CP-MTA-21 | Failed payment, document generation or incomplete backend processing has a safe recovery state; no false active cover. |
| CP-MTA-22 | Mobile and keyboard navigation work across review, declarations and checkout handoff. |
| CP-MTA-23 | Associate member sees "Upgrade to Membership with Insurance"; the quote summary shows insurance, Associate refund and net price; Full membership starts on the insurance start date and runs 12 months; no cancellation email. |
| CP-MTA-24 | Adjustment fee is added to a payable total and netted off a refund, matching the sample letters to the penny. |
| CP-MTA-25 | Pro-rata amounts reproduce the sample endorsement (GBP 196.15 premium, GBP 23.54 IPT for GBP 20,000 Business Equipment from 07/10/2026 to 29/09/2027) once the basis is confirmed. |
| CP-MTA-26 | A cancellation processed by staff shows the correct status, dates and Cancellation Schedule in the portal; Letter D is used when the fee exceeds the refund. |
| CP-MTA-27 | Every policy wording in the journey and the adjustment emails opens the supplied document for the cover held. |
| CP-MTA-28 | Changing login email keeps access to all records; name, trading name and correspondence address stay read-only. |
| CP-MTA-29 | Yearly payer adds a person or branch: the pro-rated amount is charged once now, and the next renewal is for the new yearly total. Retrying does not charge twice or add the line twice. |
| CP-MTA-30 | Monthly payer makes a payable change: the remaining monthly payments change from the agreed point, the schedule still drops year-one lines at payment 13, and nothing is repeated or lost. |
| CP-MTA-31 | A cancellation, downgrade or Associate upgrade processed by staff stops or replaces the Stripe subscription, ends any monthly schedule, and no further renewal is taken. |
| CP-MTA-32 | An MTA payment is recorded by Creator as an MTA (not a renewal or a new activation), with invoice lines by price list code, whichever of invoice and checkout events arrives first. |
| CP-MTA-33 | A new price from price list v2 (a person fee, Advanced Electrolysis, the GBP 5 fee) is read from Stripe by lookup key, and changing the Stripe price changes the quote with no deployment. |

## 18. Decisions blocking a fully build-ready specification

Status as at 24 October 2026 (v0.3). "Evidence" means the sample documents point to an answer that still needs confirming. "Answered" means price list v2, agreed with the Guild on 21 October, settles it.

| ID | Required decision | Status | Suggested owner |
| --- | --- | --- | --- |
| MTA-D01 | Approve the customer self-service vs Guild staff permission matrix, including neutral-price swaps and cover changes with no premium difference (is the GBP 5 fee charged?). | Open | Guild |
| MTA-D02 | Confirm the pricing table used for MTA calculations, IPT-inclusive treatment figures and differences from V1 rates. | Mostly answered by price list v2 (D12, D13, D15 closed). Left: confirm the MTA engine reads the same table and codes | Guild / Insurer / Finance |
| MTA-D03 | Sign off proration day-count, start/end inclusive treatment and rounding; reconcile the insurer GBP 30 minimum clause. Also: is the GBP 55.00 named employee membership fee pro-rated or charged in full mid-term (section 7)? | Evidence: days remaining / 364 (section 1A). Employee fee question new | Guild / Finance / Insurer |
| MTA-D04 | Cancellation and replacement refunds: the GBP 30 minimum non-refundable premium (General Terms and Conditions condition 7) and "no refund of membership fees" (Terms of Business) both conflict with the Cancellations pack. | Rules supplied; conflict open | Guild / Insurer |
| MTA-D05 | Confirm refund authority, credit notes, Books integration, and what to show before a Guild refund decision. | Open | Finance |
| MTA-D06 | Confirm eligibility/maximum advance dates for all affected categories, same-day and branch-change effective date. | Open | Guild / Insurer |
| MTA-D07 | Confirm exact approved declarations, treatment requirements, conditional property screening and wording links. | Wordings supplied; declarations open | Guild / Insurer |
| MTA-D08 | Approve document templates, attachments by cover, register update, email and WorkDrive versioning. | Templates supplied; Letter B membership line to fix | Guild |
| MTA-D09 | Verify current CRM Policy_Revisions/Extensions relationships, staff approval flow and Creator/Stripe webhook implementation. | Open | CRM/backend |
| MTA-D10 | Confirm whether Guild wants portal-saved referred requests or only a call-office message. | Open | Guild |
| MTA-D11 | Approve Portal V2 component placement, navigation and customer-facing labels before coding. | Open | Product owner |
| MTA-D12 | Advanced Electrolysis: GBP 30.00 net or GBP 28.00 net? | **Closed.** GBP 30.00 net (GBP 33.60 with IPT), price list v2; built in Portal V2 | Guild / Insurer |
| MTA-D13 | Salon Medical Malpractice premium for turnover up to GBP 100,000: GBP 75.00 or GBP 100.00? | **Closed.** Bands of GBP 75, GBP 100 and GBP 150 confirmed, price list v2 | Guild / Insurer |
| MTA-D14 | VAT treatment of the GBP 5 adjustment fee, GBP 10 cancellation fee and GBP 10 duplicate documentation fee, for the Books items. | **Partly answered.** GBP 5 (FEE-MTA) and GBP 10 (FEE-CANCEL) include VAT and exist in Books. The GBP 10 duplicate documents fee is not on the price list, so it is still open | Finance |
| MTA-D15 | Named employee and subcontractor pricing at new business versus MTA, for both routes (section 7). | **Answered.** Price list v2: non-Salon employee GBP 91.40, Salon employee GBP 55.00 fee only, non-Salon subcontractor GBP 16.80, Salon subcontractor nothing. Whether the GBP 55.00 fee is pro-rated mid-term moves to MTA-D03 | Guild / Insurer |
| MTA-D16 | Associate upgrade: refund calculation basis and whether the joining fee applies (section 8A). | New | Guild / Finance |
| MTA-D17 | Rules for members paying monthly: pro-rata charges, refunds and cancellations. | **Partly answered.** The Guild said MTA and cancellation prices are pro-rated by the action date and the policy end date, and the price list says monthly prices are amended going forward. Left: the monthly amount from the change onwards, how the current-term charge is taken, and refunds on a monthly plan (see MTA-D20). The packs themselves still assume annual payment | Guild / Finance |
| MTA-D18 | Fee when membership items or a branch are bought in the same transaction as an insurance change (proposed: one GBP 5 fee for the insurance revision only). | Open (was in section 6) | Guild |
| MTA-D19 | Whether Money, Buildings, Business Interruption and Property Away depend on Contents, in new business and MTAs (section 15A). | New | Guild |
| MTA-D20 | Subscription mechanics for an MTA (section 13A): when the new yearly or monthly amount starts, how a monthly schedule is updated, how the renewal date is kept against the policy anniversary (up to 30 days apart today), and what a cancellation or downgrade does to the subscription and schedule. | New | Guild / Finance / A2Z |
| MTA-D21 | Creator payments app scope for MTAs: invoices by price list code, credit notes, subscription updates, and which side (portal function or Creator) changes the Stripe subscription. Creator covers payments first; mid-term changes come afterwards. | New | A2Z / Creator owner |

## 19. Implementation/release sequencing (proposal only)

1. **Read-only MTA context and revision history** from verified records; no edits or payment.
2. **Membership branch and item changes**, with server-calculated quote and agreed letter/certificate fulfilment.
3. **Positive-value insurance MTAs** (people, treatments, teaching, equipment, EL and permitted Salon covers) with full underwriting, declarations and checkout.
4. **Referral and refund workflows**, finance/CRM handover, credit and negative amendments.
5. **Policy replacements** after cancellation rules approval.
6. **End-to-end document, reconciliation, audit, mobile/accessibility and exception UAT.**

The work packages, dependencies and build order are expanded in [docs/delivery/mta-build-scope.md](../../docs/delivery/mta-build-scope.md). Each phase needs a separately reviewed implementation PR and sandbox integration tests. This specification does not extend the current Portal V2 delivery baseline automatically, modify CRM, deploy Catalyst functions, authorise prices or merge any code.
