# Beauty Guild | Customer Portal MTA Functional Specification

**Status:** Proposed for Guild, Finance and insurer review. Not approved for implementation or production.
**Version:** 0.1 | 19 October 2026
**Scope:** Authenticated customer-facing Mid-Term Adjustments (MTA) in Portal V2. Separate from the staff MTA CRM widget.
**System:** A2Z-Cloud/BeautyGuild_Portal, frontend under apps/portal and future secure MTA backend services.
**Terminology:** Customer-facing language should say "Make changes", "Your changes" and "Change history", rather than assuming members understand the acronym MTA.

## 1. Source basis and precedence

The following supplied material informs this draft:

- **MTA's.xlsx**: Summary, Associate MTA, Non-salon MTA and Salon MTA worksheets. Primary source for requested customer journeys, eligibility, amounts, fees, dates and documentation.
- **1. Membership Adjustment Letter.pdf**, **2. Guild Membership Insurance Adjustment Receipt.msg**, **3. Endorsement Schedule.pdf**: example adjustment confirmation and policy-version documentation.
- **CRM Cartographer JSON snapshot**: observed modules, fields and relationships. This is not proof of current CRM field permissions or automation behaviour.
- **BeautyGuild_Portal (main as reviewed on 19 October 2026)**: V2 route structure, MembershipManagement, records, document access, authenticated read services and existing checkout adapter.
- **beauty-guild-catalyst (V1)**: insurance questionnaire, rule logic, membership add-on journeys and pricing code to reconcile, not blindly import.
- **MTA Management widget workstream (PR #3)**: proposed shared MTA service and staff-only controls.

The workbook references separate **Cancellation rules/documentation** which were not among the supplied five review sources. Those replacement-policy decisions remain open. All illustrative prices and examples must be reconciled with the Guild-approved current pricing catalogue, insurer terms and Stripe/Books/Creator integration prior to live quoting.

Requirement classification throughout:
- **[SOURCE]** Directly requested in the MTA workbook or sample documents.
- **[DESIGN]** Recommended Portal V2 behaviour or technical design, subject to confirmation.
- **[DECISION]** Unresolved requirement, dependency or conflict.

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
| Add insurance to Associate membership | Yes | N/A | N/A | Separate new insurance quote/replacement route | Upgrade/cancellation rules require confirmation before payment |
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
| Salon <-> Non-Salon product switch | N/A | Conditional | Conditional | Replacement policy journey | Cancellation, refund, new full-year quote and approval rules not yet supplied |

**Interpretation:** "Yes" means requested self-service functionality, NOT that the existing V2 portal/API currently implements or has insurer approval for it. Where the sheet states that a reduction/refund requires calling the office, the portal must not independently execute the refund.

## 6. Membership-only changes

### Additional branches [SOURCE]

- Display primary and existing additional branches. Only present branches not already held.
- Price GBP 15 on an annual basis, **prorated for the remaining applicable membership term**.
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

Workbook-specific rate examples (annual basis, **confirm against current insurer/Books catalogue**):
- Non-Salon employee: GBP 85.00 including membership component GBP 48.60, premium GBP 32.50 and IPT GBP 3.90.
- Non-Salon subcontractor: GBP 15 premium + GBP 1.80 IPT.
- Salon employee: GBP 48.60 membership component; Salon subcontractor: no extra annual person price.
- Insurance MTA fee normally GBP 5 in addition (even where a Salon subcontractor adds no person premium, subject to finance approval).

Additions, and swaps where the net transaction is payable, are intended for online completion. Standalone removals and net refunds go to Guild staff.

### Advanced treatments and teaching [SOURCE]

- Show the five advanced treatment options carried over from the original journey: advanced electrolysis; microneedling/dermarolling; nose/cartilage piercing; microblading/SPMU/micropigmentation; dermaplaning.
- Display each approved price including IPT, requirements and explanatory pop-ups. The workbook screenshot uses GBP 33.60, GBP 200.76, GBP 15.85, GBP 200.76 and GBP 200.76 respectively; these are **reference screenshot values, not approved live backend rates**.
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

**[DECISION / BLOCKER]** The workbook explicitly delegates the detailed Associate-to-insured and Salon/Non-Salon cancellation calculations to a separate Cancellation document not included in the supplied MTA pack. Do not implement or permit checkout on those paths until the current cancellation/refund rules and insurer authorisation are supplied.

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
6. The GBP 5 adjustment fee, or an explicit exemption (Guild staff may waive it in CRM).
7. **Amount to pay now**, **Potential credit/refund requiring staff review**, and the revised cumulative insurance position where relevant.

[SOURCE] The workbook says normally charge GBP 5 for an insurance MTA but some upgrade instructions say "less the GBP 5 adjustment fee"; **do not infer addition versus deduction from those isolated sentences** without Guild confirmation. One change with no extra premium may still attract the fee depending on the final approved rule.

[DECISION] Reconcile the endorsement example, prorating/rounding rules and the insurer schedule's minimum-premium clause before coding rate outcomes.

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

- [DESIGN] Create/reuse a server-authorised Stripe Checkout Session linked to the exact MTA quote and revision. Reuse existing V2 checkout transport pattern but **do not route an MTA through the ordinary new membership/insurance purchase path**.
- [DESIGN] Check current eligibility, quote version, amount and user ownership again immediately before checkout.
- [DESIGN] Creator/Stripe webhook and reconciliation, not the return page, confirm payment. No duplicate charges/revisions on retries.
- [DESIGN] If the approved amendment is future-dated, settlement now must not activate added cover before that date.
- [DESIGN] A zero-premium revision with fee only, or a true zero-charge revision, needs an explicitly approved settlement path.
- [DESIGN] If user cancels checkout or payment fails, current cover is untouched and the draft can be resumed.
- [DESIGN] After successful application, update/supersede the relevant CRM cover records with linked history and initiate document generation. Recover from partial downstream failures without reapplying the transaction.

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

### Portal records [SOURCE + DESIGN]

- [SOURCE] Display **all revisions throughout the policy term** and all related downloadable documents.
- [DESIGN] Each history item shows date requested, effective date, changed sections, reference, status, amount, document versions and a link to its record.
- [DESIGN] Keep former schedules, older wordings and superseded revisions in an immutable historical view; do not overwrite the old files.
- [DESIGN] Show generation/delivery error states and a contact path; do not represent an unavailable schedule as successfully issued.

## 15. Proposed route/component placement (Portal V2)

**Existing V2 routes (reviewed on main):**
- Membership: /membership and /membership/manage/:id
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
| CP-MTA-20 | Policy replacement routes remain blocked until cancellation/refund rules are signed off; old/new policy lineage is preserved. |
| CP-MTA-21 | Failed payment, document generation or incomplete backend processing has a safe recovery state; no false active cover. |
| CP-MTA-22 | Mobile and keyboard navigation work across review, declarations and checkout handoff. |

## 18. Decisions blocking a fully build-ready specification

| ID | Required decision | Suggested owner |
| --- | --- | --- |
| MTA-D01 | Approve the customer self-service vs Guild staff permission matrix, including neutral-price swaps and fee-only amendments. | Guild |
| MTA-D02 | Confirm the pricing table used for MTA calculations, IPT-inclusive treatment figures and differences from V1 rates. | Guild / Insurer / Finance |
| MTA-D03 | Sign off proration day-count, start/end inclusive treatment, rounding and £5 fee precedence; reconcile insurer GBP 30 minimum clause. | Guild / Finance / Insurer |
| MTA-D04 | Supply and approve the separate Cancellation rules for Associate upgrade and Salon <-> Non-Salon product replacement. | Guild / Insurer |
| MTA-D05 | Confirm refund authority, credit notes, Books integration, and what to show before a Guild refund decision. | Finance |
| MTA-D06 | Confirm eligibility/maximum advance dates for all affected categories, same-day and branch-change effective date. | Guild / Insurer |
| MTA-D07 | Confirm exact approved declarations, treatment requirements, conditional property screening and wording links. | Guild / Insurer |
| MTA-D08 | Approve document templates, attachments by cover, register update, email and WorkDrive versioning. | Guild |
| MTA-D09 | Verify current CRM Policy_Revisions/Extensions relationships, staff approval flow and Creator/Stripe webhook implementation. | CRM/backend |
| MTA-D10 | Confirm whether Guild wants portal-saved referred requests or only a call-office message. | Guild |
| MTA-D11 | Approve Portal V2 component placement, navigation and customer-facing labels before coding. | Product owner |

## 19. Implementation/release sequencing (proposal only)

1. **Read-only MTA context and revision history** from verified records; no edits or payment.
2. **Membership branch and item changes**, with server-calculated quote and agreed letter/certificate fulfilment.
3. **Positive-value insurance MTAs** (people, treatments, teaching, equipment, EL and permitted Salon covers) with full underwriting, declarations and checkout.
4. **Referral and refund workflows**, finance/CRM handover, credit and negative amendments.
5. **Policy replacements** after cancellation rules approval.
6. **End-to-end document, reconciliation, audit, mobile/accessibility and exception UAT.**

Each phase needs a separately reviewed implementation PR and sandbox integration tests. This specification does not extend the current Portal V2 delivery baseline automatically, modify CRM, deploy Catalyst functions, authorise prices or merge any code.
