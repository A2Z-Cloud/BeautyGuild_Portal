# Stripe metadata for Creator

Generated from `apps/portal/functions/beauty_guild_api/src/metadataContract.js`. Do not edit by hand: run `npm run docs:metadata` in `apps/portal`.
A test sends every purchase type through the real code and fails if the keys differ from this contract, so this page cannot drift from what Creator receives.

Stripe allows 50 filled metadata keys on a session (empty values do not count). The portal keeps every type under that. In the biggest purchases (address, branch, add-ons, insurance and monthly together) it leaves out each `..._amount_net` whose `..._amount` is `0.00`, then `monthly_plan`. Read a missing `..._amount_net` as `0.00`.

## Checkout Session metadata (`checkout.session.completed`)

Every session has: `email`, `name`, `currency`, `status`, `source`, `type`, `contact_id`.

### `membership`

| Key | Present | Meaning |
| --- | --- | --- |
| `quote_reference` | always | A reference for this quote (`BGP-` and a time code). Not unique across retries. |
| `entry_point` | always | `member` if the customer already had a Contact, `public` if the portal made one at payment. |
| `membership_profile_id` | always | The member profile of the customer's current membership. Empty for a new member. |
| `existing_membership` | always | JSON of the current membership (type, start_date, expiry_date, deal_id) when renewing or upgrading. Empty for a new member. |
| `previous_membership_id` | always | The Deal being renewed or upgraded. Empty for a new membership. |
| `change_type` | always | `new`, `renewal` or `upgrade`. |
| `membership_level` | always | `associate`, `full_non_salon` or `full_salon`. |
| `primary_branch` | always | The main branch: `beauty`, `holistic`, `nails` or `hair`. |
| `secondary_branches` | always | Comma separated additional branches. Empty if none. |
| `addons` | always | JSON of the add-on quantities, for example `{"badge":1}`. `{}` if none. |
| `insurance_requested` | always | `true` if insurance is part of this purchase. |
| `subscription_type` | always | `annual` or `monthly`. |
| `membership_start` | always | The start of the membership term (yyyy-mm-dd). |
| `membership_expiry` | always | The end of the membership term (yyyy-mm-dd). |
| `base_membership_amount` | always | Gross amount of the membership line on this payment. On a monthly plan, its monthly share (the joining fee, add-ons and extra branches below follow the same rule: only what renews is a monthly share). |
| `base_membership_amount_net` | always | The same without VAT. The zero-rated part of a membership is £38.00 a year (divided by 12 on a monthly plan). |
| `joining_fee_amount` | always | Gross joining fee on this payment (`0.00` where it is not charged: a renewal, or a membership starting within a month of the last one ending). On a monthly plan it is the full fee, charged once with the first payment. |
| `joining_fee_amount_net` | always | Joining fee without VAT. |
| `branch_addon_amount` | always | Gross amount for extra branches on this payment (`0.00` if none). |
| `branch_addon_amount_net` | always | Extra branches without VAT. |
| `bundle_amount` | always | Gross amount for the membership bundle (`0.00` if none). |
| `bundle_amount_net` | always | Bundle without VAT. |
| `certificate_amount` | always | Gross amount for extra certificates (`0.00` if none). |
| `certificate_amount_net` | always | Certificates without VAT. |
| `badge_amount` | always | Gross amount for badges (`0.00` if none). |
| `badge_amount_net` | always | Badges without VAT. |
| `sticker_amount` | always | Gross amount for window stickers (`0.00` if none). |
| `sticker_amount_net` | always | Window stickers without VAT. |
| `insurance_amount` | always | Premiums plus IPT for the year, whatever the payment plan. |
| `insurance_net_amount` | always | Premiums before IPT, for the year. |
| `insurance_ipt_amount` | always | Insurance Premium Tax for the year. |
| `insurance_route` | always | `salon` or `non_salon`. Empty when insurance is not requested. |
| `insurance_policy_id` | always | The Insurance_Policy created before payment. Empty when insurance is not requested. |
| `insured_premises_id` | always | The Insured_Premises record, if the cover needs premises. Otherwise empty. |
| `insured_people_ids` | always | Comma separated Insured_People ids. Empty if none. |
| `insurance_extension_ids` | always | Comma separated Insurance_Extension ids, one per cover row. |
| `insurance_declarations_id` | always | The Declarations record. |
| `total_amount` | always | What is charged now, gross. The first payment on a monthly plan: the ongoing monthly payment plus the joining fee and any add-ons in full. |
| `total_amount_net` | always | `total_amount` without VAT. Insurance premiums are VAT exempt, and IPT is not VAT. |
| `business_name` | sometimes | The trading name typed on the Join page. Left out when blank. |
| `address_line_1` | sometimes | Correspondence address typed on the Join page. Left out when blank. |
| `address_line_2` | sometimes | Correspondence address line 2. Left out when blank. |
| `town` | sometimes | Correspondence town. Left out when blank. |
| `county` | sometimes | Correspondence county. Left out when blank. |
| `postcode` | sometimes | Correspondence postcode. Left out when blank. |
| `monthly_plan` | sometimes | Monthly plans only, and only while there is room under Stripe's 50 key limit (it is also on the subscription): JSON of `payments`, `first_payment`, `later_payment`, `one_off_total` (the joining fee and add-ons charged in full with the first payment), `year_one_total` (what is paid over the first twelve months), `admin_fee` and `admin_fee_net`. |

