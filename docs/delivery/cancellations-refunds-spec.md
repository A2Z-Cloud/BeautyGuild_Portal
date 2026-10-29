# Cancellations, downgrades, upgrades and refunds: cross-system specification

**Status:** draft v0.1, 29 October 2026. **Nothing in this document is built, approved or tested.** It specifies work across the Catalyst function, the customer portal, the CRM Staff Workspace widget, Stripe, Creator, the CRM and Zoho Books. Section 2 separates what the project owner has decided from what is only suggested and still needs the Guild (Helen) or finance.
**Source:** the Guild's `Cancellations.xlsx` (four scenarios, an upgrade journey and the document samples), plus the owner's answers of 28 and 29 October 2026.
**Related:** [creator-payments-app.md](creator-payments-app.md) (the Creator app this extends), [mta-r3-plan.md](mta-r3-plan.md) (revisions, the pattern reused here), [vouchers-creator-spec.md](vouchers-creator-spec.md), [../api-contracts/stripe-metadata.md](../api-contracts/stripe-metadata.md), [../api-contracts/staff-api.md](../api-contracts/staff-api.md), [staff-api-handoff.md](staff-api-handoff.md). The widget side is in `widgets/crm/beauty-guild-staff-workspace/CANCELLATIONS-AND-UPGRADES.md` on the Slate branch.

## 1. Scope

| Scenario | Who does it | Membership fee refund | Insurance premium and IPT refund | £10 cancellation fee | Email and documents |
| --- | --- | --- | --- | --- | --- |
| **S1 Cancel Associate** | Staff, in the CRM (not online) | None by default. Staff may override with a full or partial refund | None (no insurance) | No | None |
| **S2 Upgrade Associate to Full** | **Online by the member**, and by staff in the CRM | Credited against the new membership (net charged) | None | No | None for the old membership. The member gets the normal full membership acceptance email |
| **S3 Cancel Full** | Staff, in the CRM | None by default. Staff may refund in full or pro-rata manually | Pro-rata | Yes, taken off the refund | Cancellation email with a letter and a schedule (defined separately) |
| **S4 Downgrade Full to Associate** | Staff, in the CRM | As S3 | Pro-rata | Yes | As S3 |

Within 14 days of policy inception a Full membership is refunded in full with no £10 fee (the **cooling-off** rule, section 3.5).

**Out of scope until the client supplies it:** accreditation, extra branches, named employee fees, add-ons (badges, certificates, stickers, bundles), directory or designated-letter removal, and the document designs. Section 12 lists how each is protected in the meantime (it must be refused or surfaced, never silently mishandled).

## 2. Decisions and assumptions

