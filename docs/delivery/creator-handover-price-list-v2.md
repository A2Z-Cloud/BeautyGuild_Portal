# Creator handover: price list v2

What the portal now sends to Stripe, and what Creator needs to do with it. Written from the portal code on `main` (`4b39675`) and Stripe test mode on 23 October 2026. Where this says "check", I have not seen Creator's side.

## 1. What changed, in one paragraph

Every membership level is £55 (£38.00 zero-rated, £14.17 standard-rated, £2.83 VAT). Insurance, extra branches and named employee fees now **renew yearly** with the membership, so insurance is a subscription even on its own. **Monthly plans** exist: yearly price plus a £1.50 monthly admin fee, divided by 12, each payment rounded up, with the joining fee and add-ons spread over the first 12 payments and a Stripe schedule dropping them at payment 13. A named employee pays a £55 membership fee as well as any premium.

## 2. Events

Creator's Stripe endpoint (the `zohoapis.eu` one) listens to: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.paused`, `customer.subscription.deleted`, `customer.subscription.updated`, `charge.failed`, `payment_intent.payment_failed`.

**Missing: `invoice.paid`.** Every monthly payment after the first, and every yearly renewal, arrives as an invoice. Without `invoice.paid` Creator has no event for "the 2nd monthly payment was taken". Add it to the endpoint (or tell me and I will add it) and decide what Creator does with it (section 5).

The portal function has its own separate endpoint for `checkout.session.completed` (it only puts monthly plans on their 12 month schedule). It does not replace Creator's.

## 3. What arrives

### Checkout session metadata (`checkout.session.completed`)
Always: `email`, `name`, `currency`, `status`, `source` (`portal_v2`), `type`, `contact_id`, `total_amount`.

`type` is one of `membership`, `membership_insurance`, `insurance`, `accreditation`, `additional_venue`, `membership_addon`.

**Membership** (`membership`, `membership_insurance`): `quote_reference`, `entry_point`, `membership_profile_id`, `existing_membership`, `previous_membership_id`, `change_type`, `business_name`, address keys, `membership_level`, `primary_branch`, `secondary_branches`, `addons`, `insurance_requested`, `subscription_type` (`annual` or `monthly`), `membership_start`, `membership_expiry`, and for each of base membership, joining fee, branch add-on, bundle, certificate, badge and sticker an `..._amount` (gross) and `..._amount_net`. `total_amount_net`.

**Insurance** (`insurance`, `membership_insurance`): `insurance_start_date`, `insurance_end_date`, `insurance_amount` (premiums plus IPT, yearly), `insurance_net_amount`, `insurance_ipt_amount`, `insurance_route`, `insurance_policy_id`, `insured_premises_id`, `insured_people_ids`, `insurance_extension_ids`, `insurance_declarations_id`.