### `membership_insurance`

| Key | Present | Meaning |
| --- | --- | --- |
| `quote_reference` | always | A reference for this quote (`BGP-` and a time code). Not unique across retries. |
| `entry_point` | always | `member` if the customer already had a Contact, `public` if the portal made one at payment. |
| `membership_profile_id` | always | The member profile of the customer's current membership. Empty for a new member. |
| `existing_membership` | always | JSON of the current membership (type, start_date, expiry_date, deal_id) when renewing or upgrading. Empty for a new member. |
| `previous_membership_id` | always | The Deal being renewed or upgraded. Empty for a new membership. |
| `change_type` | always | `new`, `renewal` or `upgrade`. |
| `membership_level` | always | `associate`, `full_non_salon` or `full_salon`. |
| `primary_branch` | always | The main branch: `beauty`, `holistic`, `nails` or `hair`. |
| `secondary_branches` | always | Comma separated additional branches. Empty if none. |
| `addons` | always | JSON of the add-on quantities, for example `{"badge":1}`. `{}` if none. |
| `insurance_requested` | always | `true` if insurance is part of this purchase. |
| `subscription_type` | always | `annual` or `monthly`. |
| `membership_start` | always | The start of the membership term (yyyy-mm-dd). |
| `membership_expiry` | always | The end of the membership term (yyyy-mm-dd). |
| `base_membership_amount` | always | Gross amount of the membership line on this payment. On a monthly plan, its monthly share (the joining fee, add-ons and extra branches below follow the same rule: only what renews is a monthly share). |
| `base_membership_amount_net` | always | The same without VAT. The zero-rated part of a membership is £38.00 a year (divided by 12 on a monthly plan). |
| `joining_fee_amount` | always | Gross joining fee on this payment (`0.00` where it is not charged: a renewal, or a membership starting within a month of the last one ending). On a monthly plan it is the full fee, charged once with the first payment. |
| `joining_fee_amount_net` | always | Joining fee without VAT. |
| `branch_addon_amount` | always | Gross amount for extra branches on this payment (`0.00` if none). |
| `branch_addon_amount_net` | always | Extra branches without VAT. |
| `bundle_amount` | always | Gross amount for the membership bundle (`0.00` if none). |
| `bundle_amount_net` | always | Bundle without VAT. |
| `certificate_amount` | always | Gross amount for extra certificates (`0.00` if none). |
| `certificate_amount_net` | always | Certificates without VAT. |
| `badge_amount` | always | Gross amount for badges (`0.00` if none). |
| `badge_amount_net` | always | Badges without VAT. |
| `sticker_amount` | always | Gross amount for window stickers (`0.00` if none). |
| `sticker_amount_net` | always | Window stickers without VAT. |
| `insurance_amount` | always | Premiums plus IPT for the year, whatever the payment plan. |
| `insurance_net_amount` | always | Premiums before IPT, for the year. |
| `insurance_ipt_amount` | always | Insurance Premium Tax for the year. |
| `insurance_policy_id` | always | The Insurance_Policy created before payment. Empty when insurance is not requested. |
| `insured_premises_id` | always | The Insured_Premises record, if the cover needs premises. Otherwise empty. |
| `insured_people_ids` | always | Comma separated Insured_People ids. Empty if none. |
| `insurance_extension_ids` | always | Comma separated Insurance_Extension ids, one per cover row. |
| `insurance_declarations_id` | always | The Declarations record. |
| `total_amount` | always | What is charged now, gross. The first payment on a monthly plan: the ongoing monthly payment plus the joining fee and any add-ons in full. |
| `total_amount_net` | always | `total_amount` without VAT. Insurance premiums are VAT exempt, and IPT is not VAT. |
| `insurance_start_date` | always | The policy start date (yyyy-mm-dd). |
| `insurance_end_date` | always | The policy end date (yyyy-mm-dd). |
| `named_employee_membership` | always | JSON `{"count":1,"amount":"55.00","amount_net":"52.17"}`: the membership fee each named employee pays, charged once per employee. It carries VAT and sits outside `insurance_amount` and IPT. |
| `insurance_route` | always | `salon` or `non_salon`. Empty when insurance is not requested. |
| `business_name` | sometimes | The trading name typed on the Join page. Left out when blank. |
| `address_line_1` | sometimes | Correspondence address typed on the Join page. Left out when blank. |
| `address_line_2` | sometimes | Correspondence address line 2. Left out when blank. |
| `town` | sometimes | Correspondence town. Left out when blank. |
| `county` | sometimes | Correspondence county. Left out when blank. |
| `postcode` | sometimes | Correspondence postcode. Left out when blank. |
| `monthly_plan` | sometimes | Monthly plans only, and only while there is room under Stripe's 50 key limit (it is also on the subscription): JSON of `payments`, `first_payment`, `later_payment`, `one_off_total` (the joining fee and add-ons charged in full with the first payment), `year_one_total` (what is paid over the first twelve months), `admin_fee` and `admin_fee_net`. |