| # | Point | Status | Position |
| --- | --- | --- | --- |
| D1 | Cancelling ends the Stripe subscription | **Decided** (owner, 28 Oct) | End it at the effective date with **no automatic proration**. We calculate every refund, so Stripe must not credit anything itself |
| D2 | Upgrade credit | Suggested | Unused part of the Associate **membership fee actually paid**, pro-rata by days, rounded down. Joining fee, admin fee and add-ons are not credited. Never below a net of £0 |
| D3 | Term length | **Decided** (matches the portal) | End date = start date + 364 days (365 days counting both ends). The Guild's example (1 April 2026 to 31 March 2027) is this rule |
| D4 | Upgrade quote summary | Suggested | Insurance quote, Full membership, **less the refund due on the Associate membership**, then **total to pay today** (the Guild's sheet breaks off at "and then") |
| D5 | Rounding | Suggested | Money refunded or credited rounds **down** to the penny. Money charged rounds **up** (as monthly plans already do) |
| D6 | Monthly payers | Suggested | Never refund more than was paid: refund `max(0, paid to date - value used)` |
| D7 | Cooling off | Suggested | Runs from the **insurance start date**. A cancellation on or before **start + 14 days** qualifies. Full Membership with insurance only. Refunds membership fee, premium and IPT. **Joining fee and admin fees are not refunded** |
| D8 | Downgrade dates | **Decided** (owner) | The Full membership is shortened to the cancellation date. The Associate runs from the next day to the original Full expiry |
| D9 | The £10 fee | Suggested | Netted from the refund, never billed. If it is more than the refund, the refund is £0 and nothing is owed |
| D10 | Letters, the "ref" column, uncovered items | Parked (owner) | Not designed here |
| D11 | Who calls Stripe | Suggested | The **Catalyst function** calls Stripe for staff-initiated cancellations and refunds (it holds the numbers and the key). **Creator** calls Stripe only to end the old Associate subscription after an upgrade is paid (the trigger is its event). Needs the Creator owner's agreement (section 8) |
| D12 | Where "what was paid" comes from | Suggested | **Stripe** (the paid invoices and their lines by SKU) for money. **CRM** for dates and the policy premium. They must agree, or the cancellation is refused |

Questions for the Guild before live use: whether the joining fee is refunded in cooling off, whether a downgrade inside cooling off makes the Associate free or charged, whether the Associate carries on automatically after the downgrade period (section 4.4), and the VAT treatment of the £10 fee (finance).

## 3. The calculation (one engine, in the Catalyst function)

The widget and the portal **never calculate**. They call the function and show what it returns. The rules below are the function's, and the tests in section 11 are written from them.

### 3.1 Definitions
- **Term days** = days from the start date to the end date, both counted (normally 365).
- **Used days** = effective date minus start date. **Unused days** = term days minus used days. The effective day itself counts as unused.
- **IPT** = 12% of the premium, as on the Guild's schedule (£100 premium, £12 IPT).
- All amounts are held and calculated in **pence**.

### 3.2 Insurance refund (S3, S4), annual payer
```text
premium_refund = round down ( annual_premium_net x unused_days / term_days )
ipt_refund     = round down ( premium_refund x 12% )
insurance_refund = premium_refund + ipt_refund
```

### 3.3 Insurance refund, monthly payer
```text
paid_net   = premium net actually paid so far
used_net   = round up ( annual_premium_net x used_days / term_days )
premium_refund = max(0, paid_net - used_net)
ipt_refund     = min( IPT actually paid, round down ( premium_refund x 12% ) )
```
Example: three instalments of £9.34 (£28.02 paid, premium and IPT together) and 61 days used (value used £18.72) leave £9.30, which is below the £10 fee, so no refund is due.

### 3.4 Totals
```text
membership_refund = 0 by default, or the staff override (never more than the membership fee paid)
gross_refund      = membership_refund + insurance_refund
fee_applied       = 0 in cooling off, otherwise min( £10.00, gross_refund )
net_refund        = gross_refund - fee_applied          (never below 0)
no_refund_due     = gross_refund > 0 and net_refund = 0
```

### 3.5 Cooling off
If the cancellation date is on or before the insurance start date plus 14 days: `membership_refund` = the membership fee paid, `premium_refund` = the premium paid, `ipt_refund` = the IPT paid, `fee_applied` = 0. Joining fee and admin fees stay with the Guild (D7, to confirm).

### 3.6 Upgrade (S2)
```text
credit  = round down ( associate_membership_fee_paid x unused_days / term_days )
        (never more than was paid for the membership fee; monthly payers: max(0, paid - value used))
net_to_pay = max(0, new_full_total - credit)
```
Unused days run from the upgrade date (the new insurance start date, up to 30 days ahead) to the Associate end date. The new Full membership runs from the upgrade date for the full term (D3) and is **not** pro-rated. No £10 fee.

### 3.7 Worked examples (these become tests)

| Case | Working | Result |
| --- | --- | --- |
| Upgrade credit | Associate fee £55.00, 1 Jan to 31 Dec 2026 (365 days), upgrade 1 April: 90 used, 275 unused | credit **£41.43** (4143 pence) |
| Cancel Full, annual | Premium £100.00, IPT £12.00, policy 18 May 2026, cancelled 18 July: 61 used, 304 unused | premium £83.28, IPT £9.99, total £93.27, less £10 fee: **£83.27** |
| Fee larger than refund | Unused premium and IPT £8.00 | gross £8.00, fee applied £8.00, net **£0.00**, `no_refund_due` |
| Cooling off | Cancelled 25 May 2026 (7 days after a 18 May start) | membership fee, premium £100.00 and IPT £12.00 refunded, **no fee** |
| Cooling off boundary | Policy start 18 May 2026 | 1 June 2026 qualifies, 2 June does not |
| Monthly payer | 3 x £9.34 paid, 61 days used | refund before fee £9.30, net **£0.00** |
| Guild upgrade example | £20 due back, £85 for Full | charge **£65** |

## 4. Who does what

| Piece | Responsibility |
| --- | --- |
| **Catalyst function** | The engine; the staff cancellation endpoints; the upgrade purchase type for the portal and for staff; Stripe calls for cancellation and refunds; the cancellation record and its audit; idempotency |
| **Customer portal** | Only S2: the dashboard button, the insurance quote journey, the quote summary with the credit and net, payment |
| **Staff widget** | S1, S3, S4 in the CRM, and the staff-assisted S2. Shows the function's breakdown, takes staff input (date, override, reason, confirm). Never calculates |
| **Stripe** | Subscription ends, refunds, a one-off credit coupon for the upgrade |
| **Creator** | Records the outcomes: subscription ended, refunds, the upgrade payment; pushes Books credit notes; ends the old Associate subscription after a paid upgrade |
| **CRM** | The cancellation record, membership and policy status changes, documents and the email (defined separately), permissions for overrides |
| **Books** | Credit notes and the cancellation fee item |

### 4.1 Cancel (S1, S3) in order
1. Staff open the cancellation panel and call **quote** (read only). The function reads the membership, policy, the paid Stripe invoices and the subscription, and returns the full breakdown.
2. Staff confirm with the net figure they saw. The function **recomputes**; if the result differs it refuses (`QUOTE_CHANGED`) and shows the new figure.
3. The function writes the cancellation record (status Pending), then **ends the Stripe subscription** (D1), then creates the **refunds**, recording each step. A failed step leaves the record resumable (`Refund Failed`), never half silent.
4. It updates the CRM (section 6) and adds the audit Note.
5. Stripe's events reach Creator, which records the refund and pushes the Books credit note.

### 4.2 Upgrade (S2) in order
1. The member (portal) or staff (widget) gets a **quote** for the upgrade: the insurance quote, the Full membership, the credit and the net.
2. The function creates a Checkout Session for the **net** (the credit is a one-time `amount_off` coupon on the first invoice, the same mechanism as the additional-branch coupon). The metadata carries the upgrade keys (section 7.3).
3. On the first paid invoice Creator activates the new Full membership (as for any new membership) and **ends the old Associate subscription at the upgrade date** and marks the old membership Upgraded (D11).
4. No cancellation email and no documents for the Associate. The member receives the normal full membership acceptance email.
5. If the member does not pay, nothing changes: the Associate is untouched until payment.

### 4.3 Subscriptions that hold more than membership
A subscription can carry accreditation, extra branches and named employee fees as well as membership and insurance. **Cancelling must never silently cancel what the Guild did not ask to cancel.** Where a subscription holds lines outside the cancelled membership and insurance (accreditation is the known case), the function must remove only the cancelled subscription items, or refuse and tell the office. This is open (section 12).

### 4.4 Downgrade (S4)
Same as S3, plus the CRM creates the Associate membership from the day after the cancellation date to the original Full expiry. **No Stripe charge and no Stripe subscription** is created for that period (D8, with the free-or-charged question in section 2). What happens when that Associate period ends is open: it should not renew automatically without the member choosing to.

## 5. CRM

### 5.1 New: the cancellation record
A new module (suggested name **Membership_Cancellations**, an owner decision whether to reuse `Policy_Revisions` instead; the Associate cases have no policy, which is why a separate header is proposed). One record per cancellation, downgrade or upgrade.

| Field | Notes |
| --- | --- |
| Name (auto), Contact, Membership (Deal), Policy (lookup, optional) | |
| Scenario | Cancel Associate, Cancel Full, Downgrade Full, Upgrade Associate |
| Status | Pending, Subscription Ended, Refunding, Refunded, Refund Failed, Completed, Cancelled (withdrawn) |
| Effective Date, Cooling Off (boolean) | |
| Lines JSON | Each line: code (SKU), name, `paid_pence`, `refund_pence`, tax treatment. Creator reads this to build the Books credit note, so no breakdown has to travel in Stripe metadata |
| Membership Refund, Premium Refund, IPT Refund, Fee Applied, Net Refund (pence or currency) | |
| Override Reason, Override By (user), Override Amount | An override needs a reason |
| Stripe Subscription ID, Stripe Refund IDs (JSON) | |
| Requested By (user), Created Time, Confirmed Time | |
| Documents Status, Email Sent (defined separately) | |
| Policy Revision (lookup, optional) | The cancellation revision on the policy |

### 5.2 Changes to existing records
- **Deals (membership):** a status for Cancelled, Downgraded and Upgraded; the end date shortened to the effective date; a link to the cancellation record. For a downgrade, a new Associate Deal from the next day to the original expiry, linked to the old one.
- **Insurance policy:** a cancelled status and cancellation date; its `Insurance_Extension` and `Insured_People` rows get `Effective_To` set and a cancelled status (never deleted); `Policy_Revisions` gets a cancellation revision with the deltas (as the MTA pattern), so the schedule can show amount paid, refund and revised total.
- **Do not touch `Payment_Status`** and keep the INS Policy Activation workflow, and any workflow on these modules, from firing a document or an activation as a side effect of a cancellation. This is the same gate as MTAs (mta-r3-plan.md section 5), and it must be checked before any write is switched on.
- **Permissions:** only approved roles may set an override. Field-level permissions on the override fields, as in WORKFLOW-FIELD-EDITING.md.

## 6. Catalyst function: contracts

All new routes are **off by default** (`PORTAL_MEMBERSHIP_UPGRADE_ENABLED`, `PORTAL_CANCELLATIONS_ENABLED`), test-mode only, safe to repeat, and write a `staff_request` audit line and a CRM Note. Staff routes use the existing signed channel and role check ([staff-api.md](../api-contracts/staff-api.md)).

### 6.1 Staff
**`POST /staff/cancellation/quote`** (read only). Body: `contactId`, `membershipId`, `scenario` (`cancel_associate`, `cancel_full`, `downgrade_full`), `effectiveDate` (`YYYY-MM-DD`; default today), optional `membershipRefundPence` and `overrideReason`.

Response: `{ requestId, scenario, effectiveDate, coolingOff, membership: { paidPence, refundPence, overridden }, insurance: { policyId, start, end, termDays, usedDays, unusedDays, premiumPaidPence, premiumRefundPence, iptRefundPence } | null, feeAppliedPence, grossRefundPence, netRefundPence, noRefundDue, lines: [...], stripe: { subscriptionId, endsAt, refunds: [{ paymentIntent, amountPence }] }, warnings: [...], inputsHash }`.

**`POST /staff/cancellation`** (confirm). Same body plus `confirmNetRefundPence` and `inputsHash`. The function recomputes and refuses with `409 QUOTE_CHANGED` if the figures differ. Returns `{ cancellationId, status, steps: [...] }`. Repeating the call with the same inputs returns the same record.

**`GET /staff/cancellations?contactId=...`** lists a Contact's cancellation records. **`POST /staff/cancellation/retry`** (body `cancellationId`) resumes a `Refund Failed` record.

Errors: `422 INVALID_REQUEST`, `404 NOT_FOUND`, `409 QUOTE_CHANGED`, `409 ALREADY_CANCELLED`, `422 MIXED_SUBSCRIPTION` (section 4.3), `422 OVERRIDE_NOT_ALLOWED` (role or amount), `502 STRIPE_UNAVAILABLE`, `503 NOT_AVAILABLE`.

### 6.2 Upgrade (portal and staff)
A new service **`membership_upgrade`** in the existing quote and checkout: the same routes as other purchases (`POST /portal/checkout/quote`, `POST /portal/checkout`; for staff `POST /staff/quote` and `POST /staff/payment-link`). Input: `previousId` (the Associate membership, as a renewal names its predecessor), the insurance answers and start date, `billing`. The response adds a `credit` object (`{ amountPence, unusedDays, termDays }`) and the net total. Eligibility: an active Associate membership of the signed-in member (or the chosen Contact), start date up to 30 days ahead, the normal risk and referral rules, no cancellation or upgrade already in flight.

## 7. Stripe

### 7.1 Operations the function performs (test mode only; live needs a restricted key, section 10)
| Operation | Call |
| --- | --- |
| End a subscription at the effective date | `POST /v1/subscriptions/{id}` with `cancel_at`, `proration_behavior=none`. If effective now, `DELETE /v1/subscriptions/{id}` with `prorate=false`, `invoice_now=false` |
| Refund | `POST /v1/refunds` with `payment_intent`, `amount`, `reason=requested_by_customer`, metadata `cancellation_id`, `contact_id`, an **idempotency key** `cancel-{cancellationId}-{paymentIntent}` |
| Upgrade credit | A one-time `amount_off` coupon (`duration=once`, `max_redemptions=1`, name "Associate membership credit"), applied on the new Checkout Session. Reuses the branch coupon code path |

**Refund allocation:** refund against the subscription's paid invoices **newest first**, never more than each payment's refundable remainder, until the net refund is met. A refund appears in the customer's bank in 5 to 10 business days (the email says so).

### 7.2 Events Creator will see
`customer.subscription.updated` (`cancel_at` set), `customer.subscription.deleted`, `charge.refunded`, `refund.created`, `refund.updated`. Creator's endpoint must listen to these (they are not on it today). Refund events carry the metadata above, so Creator can find the cancellation record.

### 7.3 Metadata contract additions (upgrade)
`type=membership_upgrade` with `previous_membership_id` (the Associate Deal), `previous_subscription_id`, `credit_pence`, `upgrade_date`, and the existing membership and insurance keys. The 50 filled-key limit and the contract test in `stripe-contract.test.js` apply, so each new key must fit and be added to the generated contract.

## 8. Creator (the Creator owner must confirm each point)
1. **Subscription ended:** update the **Subscription** form status and end date from `customer.subscription.updated` and `.deleted`. Idempotent by event id.
2. **Refunds:** create a refund (credit) **Invoice Record** per Stripe refund id (no duplicates), linked to the Stripe invoice, the Subscription and the CRM cancellation record. Read the cancellation record's **Lines JSON** to build the Books lines. Set the cancellation record to Refunded once every refund has succeeded.
3. **Books push:** a credit note per refund with the same retry and Failed view as invoices (creator-payments-app.md section 5 step 6). Items by SKU through `get_books_item`, never created. The membership refund splits 38/55 and the rest, in reverse, as in section 3 of that brief; premium and `INS-IPT` lines are negative; the cancellation fee is its own item (section 9).
4. **Upgrade payment:** on the first paid invoice with `type=membership_upgrade`: activate the new membership as normal; mark the old Associate Deal Upgraded with its end date; **end the old Associate subscription at the upgrade date** (needs a Stripe key able to update subscriptions, restricted to that, or the function does it through a second trigger: decision D11); apply the credit line to the Invoice Record as a discount.
5. **Do not** collect or refund net credits on a payment (the rule in creator-payments-app.md section 6.4 stands: refunds are the function's, on a cancellation).
6. **Failures:** a failed refund event leaves the cancellation record `Refund Failed` and shows in a Failed view for the office.

## 9. Books
- **Credit notes** for refunds (not manual journals). The invoice number logic is unchanged.
- **A new item for the cancellation fee** (suggested SKU `FEE-CANCEL`), created by finance. Its **VAT treatment is open** (standard-rated or outside the scope). Only `fee_applied` is recorded (the fee never exceeds the refund).
- IPT on a refund posts to the same IPT payable account, reversed.
- The refund of a membership fee reverses both Books items (zero-rated and standard-rated).

## 10. Build order and gates

| Step | What | Needs |
| --- | --- | --- |
| 1 | The engine as pure functions with the section 3.7 cases as tests (no Stripe, no CRM) | Nothing. Can start now |
| 2 | `POST /staff/cancellation/quote` (read only) and the upgrade quote with a credit | Step 1 |
| 3 | The CRM module and fields; confirm no workflow misfires on the new records | CRM owner |
| 4 | The upgrade checkout (coupon, metadata, contract test) and the portal screens | Steps 1 to 3 |
| 5 | `POST /staff/cancellation` (confirm), Stripe cancel and refunds, retry | Stripe test key with refund rights, steps 1 to 3 |
| 6 | Creator handlers (sections 8.1 to 8.4) and the Books credit notes | The Creator payments app past its first full slice (the owner's sequencing) |
| 7 | The widget panels | Steps 2 and 5 |
| 8 | End-to-end in Development, Stripe test mode | All the above |

**Gate before any write is switched on:** the CRM workflows checked (section 5.2), Creator confirmed for 8.1 to 8.4, the Stripe refund and subscription calls proven in test mode, and the Guild's answers in section 2 recorded. **Live payments** also need a restricted Stripe key (refunds and subscription updates only) and a decision on where it is held, because the function accepts only `sk_test_` keys today.

## 11. Test plan (Development, Stripe test mode)
| ID | Scenario | Expected |
| --- | --- | --- |
| C-01 | Engine: each row of section 3.7 | The figures shown |
| C-02 | Cancel Full annual, pro-rata | Refund £83.27, fee £10, subscription ends, one refund, Books credit note |
| C-03 | Cancel Full in cooling off | Everything refunded, no fee, joining and admin fees kept |
| C-04 | Fee larger than refund | Net £0, `no_refund_due`, no Stripe refund made |
| C-05 | Cancel Full, monthly payer | Never refunds more than paid; later monthly payments stop |
| C-06 | Cancel Associate, no override | No refund, no fee, no email, subscription ends |
| C-07 | Cancel Associate with a partial override | Refund as entered, reason required, role checked |
| C-08 | Downgrade | Full shortened, Associate created from the next day to the original expiry, no charge |
| C-09 | Upgrade, annual payer | Net charged, credit shown, old Associate ends at the upgrade date, no cancellation email |
| C-10 | Upgrade not paid | Associate untouched |
| C-11 | Confirm after the figures changed | `409 QUOTE_CHANGED` |
| C-12 | Confirm repeated | Same record, no second refund (idempotency key) |
| C-13 | Refund step fails | Record `Refund Failed`, resumable, subscription state recorded |
| C-14 | Subscription also holds accreditation | `422 MIXED_SUBSCRIPTION` (or only the cancelled items removed), accreditation untouched |
| C-15 | Duplicate and out-of-order Stripe events | Applied once |
| C-16 | A cancellation | No `Payment_Status` change, no activation or document workflow fires |
| C-17 | Staff without the role, or an override above what is allowed | Refused |

## 12. Open questions
**Guild (Helen):** joining fee in cooling off; a downgrade inside cooling off; whether the Associate renews after the downgrade period; whether cooling off applies to Associates; back-dating (suggested: today or later, back-dating needs a reason and approval); the approval limit for manual membership refunds; accreditation, extra branches, employees and add-ons on cancellation; the "ref" column; designated-letter removal.
**Finance:** VAT on the £10 fee; the IPT payable account name; credit note numbering.
**Creator owner:** D11 (who ends the old Associate subscription); the new events; Books credit notes.
**CRM owner:** module name and fields; status values for Deals; the workflow check; field permissions.
**Until answered, the function must refuse or surface:** a subscription that also holds accreditation (`MIXED_SUBSCRIPTION`), a membership with extra branches, employees or add-ons (a warning listing them, never silently dropped), and any cancellation where the Stripe amounts and the CRM disagree.