**New in this release**
- `named_employee_membership`: JSON `{"count":1,"amount":"55.00","amount_net":"52.17"}`. The fee for named employees, charged once per employee. It carries VAT and is **outside** `insurance_amount` and IPT.
- `monthly_plan` (monthly only, when there is room under Stripe's 50 key limit): JSON `payments`, `first_payment`, `later_payment`, `year_one_total`, `admin_fee`, `admin_fee_net`.

**What the amounts mean on a monthly plan.** `total_amount` is the **first payment**. The per-item amounts (`base_membership_amount`, `joining_fee_amount` and so on) are the **monthly shares** on that first invoice, and the net amounts split the zero-rated part as £38 divided by 12. The `insurance_*` amounts stay **yearly**.

### Subscription metadata (`customer.subscription.created` and later)
`plan` (`annual` or `monthly`), `contact_id`, and for monthly `phased` (`true` if the plan has year-one lines that drop at payment 13).

### Line items
Each Stripe line item is one of:
- a **catalogue price**, found by lookup key (the key is the price list code and the Books SKU): `MEM-ASSOC-Y`, `MEM-FULLNS-Y`, `MEM-FULLS-Y`, `MEM-INTL-Y`, `MEM-JOIN`, `MEM-BRANCH`, `MEM-BUNDLE`, `MEM-CERT`, `MEM-BADGE`, `MEM-STICKER`, `MEM-ADMIN`, `ACC-STD`, `ACC-ASSOC`, `ACC-INTL`, `ACC-INTL-MEM`, `ACC-VENUE`;
- an **inline price** (insurance premiums, IPT, the named employee fee, extra branches on a yearly plan, and every line of a monthly plan except the admin fee). Each carries its **price list code** (the Books SKU) in the line's product metadata: expand `data.price.product` on the session's line items and read `metadata.sku` (for example `INS-MEDMAL-NS`, `INS-EQ-5K`, `INS-IPT`, `MEM-BRANCH`; the full list is in `docs/api-contracts/pricing-payments.md`). Names are for display only; do not map by name (they differ from the Books names).

For a catalogue line, the code is the price's `lookup_key`. On a monthly plan the membership line's code is the level (`MEM-ASSOC-Y` and so on): Creator splits it into the two Books items (the `-ZERO` and `-STD` SKUs).

## 4. Mapping to Books

Use the workbook `Books-Items-and-Mapping-v2.xlsx`, tabs **Items** (53 items, SKUs, tax) and **Stripe to Books**.
- A membership is **two Books items**: the zero-rated £38.00 and the standard-rated £14.17 (SKUs `MEM-ASSOC-Y-ZERO` and `MEM-ASSOC-Y-STD`, and the same for the other levels).
- Accreditation with Associate membership (`ACC-ASSOC`, £409) is three Books items: Standard Accreditation (£295 + VAT) and the two Associate membership items.
- Insurance premiums are VAT exempt, with Insurance Premium Tax as its own line. The IPT item is `INS-IPT` (not a tax in Books).
- On a monthly plan every line is the yearly amount divided by 12, so the invoice line rate is the monthly share, not the Books item rate. The monthly admin fee Books item (`MEM-ADMIN`) is £1.25 plus VAT, which is the £1.50 Stripe price.
- Rounding: the payment is rounded up, so the lines are shares that add up to the payment exactly (the extra pence sit on the larger lines). No separate rounding line is needed.

## 5. What Creator needs to do (to check against what it does today)

1. **Annual purchase** (`subscription_type=annual`): as now, plus insurance lines that renew. Check the Deal, membership and policy records still activate.
2. **Monthly purchase** (`subscription_type=monthly`): create the first invoice from the first payment's lines. Activate the membership and policy for the full term on the first payment, not month by month.
3. **Every later payment** (`invoice.paid`, `billing_reason=subscription_cycle`): create a payment and invoice for that month. From payment 13 the amount drops when there were year-one lines, so do not compare against the first amount.
4. **Yearly renewals** (annual plans, `invoice.paid` a year later): renew the membership and policy dates. The renewal charges the same amounts; premiums are not re-rated.
5. **Insurance only** is now `mode=subscription` (it used to be a one-off payment). Check that your handler does not assume `mode=payment` for `type=insurance`.
6. **Named employee fee:** read `named_employee_membership`, add the fee to the invoice as a membership item (`MEM-FULLNS-Y` for non-salon, `MEM-FULLS-Y` for salon, count times the amount), and keep it out of the IPT calculation.
7. **Failures:** `invoice.payment_failed` on a monthly plan is now a monthly event, not a one-off. Decide what the CRM shows after a failed month.
8. **Cancellation:** `customer.subscription.deleted` now ends a monthly or renewing policy. Decide whether that lapses the membership and policy.
9. **Contact:** `contact_id` is now set for new customers too (the portal creates the Contact at payment or referral). Do not create a second Contact.

## 6. How to test

Use the Development portal (`/app/`), Stripe test mode, and the Stripe test card `4242 4242 4242 4242`, any future expiry and any CVC.

| Test | What to check |
| --- | --- |
| Monthly Associate, new member (£6.92) | One subscription with two phases in Stripe (12 months with every line, then without the joining fee); first invoice £6.92; CRM Deal active |
| Annual Associate with a badge (£69.00) | Subscription yearly; badge is a one-off; invoice split into £38.00 zero-rated, £14.17 standard-rated and the badge |
| Annual Full non-salon with insurance | Yearly subscription with membership, premiums and IPT as yearly lines; policy active |
| Insurance only, an existing member | `mode=subscription`; policy active; does not create a second Contact |
| Named employee (non-salon) | £55 fee outside IPT; premium plus fee on the invoice |
| Referral (more than four people) | No Stripe session; referred policy in the CRM |
| Fire a renewal | In Stripe, advance the test clock or send a test `invoice.paid`; the CRM updates |

## 7. Questions for Creator

- Does the handler read the session metadata only, or also the line items? The code on each line (`lookup_key` or `metadata.sku`) is how to find the Books item.
- Does it assume `mode=payment` for any `type`?
- What does it do on `customer.subscription.updated` (the portal's schedule makes this event fire when a monthly plan is scheduled)?
- Where does the Books item come from today: name, ID, or Stripe price ID?
