# Vouchers and discounts: what Creator must do

Written 27 October 2026 for A2Z Cloud. This is the Creator side of the vouchers plan in [vouchers-review.md](vouchers-review.md). It adds to [creator-payments-app.md](creator-payments-app.md), which until now said the invoice `discounts` array "stays empty for now". Nothing here is built in Creator yet. The portal side is in the pull requests for phases 0 to 4.

Scope: insurance, membership and accreditation. GTi redemption is parked. The £25 GTi voucher is still **issued** (section 5).

## 1. What the portal now sends

When `PORTAL_DISCOUNTS_ENABLED` is on and a discount applies, the Checkout session metadata has one extra key, `discounts`: a JSON array with one entry per discounted item. The exact, generated contract is in [stripe-metadata.md](../api-contracts/stripe-metadata.md).

```json
{"source":"referral|voucher|staff_waiver","code":"ACC-0140","reason":"Goodwill Gesture","applied_by":"customer|staff:<who>","sku":"MEM-JOIN","list_amount":"10.00","amount":"10.00"}
```

- `code`: empty for a waiver. For a referral it is the school's Accreditation Reference (also `school_id` and `accreditation_id`). A voucher also has `voucher_id`.
- `reason`: only on a waiver (Goodwill Gesture, Complaint, Upgrade, Promotion, Payment Problem, Other), with an optional note.
- `applied_by`: `customer`, or `staff:<who>`.
- `sku`: the price list code of the discounted line (`MEM-JOIN`, `MEM-BRANCH`, `MEM-BUNDLE`, `MEM-CERT`, `MEM-BADGE`, `MEM-STICKER`).
- `list_amount` and `amount`: the list price and the discount, in pounds, gross.
- A branch discount also has `stripe_coupon_id`. For that item `amount` is what the coupon really gives.
- If the entry would not fit Stripe's 500 character limit, fields are dropped in this order: `list_amount`, `school_id`, `accreditation_id`, `reason`, `applied_by`.

**How a discounted line looks on the Stripe invoice**

| Item | On the Stripe invoice |
|---|---|
| Joining fee, fully waived (referral or waiver) | Not on the invoice. `joining_fee_amount` is `0.00`. Book `list_amount` and `amount` from the `discounts` entry |
| Badge, sticker, certificate, bundle, part-discounted | On the invoice at the **lowered** price. The `discounts` entry holds the list price and the discount |
| Additional branch | On the invoice at **full price**. The discount is a Stripe coupon, so it appears in `lines[].discount_amounts` and `total_discount_amounts`. The coupon is `once` on a yearly purchase and `repeating` for 12 months on a monthly plan, so the renewal is full price |

On a monthly plan the discount is already spread over the first 12 payments by the portal, so each invoice shows its own share.

## 2. The invoice record

Fill the reserved `discounts` array on the Invoice Records JSON from the session metadata, one object per entry, keeping the keys above plus the Stripe discount for a branch coupon (`discount_amounts` from the fetched invoice).

Rules:
1. Read the metadata from the checkout session, as for the other keys. Remember events arrive out of order: on a first paid invoice, fetch the session by subscription to get `discounts`.
2. A renewal invoice (`subscription_cycle`) carries no `discounts` entry. Do not copy the first invoice's. A branch coupon on a monthly plan does appear in `discount_amounts` on invoices 1 to 12; record it from the invoice.
3. Never map a discount by description or name.

## 3. Books

Push the **list price on the line plus a line-level discount**, so the VAT split follows the line and the invoice total equals Stripe's. Use the existing get-only item lookup by SKU, and never create an item.

- VAT: a gross discount reduces VAT by one sixth on a standard-rated line (£10 off is £8.33 net and £1.67 VAT). A discount on a membership fee would follow the 38/55 zero-rated split (Helen Delaney, 26 October), but no code touches the membership fee.
- A **fully waived joining fee** is not on the Stripe invoice, so push the line at `list_amount` with a line discount of `amount`, giving £0.00, so the discount shows in Books.
- Put `source`, `code` and `reason` in the line note or a custom field so Books can report by code and by reason.
- Insurance, IPT, the membership fee, accreditation and the admin fee are never discounted.

## 4. Redemptions (held in Creator)

Voucher redemptions are held in **Creator**, in `Voucher_Redemptions_Report` (confirmed by the user, 27 October). The portal engine builds a record with a deterministic key and models three states while a checkout is open and after it:

| Status | When | Set by |
|---|---|---|
| Reserved | A voucher is applied to a checkout that is open | Needs deciding (below) |
| Used | The first payment succeeds | Creator |
| Reversed | A refund or cancellation, or the checkout expires or fails | Creator |

