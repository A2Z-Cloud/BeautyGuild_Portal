# Vouchers and discounts: the staff route (phase 2b)

Written 27 October 2026 for A2Z Cloud. This is the staff side of the vouchers plan in [vouchers-review.md](vouchers-review.md). It is a specification for the Staff Workspace (the CRM Web Tab widget on branch `feature/beauty-guild-staff-workspace-slate`) and the staff API it needs. The staff API is built **last**, with all its dependencies, so nothing here is built yet. The pricing logic is already built: the discount engine (`discountEngine.js`, PR 79) takes the actor as a parameter and has no idea how anyone signed in.

## 1. Where this fits

The Staff Workspace V1.2 brief describes `/staff/applications`, `/staff/applications/:id`, `/assess`, `/quote` and an unbuilt `/payment-link`, and says the widget stops at a quote until Creator's payment handling is ready. Discounts are **not** a separate endpoint. They are inputs to that staff API:

| Staff API route | Discount behaviour |
|---|---|
| `POST /staff/applications/:id/quote` | Accepts `code` and `waivers`, calls the engine with the staff member as actor, and returns the discounted quote (lines, list price, discount, first and later payments). **No record is written** |
| `PUT /staff/applications/:id` (save draft) | Saves the code and waivers with the other answers, so the customer can resume with them in Portal V2 |
| `POST /staff/applications/:id/payment-link` (later) | Re-prices, then writes the Waive_Logs row and the voucher reservation, and creates the Checkout Session with the `discounts` metadata |

Quotes must never call `POST /portal/checkout`, which creates CRM records and a Stripe session.

## 2. What staff can do

Any Guild staff member can do all of these (Guild answer, 26 October), in both the phone payment widget and the payment link:

1. **Enter a school referral code.** £10 off the joining fee, only where a joining fee is due.
2. **Enter a bespoke voucher code.** Looked up in the CRM `Discount_Voucher` module. It must be a `Bespoke Generic` voucher, active, within `Valid_From` and `Valid_To` (exact time), under its usage limit, and eligible for the member's type and the items in the basket. A `Personal £25 GTI` voucher is always refused here.
3. **Apply a waiver** on the joining fee, any of the one-off extras (bundle, certificate, badge, sticker), an additional branch, or (once it is in the catalogue) the £5 adjustment fee. The staff member chooses an amount up to the list price, or the full waiver.

Never discountable by anyone: the membership fee, accreditation fees, insurance, IPT, the named employee fee and the admin fee.

## 3. Waivers: reasons, authority and audit

- **Reason picklist** (required): Goodwill Gesture, Complaint, Upgrade, Promotion, Payment Problem, Other. Optional note, required for Other. The list is a CRM picklist the Guild can extend without a release.
- **Once per person for the joining fee.** A goodwill waiver of the joining fee is allowed once per person. It starts again when a new joining fee is charged after a lapse of more than 30 days. A second attempt is refused and the staff member is shown the earlier waiver (who, when and why).
- **Authority.** The engine only accepts a waiver from a staff actor with `canWaive` set. The staff API sets it from the authenticated staff identity and role. A customer can never waive. The Guild said any member of staff may waive, so `canWaive` is true for every approved staff role. Which roles count as "approved" is an open confirmation in the V1.2 brief.
- **Audit.** Every waiver writes a row to the CRM `Waive_Logs` module: Contact, application, item, amount, list price, reason, note, staff member, date and time, and the Stripe Checkout Session id once there is one. The row starts as Pending, becomes Paid when Creator sees the first payment, and Void if the checkout expires or fails. The once-per-person check ignores Void rows.
- **Separation of duties.** Voucher configuration and redemption are kept apart from waiver authority: a person who can apply a voucher is not thereby allowed to create or change vouchers.

## 4. The staff identity

How the widget proves who is calling is part of the staff API design in the V1.2 brief (section 5.2): a CRM-side function or Connection holds the secrets and calls protected Catalyst staff routes, the actual staff identity and role are checked server-side, and the staff identity is recorded separately from the customer's. The portal's customer routes derive the Contact from the signed-in Catalyst user and cannot be reused with a staff-supplied Contact id. The engine needs only an actor object: `{kind: 'staff', id, name, canWaive}`.

## 5. What the widget needs

On the Membership journey (and its review step), alongside the existing questions:

1. A **code field** (referral or voucher). A wrong or unusable code shows one message: "That code is not valid".
2. A **waiver panel**: choose the item, the amount (or full waiver), the reason from the picklist and a note. It shows the earlier waiver when the once-only rule refuses a second.
3. The **discounted quote**: each line with its list price and discount, the first and later payments on a monthly plan, and the actor's name. The quote is what the staff API returns; the widget does not price anything.
4. The code and waivers saved **with the draft**, so a staff-saved application resumed by the customer keeps them.

The widget keeps its own copy of the journey definitions (`portal-defs/`). It must be kept in step with the Portal V2 Join page, which also has the referral code box.

## 6. Contract with the engine

The staff route calls the engine with, in outline: the basket (lines and plan), `code`, `waivers`, `actor`, the `applicationId`, the Contact and the membership type. It receives the priced lines, the `discounts` metadata entries, and the log records to write (the waiver log, and the voucher redemption with its key and status Reserved). The route, not the engine, writes them, and only when it creates the payment link. Details and tests are in PR 79 and its hand-over note.

## 7. Dependencies and gating

1. The staff API and staff identity (V1.2 brief, section 5).
2. The Waive_Logs module (exists) and the Creator redemption report with a unique key (section 4 of [vouchers-creator-spec.md](vouchers-creator-spec.md)), including where **Reserved** lives.
3. Live redemption stays off (`PORTAL_VOUCHER_REDEMPTION_ENABLED`) until the field checks and end-to-end tests pass. Waivers and the referral code are not behind that switch.
4. Stripe test mode only, and no payment link until Creator is ready.

## 8. Test before live

1. A referral code and a goodwill waiver on one phone application: both apply, different lines, the order does not change the price.
2. A second joining fee waiver for the same person is refused and the earlier one is shown. After a lapse of over 30 days it is allowed again.
3. A customer attempt to waive is refused.
4. A voucher outside its dates, over its usage limit, or for the wrong member type shows "That code is not valid".
5. A monthly plan: the discount is spread over the first 12 payments and the quote matches what Stripe takes.
6. The code and waivers survive save and resume between staff and customer.