### `insurance`

| Key | Present | Meaning |
| --- | --- | --- |
| `quote_reference` | always | A reference for this quote (`BGP-` and a time code). Not unique across retries. |
| `entry_point` | always | `member` if the customer already had a Contact, `public` if the portal made one at payment. |
| `membership_deal_id` | always | The member's current membership Deal. |
| `membership_profile_id` | always | The member profile of the customer's current membership. Empty for a new member. |
| `insurance_requested` | always | `true` if insurance is part of this purchase. |
| `insurance_start_date` | always | The policy start date (yyyy-mm-dd). |
| `insurance_end_date` | always | The policy end date (yyyy-mm-dd). |
| `insurance_amount` | always | Premiums plus IPT for the year, whatever the payment plan. |
| `insurance_net_amount` | always | Premiums before IPT, for the year. |
| `insurance_ipt_amount` | always | Insurance Premium Tax for the year. |
| `insurance_route` | always | `salon` or `non_salon`. Empty when insurance is not requested. |
| `named_employee_membership` | always | JSON `{"count":1,"amount":"55.00","amount_net":"52.17"}`: the membership fee each named employee pays, charged once per employee. It carries VAT and sits outside `insurance_amount` and IPT. |
| `insurance_policy_id` | always | The Insurance_Policy created before payment. Empty when insurance is not requested. |
| `insured_premises_id` | always | The Insured_Premises record, if the cover needs premises. Otherwise empty. |
| `insured_people_ids` | always | Comma separated Insured_People ids. Empty if none. |
| `insurance_extension_ids` | always | Comma separated Insurance_Extension ids, one per cover row. |
| `insurance_declarations_id` | always | The Declarations record. |
| `total_amount` | always | What is charged now, gross. The first payment on a monthly plan: the ongoing monthly payment plus the joining fee and any add-ons in full. |
| `total_amount_net` | always | `total_amount` without VAT. Insurance premiums are VAT exempt, and IPT is not VAT. |