Creator must:
1. Hold a **unique redemption key** (for example `redemption_key`: voucher id, application and Contact), so a retry or a repeated event never creates a second row or uses the voucher twice.
2. On the first paid invoice of a purchase with a `discounts` entry whose `source` is `voucher`, set the redemption to Used by its key, and keep the voucher's `Current_Usage_Count` in the CRM `Discount_Voucher` record in step.
3. Mark it Reversed on a refund or cancellation, which gives the use back.
4. For a referral (`source` `referral`), record the use against the school (`school_id`) and the new member, so the Guild can report on it. The school credit scheme is retired, so nothing is credited.
5. For a waiver (`source` `staff_waiver`), set the **Waive_Logs** row in the CRM from Pending to Paid when the first payment succeeds, and to Void if the checkout expires or fails. The row is written by the staff route when the waiver is applied (see [vouchers-staff-route-spec.md](vouchers-staff-route-spec.md)).

**To decide, for A2Z:** where **Reserved** lives. The portal counts Reserved plus Used against a voucher's usage limit, so two open checkouts cannot both take the last use. Either Creator holds a Reserved row written by the portal's staff route, or the reservation lives in the CRM where Creator can read it. Until this is decided, capped vouchers should not be turned on live. The redemption key field name is also for A2Z to confirm.

Keep the processing order the rest of the Creator app uses: the log row, then the Stripe fetch, then the invoice record, then the CRM update, then Books. Each step records what it did and can be retried. A failed redemption write must never stop a membership activating or the Books push.

## 5. Issuing the £25 GTi voucher

Phase 4. Design and the Deluge are in [vouchers-phase-4-gti-voucher.md](vouchers-phase-4-gti-voucher.md) and `vouchers-phase-4/` (once PR 77 is merged). In outline:

- **Trigger:** after the processor has marked a membership Active and set its new term, on a paid invoice with `billing_reason` `subscription_create` (a new member, or an upgrade from GTi Student) or `subscription_cycle` (a renewal, which only matters at the term boundary: payment 13 on a monthly plan), call `Vouchers.process_voucher_for_invoice`.
- **Qualifying lines:** `MEM-ASSOC-Y`, `MEM-INTL-Y`, `MEM-FULLNS-Y`, `MEM-FULLS-Y`, or an accreditation that includes membership (`ACC-ASSOC`, `ACC-INTL-MEM`).
- **Record:** a `Discount_Voucher` of type `Personal £25 GTI`, fixed £25, one use, expiring with the membership. `Valid_From` is the start of the new term (the renewal date), and `Valid_To` is the end of the term (end of the expiry day, UK time).
- **Idempotent:** a unique `Voucher_Key` of `<ContactId>-<yyyymmdd of the term expiry>`. A retry returns the existing voucher.
- **Skip rule:** no new voucher while the Contact already holds an active, unused personal voucher valid on the new term's start (for example an Associate upgrading to Full mid-term).
- **Code:** 8 random upper-case hexadecimal characters, checked for a clash before saving.
- **Automatic.** If the Guild wants an approval first, it is a CRM approval step (an off-by-default setting).
- **Ends with the membership:** call `sync_voucher_end_date` whenever a membership's end date changes (the cancellations workstream will move it).
- **No email** to the member yet (switch off by default). The member sees the code under Discounts & Vouchers on their Dashboard.
- Save the returned status map on the invoice (suggested field `Voucher_Result`) so a failure is visible and can be retried.

## 6. What Creator needs from the CRM and A2Z

- `Voucher_Code` (unique, case-insensitive: the rule is not enforced by the CRM yet), `Voucher_Key` (unique, immutable), `Void_Reason` and `Source_Invoice` on `Discount_Voucher`. `Source_Invoice` holds the Stripe invoice id (the key Creator holds) or a reference to the Creator Invoice Record; confirm which.
- `Waive_Logs` in the CRM (it exists), and the Voucher Redemptions report in Creator with a unique key.
- Creator connection permission to create and update `Discount_Voucher` and `Waive_Logs`.

## 7. Test before live

1. A new yearly Associate with a referral code: the joining fee is not on the invoice, the `discounts` entry is recorded, Books shows £10 list price and £10 discount, the redemption is recorded against the school.
2. The same on a monthly plan: the first payment is £6.09 not £6.92, and the discount appears once.
3. A staff waiver of the joining fee: the Waive_Logs row goes from Pending to Paid.
4. A bespoke voucher on a badge: lowered line, redemption Used by key, count increased by one.
5. A retried event: nothing is duplicated.
6. A refund: the redemption is Reversed.
7. A yearly and a monthly branch discount: first year discounted, renewal at full price.
8. A new member and a renewal each get one £25 voucher, a repeat gets none, and an early renewal's voucher starts on the renewal date.

Test mode only, until the Guild signs each one off.
