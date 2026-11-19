# Vouchers and discounts: the Creator functions as built

Saved 5 November 2026. These are the Deluge functions written for the Creator payments app (Zoho Creator app `beauty-guild-payments`) for the discounts side of [vouchers-creator-spec.md](../vouchers-creator-spec.md). The £25 GTi voucher scripts are separate, in [../vouchers-phase-4/](../vouchers-phase-4/).

**Status: saved in Creator, not yet tested.** The developer has pasted these in, and they save without errors. Nobody has yet reported a test result for them, so treat them as untested until the tests in section 8 of the spec pass.

| File | What it is | Called from |
|---|---|---|
| [Creator.record_voucher_redemptions.deluge](Creator.record_voucher_redemptions.deluge) | A new function. Writes one Voucher Redemptions row per referral or voucher entry in the checkout's `discounts` metadata, once only | `Creator.process_membership_payment`, Stage 3b |
| [Creator.finish_discounts.deluge](Creator.finish_discounts.deluge) | A new function. Recounts each voucher's uses into the CRM, and moves a staff waiver from Pending to Paid | `Creator.process_membership_payment`, Stage 3b, straight after the one above |
| [Creator.process_membership_payment.discounts-stage.deluge](Creator.process_membership_payment.discounts-stage.deluge) | A patch: the Stage 3b block that calls the two functions, and the not-yet-wired Stage 3c for the £25 voucher | Paste into `process_membership_payment` |
| [Books.build_invoice_lines.waived-pass.deluge](Books.build_invoice_lines.waived-pass.deluge) | A patch to `Books.build_invoice_lines`: shows a fully waived joining fee at its list price with a matching discount | Paste into `Books.build_invoice_lines`, and add the fourth argument at its four callers |

## How to enter a function in Creator

Each new function file starts with its signature line (return type, name, parameters). In Creator create the function with that name and those parameters, then paste the body. The two patch files say where they go.

## Things to know

- **Creator does not allow an `insert into` result to be stored in a variable.** `record_voucher_redemptions` inserts, then fetches the row by its unique key to set the lookups.
- **The Voucher lookup is compared as text**, not a number, in `Voucher_Redemptions[Voucher == voucher_id ...]`. Creator rejects a number there.
- **The usage count is recounted, not added to**, so a repeated Stripe event cannot inflate it.
- The form's link name is assumed to be `Voucher_Redemptions`. Change it in the functions if Creator named it otherwise.
- `Status` and `Amount_Status` are both set to `Used`. If `Amount_Status` should mean something else, change it in one place.

## Not built

- Reversal of a redemption on a refund or an expired checkout (needs `checkout.session.expired` and the refund events).
- `Reserved` rows for capped vouchers. Keep capped vouchers off in anything live until they exist.
- The £25 voucher call (Stage 3c), until the `Vouchers` scripts exist in Creator.
