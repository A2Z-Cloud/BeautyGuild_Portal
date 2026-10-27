# Creator handover: portal payments (price list v3)

What the portal now sends to Stripe, and what Creator needs to do with it. Written from the portal code on `main` (`aa0e2b2`), checked on 27 October 2026. The exact metadata keys for every purchase type are in [`docs/api-contracts/stripe-metadata.md`](../api-contracts/stripe-metadata.md), which is generated from the code and checked by a test, so treat that page as the source of truth if this one ever differs. Where this says "check", I have not seen Creator's side.

## 1. What changed, in one paragraph

Every membership level is £55 (£38.00 zero-rated, £14.17 standard-rated, £2.83 VAT). Insurance, extra branches and named employee fees now **renew yearly** with the membership, so insurance is a subscription even on its own. **Monthly plans** exist: yearly price plus a £1.50 monthly admin fee, divided by 12, each payment rounded up, with the joining fee and add-ons charged once, in full, on the first payment (so every later payment and renewal is the same; there is no schedule). A named employee pays a £55 membership fee as well as any premium. Price list version 3 (27 October) changed monthly plans only; yearly prices are unchanged. The £10 joining fee is charged again when a membership starts more than one month after the member's latest membership ended, on a new purchase and a renewal alike.

## 2. Events

Creator's Stripe endpoint (the `zohoapis.eu` one) listens to: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.paused`, `customer.subscription.deleted`, `customer.subscription.updated`, `charge.failed`, `payment_intent.payment_failed`, and `invoice.paid`.

**`invoice.paid`** is now on the endpoint (added in Stripe test mode). Every monthly payment after the first, and every yearly renewal, arrives as an invoice, so Creator has to decide what it does with each one (section 5).

The portal function no longer has a Stripe webhook of its own (it used to put monthly plans on a 12 month schedule; there is no schedule now). Creator's endpoint is the only one.

## 3. What arrives

### Checkout session metadata (`checkout.session.completed`)
Always: `email`, `name`, `currency`, `status`, `source` (`portal_v2`), `type`, `contact_id`. The amount is `total_amount` for membership, insurance and membership add-ons, `product_amount` for accreditation, and **there is no amount key for `additional_venue`** (read it from the Stripe line item: `ACC-VENUE`, £60.00).

`type` is one of `membership`, `membership_insurance`, `insurance`, `accreditation`, `additional_venue`, `membership_addon`, and two that are off by default and not live yet: `insurance_change` and `membership_change` (mid-term changes; see section 6 of `creator-payments-app.md`).

**Membership** (`membership`, `membership_insurance`): `quote_reference`, `entry_point`, `membership_profile_id`, `existing_membership`, `previous_membership_id`, `change_type`, `business_name`, address keys, `membership_level`, `primary_branch`, `secondary_branches`, `addons`, `insurance_requested`, `subscription_type` (`annual` or `monthly`), `membership_start`, `membership_expiry`, and for each of base membership, joining fee, branch add-on, bundle, certificate, badge and sticker an `..._amount` (gross) and `..._amount_net`. `total_amount_net`.

**Insurance** (`insurance`, `membership_insurance`): `insurance_start_date`, `insurance_end_date`, `insurance_amount` (premiums plus IPT, yearly), `insurance_net_amount`, `insurance_ipt_amount`, `insurance_route`, `insurance_policy_id`, `insured_premises_id`, `insured_people_ids`, `insurance_extension_ids`, `insurance_declarations_id`.

**Accreditation** (`accreditation`): `accreditation_id`, `application_id` (the same value, kept for V1), `subscription_type` (`annual` or `monthly`), `product_amount` (what is charged now), `product_yearly_amount` (the yearly price whatever the plan), `product_details`, `product_name`, `membership_required`, `membership_id`, `membership_details`, and `monthly_plan` on a monthly plan.

**Additional venue** (`additional_venue`): `centre_id`, `accreditation_id`. Nothing else.

**Membership add-ons** (`membership_addon`): `membership_deal_id`, `addons`, `bundle_amount`, `certificate_amount`, `badge_amount`, `sticker_amount`, `total_amount`.

**Discounts** (`discounts`): only when `PORTAL_DISCOUNTS_ENABLED` is on and a discount applies. It is off today. See `docs/delivery/vouchers-creator-spec.md`.