### `accreditation`

| Key | Present | Meaning |
| --- | --- | --- |
| `accreditation_id` | always | The Training_Centre_Accred record being paid. |
| `application_id` | always | The same value as `accreditation_id` (kept for V1 compatibility). |
| `subscription_type` | always | `annual` or `monthly`. |
| `product_amount` | always | What is charged now for the accreditation (the first payment on a monthly plan). |
| `product_yearly_amount` | always | The yearly accreditation price, whatever the payment plan. |
| `product_details` | always | A label for what was bought, for example `Accreditation + Associate Membership`. |
| `product_name` | always | The product name for the invoice. |
| `membership_required` | always | `true` if the school had no membership, so one is bundled with the accreditation. |
| `membership_id` | always | The member profile of the school's current membership. Empty if none. |
| `membership_details` | always | JSON of `required`, `type` (Associate or International when bundled), `start_date` and `expiry_date`. |
| `monthly_plan` | sometimes | Monthly plans only, and only while there is room under Stripe's 50 key limit (it is also on the subscription): JSON of `payments`, `first_payment`, `later_payment`, `one_off_total` (the joining fee and add-ons charged in full with the first payment), `year_one_total` (what is paid over the first twelve months), `admin_fee` and `admin_fee_net`. |

### `additional_venue`

| Key | Present | Meaning |
| --- | --- | --- |
| `centre_id` | always | The Training_Centres record the venue is for. |
| `accreditation_id` | always | The Training_Centre_Accred record being paid. |

### `membership_addon`

| Key | Present | Meaning |
| --- | --- | --- |
| `membership_deal_id` | always | The member's current membership Deal. |
| `addons` | always | JSON of the add-on quantities, for example `{"badge":1}`. `{}` if none. |
| `bundle_amount` | always | Gross amount for the membership bundle (`0.00` if none). |
| `certificate_amount` | always | Gross amount for extra certificates (`0.00` if none). |
| `badge_amount` | always | Gross amount for badges (`0.00` if none). |
| `sticker_amount` | always | Gross amount for window stickers (`0.00` if none). |
| `total_amount` | always | What is charged now, gross. The first payment on a monthly plan: the ongoing monthly payment plus the joining fee and any add-ons in full. |

### Common keys

| Key | Present | Meaning |
| --- | --- | --- |
| `email` | always | The customer's verified sign-in email. |
| `name` | always | The customer's full name (from the CRM Contact, or the name typed before a Contact exists). |
| `currency` | always | Always GBP. |
| `status` | always | Always `pending` when the session is made; the real outcome arrives with the payment events. |
| `source` | always | Always `portal_v2`, so Creator can tell portal sessions from any other source. |
| `type` | always | The purchase type: membership, membership_insurance, insurance, accreditation, additional_venue or membership_addon. |
| `contact_id` | always | The CRM Contact id. Always set when paying: the portal makes the Contact first if there is none. |

## Subscription metadata (`customer.subscription.*`, and on invoices as `parent.subscription_details.metadata`)

| Key | Present | Meaning |
| --- | --- | --- |
| `plan` | always | `annual` or `monthly`. |
| `contact_id` | always | The CRM Contact id, so a renewal can find the customer without the session. |

## Line item product metadata

| Key | Meaning |
| --- | --- |
| `sku` | The price list code (the Books SKU). Catalogue lines have it as the price's `lookup_key` instead. |
