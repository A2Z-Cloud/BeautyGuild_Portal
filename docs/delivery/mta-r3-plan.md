# MTA R3 | payable insurance changes, implementation plan

**Status:** plan for the build, 27 October 2026. Based on the build scope (v0.4), the customer spec (v0.5) and a review of the live Beauty Guild CRM (BGV5) done on 27 October. Nothing here is built except PR 82 (new-business persistence).
**Slice:** Non-Salon, yearly payers, additions and increases only. Salon property and turnover follow once their levels are saved (PR 82) and populated.

## 1. What the live CRM already has

| Module | Already there | Use in R3 |
| --- | --- | --- |
| Policy_Revisions | `Revision_Status` (Draft, Under Review, Quoted, Awaiting Payment, Approved, Scheduled, Applied, Withdrawn), `Change_Type`, `Change_Scope`, `Requested_Effective_Date`, `Applied_Effective_Date`, `After_Quote_ID`, `Premium_Delta_Net`, `VAT_Delta`, `IPT_Delta`, `MTA_Fee`, `Fee_Waived`, Policy and Membership lookups | The revision header, one per effective date |
| Insurance_Extension | `Policy_Revision`, `Effective_From`, `Effective_To`, `Status`, `Supersedes_Extension`, `Sum_Insured`, `Cover_Option` | Draft rows for new or changed cover; an increase supersedes the old row |
| Insurance_Policy | `Payment_Frequency` (Annual, Monthly), `Annual_Wage_Roll`, `Annual_Turnover` | Eligibility (Annual only) and Salon levels |

Fields still to add (small): `Stripe_Checkout_Session_ID` on Policy_Revisions; on Insured_People a `Policy_Revision` lookup and `Effective_From` and `Effective_To`. To confirm: the type and values of `Cover_Option` (needed for the Non-Salon Employers' Liability tier), and that `Applied_Effective_Date` and the lookups are editable by the portal's CRM connection.

## 2. Rules the build follows
- **Draft stays separate from live cover.** Draft and quote stages only create new rows (Status Draft, linked to the revision). Live rows are not edited. The portal never sets `Applied`, `Scheduled` or `Approved`: Creator does, after verified payment.
- **Eligibility:** `Payment_Frequency = Annual` and a policy in force. Monthly or unknown: save the request (Revision_Status Under Review, with the full answers) and tell the member to call the office. Stripe may be used to reconcile but is not the source of truth for eligibility.
- **Only a verified increase goes online.** The current level must be known (equipment `Sum_Insured`, Employers' Liability `Cover_Option`). If it is blank, or the policy pre-dates the persistence fix, the change goes to the office. This is the case for every policy created before PR 82 is live.
- **Pro-rata and fees:** remaining days over the days on the policy, both end days counted (`src/prorata.js`). Premium rounded to the penny, then IPT at 12% on the rounded total (rounding order still to confirm, MTA-D03). The GBP 5 fee (`FEE-MTA`, Stripe lookup key, including VAT, outside IPT) is charged per revision. Added employees also pay the pro-rated GBP 55.00 membership fee (`MEM-FULLNS-Y`).
- **Credit for an old level:** the amount recorded on the old row (`Premium_Net`), pro-rated for the days left, not today's table, so a price change does not change an old policy.
- **Swaps:** like for like carries the membership fee over (D25).
- **Dates:** up to 30 days ahead, never after the policy end, no back-dating in the portal. If a renewal already exists and the change starts in the last month, refer to the office (D23, recommendation).
- **Checks and declarations:** reuse `clean`, `evaluateRules`, the risk checks (sanctions on added names) and the four confirmations.

## 3. Revision lifecycle
| Revision_Status | Set by | When |
| --- | --- | --- |
| Draft | Portal | A saved request or an unquoted basket |
| Under Review | Portal | Referred, monthly, unverifiable level, or a request for the office |
| Quoted | Portal | A quote is made (`After_Quote_ID`, deltas, fee stored) |
| Awaiting Payment | Portal | Checkout opened (Stripe session id stored); resumable, expires with the session |
| Approved, Scheduled, Applied | Creator | After the verified payment: apply once, supersede rows, schedule future-dated cover |
| Withdrawn | Portal or staff | The member discards it, or the quote expires |

## 4. Build order (each its own reviewed PR, all behind the gate)
1. **PR 82 (open):** save levels, wage roll and payment frequency at new business. Needed first.
2. **R3-1 Quote engine, read only.** `POST /portal/insurance-changes/quote`: reads the cover (R1 `cover.js`), checks eligibility, prices additions and increases (pro-rata, credit, IPT, fee, membership fee), returns lines and a quote id. Writes nothing. Tests against the Guild's worked cases.
3. **R3-2 Revision drafts.** Creates the revision and its draft rows (linked, dated, `Supersedes_Extension` for increases), the save-for-the-office record, declarations against the revision. Writes only to draft rows.
4. **R3-3 Payment.** One checkout for a basket with several dated revisions (D24): one `FEE-MTA` line each, revision references compact in the metadata (type `insurance_change`, under the 50 key limit), the session id on the revision, resume and expiry as for quotes.
5. **R3-4 Screens.** Edit mode of the insurance questions with the current cover prefilled, one date, repeat declarations, review and pay, referral message, status and history.

## 5. The verification gate (nothing live until it is cleared)
Switches, all off by default: `PORTAL_INSURANCE_CHANGES_ENABLED` (the screens and quotes), `PORTAL_INSURANCE_CHANGES_WRITES` (revision and draft rows), `PORTAL_INSURANCE_CHANGES_PAYMENT` (checkout). Writes and payment stay off until:
1. The INS Policy Activation workflow, and any other automation on Insurance_Policy, Insurance_Extension, Insured_People or Policy_Revisions creation or update, is checked so draft rows and revisions cannot activate cover or send documents.
2. The Creator owner confirms the `insurance_change` handler: apply each revision once (key on the revision id), supersede rows, schedule future dates, set the status, handle duplicate and late webhooks.
3. The full lifecycle is run in Development with test data: quote, draft, pay, apply, and the cancel and expire paths, with the live cover unchanged until Applied.
4. `FEE-MTA` exists as a Stripe price (GBP 5, including VAT) and the new CRM fields exist.

## 6. Open points
- Type and values of `Cover_Option`; whether to add a tier field instead.
- The rounding order (D03) and whether the GBP 5 fee carries VAT detail Creator needs.
- Who creates the Stripe `FEE-MTA` price and the new CRM fields.
- Existing policies have no saved levels: confirm the Guild accepts that increases on them go to the office until a one-off backfill (a CRM task from the original quote answers, if kept) is done.