**New in this release**
- `named_employee_membership`: JSON `{"count":1,"amount":"55.00","amount_net":"52.17"}`. The fee for named employees, charged once per employee. It carries VAT and is **outside** `insurance_amount` and IPT.
- `monthly_plan` (monthly only, when there is room under Stripe's 50 key limit): JSON `payments`, `first_payment`, `later_payment`, `one_off_total`, `year_one_total`, `admin_fee`, `admin_fee_net`.

**What the amounts mean on a monthly plan.** `total_amount` is the **first payment**: the monthly payment plus the one-off items. For the one-off items (`joining_fee_amount`, `bundle_amount`, `certificate_amount`, `badge_amount`, `sticker_amount`) the `..._amount` is the **full** amount, charged once on the first invoice. For the lines that renew (`base_membership_amount`, `branch_addon_amount`) it is the **monthly share**, and the net splits the zero-rated part of the membership as £38 divided by 12. The `insurance_*` amounts stay **yearly**. `monthly_plan` carries `first_payment`, `later_payment`, `one_off_total` and `year_one_total` (what is paid over the first twelve months). Example: a new Associate pays £16.09 first (£6.09 plus the £10.00 joining fee), then £6.09 every month, including at renewal.

**Stripe's 50 key limit.** Stripe rejects a session with more than 50 filled keys (empty values do not count). The biggest purchase (Join page address, a branch, add-ons, insurance and monthly together) is right at the limit, so when a session would go over, the portal leaves out each `..._amount_net` whose `..._amount` is `0.00`, then `monthly_plan`. **Read a missing `..._amount_net` as `0.00`, and a missing `monthly_plan` as "look at the subscription metadata".**

### Subscription metadata (`customer.subscription.created` and later)
`plan` (`annual` or `monthly`) and `contact_id`. (`phased` and the `phase` product metadata were removed on 27 October: there is no schedule.)

### Line items
Each Stripe line item is one of:
- a **catalogue price**, found by lookup key (the key is the price list code and the Books SKU): `MEM-ASSOC-Y`, `MEM-FULLNS-Y`, `MEM-FULLS-Y`, `MEM-INTL-Y`, `MEM-JOIN`, `MEM-BRANCH`, `MEM-BUNDLE`, `MEM-CERT`, `MEM-BADGE`, `MEM-STICKER`, `MEM-ADMIN`, `ACC-STD`, `ACC-ASSOC`, `ACC-INTL`, `ACC-INTL-MEM`, `ACC-VENUE`;
- an **inline price** (insurance premiums, IPT, the named employee fee, extra branches on a yearly plan, and every line of a monthly plan that renews except the admin fee). On a monthly plan the joining fee and add-ons are the opposite: one-off **catalogue** lines (no `recurring`) on the first invoice only. Each carries its **price list code** (the Books SKU) in the line's product metadata: expand `data.price.product` on the session's line items and read `metadata.sku` (for example `INS-MEDMAL-NS`, `INS-EQ-5K`, `INS-IPT`, `MEM-BRANCH`; the full list is in `docs/api-contracts/pricing-payments.md`). Names are for display only; do not map by name (they differ from the Books names).

For a catalogue line, the code is the price's `lookup_key`. On a monthly plan the membership line's code is the level (`MEM-ASSOC-Y` and so on): Creator splits it into the two Books items (the `-ZERO` and `-STD` SKUs).

## 4. Mapping to Books

Use the workbook `Books-Items-and-Mapping-v2.xlsx`, tabs **Items** (53 items, SKUs, tax) and **Stripe to Books**.
- A membership is **two Books items**: the zero-rated £38.00 and the standard-rated £14.17 (SKUs `MEM-ASSOC-Y-ZERO` and `MEM-ASSOC-Y-STD`, and the same for the other levels).
- Accreditation with Associate membership (`ACC-ASSOC`, £409) is three Books items: Standard Accreditation (£295 + VAT) and the two Associate membership items.
- Insurance premiums are VAT exempt, with Insurance Premium Tax as its own line. The IPT item is `INS-IPT` (not a tax in Books).
- On a monthly plan the lines that renew are the yearly amount divided by 12, so the invoice line rate is the monthly share, not the Books item rate. The joining fee and add-ons are on the first invoice only, at the full Books item rate. The monthly admin fee Books item (`MEM-ADMIN`) is £1.25 plus VAT, which is the £1.50 Stripe price.
- Rounding: the payment is rounded up, so the lines that renew are shares that add up to the payment exactly (the extra pence sit on the larger lines). No separate rounding line is needed.

## 5. What Creator needs to do (to check against what it does today)

1. **Annual purchase** (`subscription_type=annual`): as now, plus insurance lines that renew. Check the Deal, membership and policy records still activate.
2. **Monthly purchase** (`subscription_type=monthly`): create the first invoice from the first payment's lines, which include the one-off items in full. Activate the membership and policy for the full term on the first payment, not month by month.
3. **Every later payment** (`invoice.paid`, `billing_reason=subscription_cycle`): create a payment and invoice for that month. The amount is the same from payment 2 on (the joining fee and add-ons are only on the first), so do not compare against the first amount.
4. **Yearly renewals** (annual plans, `invoice.paid` a year later): renew the membership and policy dates. The renewal charges the same amounts; premiums are not re-rated.
5. **Insurance only** is now `mode=subscription` (it used to be a one-off payment). Check that your handler does not assume `mode=payment` for `type=insurance`.
6. **Named employee fee:** read `named_employee_membership`, add the fee to the invoice as a membership item (`MEM-FULLNS-Y` for non-salon, `MEM-FULLS-Y` for salon, count times the amount), and keep it out of the IPT calculation.
7. **Failures:** `invoice.payment_failed` on a monthly plan is now a monthly event, not a one-off. Decide what the CRM shows after a failed month.
8. **Cancellation:** `customer.subscription.deleted` now ends a monthly or renewing policy. Decide whether that lapses the membership and policy.
9. **Contact:** `contact_id` is now set for new customers too (the portal creates the Contact at payment or referral). Do not create a second Contact.
10. **Joining fee:** `joining_fee_amount` is `0.00` when no fee is due (a membership still running, or starting within a month of the last one ending). It is charged again after a longer gap, on a new purchase and a renewal alike, so do not assume a renewal never carries it.
11. **Mid-term changes** (`insurance_change`, `membership_change`) are off by default. What Creator must do for them is in section 6 of `creator-payments-app.md`.

## 6. How to test

Use the Development portal (`/app/`), Stripe test mode, and the Stripe test card `4242 4242 4242 4242`, any future expiry and any CVC.

| Test | What to check |
| --- | --- |
| Monthly Associate, new member (£16.09) | One subscription, no phases; first invoice £16.09 (£6.09 ongoing plus the £10.00 joining fee in full); every later invoice £6.09; CRM Deal active |
| Monthly Associate renewing, with a badge (£10.09) | First invoice £10.09 (£6.09 ongoing plus the £4.00 badge in full); every later invoice £6.09 |
| Annual Associate with a badge (£69.00) | Subscription yearly; badge is a one-off; invoice split into £38.00 zero-rated, £14.17 standard-rated and the badge |
| Annual Full non-salon with insurance | Yearly subscription with membership, premiums and IPT as yearly lines; policy active |
| Insurance only, an existing member | `mode=subscription`; policy active; does not create a second Contact |
| Named employee (non-salon) | £55 fee outside IPT; premium plus fee on the invoice |
| Additional venue | £60.00 session with `centre_id` and `accreditation_id` only; take the amount from the line item |
| Referral (more than four people) | No Stripe session; referred policy in the CRM |
| Fire a renewal | In Stripe, advance the test clock or send a test `invoice.paid`; the CRM updates |

The portal side is also tested automatically. A test builds every purchase type and checks the keys against the contract, and a nightly test (once the repository secret is set) creates real Checkout Sessions in Stripe test mode and checks the totals and metadata. What is **not** covered by any test is Creator's own handling of the events.

## 7. Questions for Creator

- Does the handler read the session metadata only, or also the line items? The code on each line (`lookup_key` or `metadata.sku`) is how to find the Books item.
- Does it assume `mode=payment` for any `type`?
- What does it do on `customer.subscription.updated`?
- Where does the Books item come from today: name, ID, or Stripe price ID?
- Can the handler cope with a missing `..._amount_net` (read as `0.00`) and a missing `monthly_plan`?
- Do the Subscription and Invoice forms still assume the old 12 payment shape (a drop at payment 13, `phase` or `phased`)? They no longer exist.
