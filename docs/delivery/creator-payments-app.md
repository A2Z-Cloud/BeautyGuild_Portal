# Creator payments app: where we are and what is next

Written 24 October 2026 so the Creator work can be picked up later. The portal side is done and deployed to Development (Stripe test mode only). The Creator app is a **new app built from scratch**, separate from the V1 Creator app, and it only covers **payments**. Mid-term changes (section 6), cancellations and vouchers are separate pieces of the full Creator scope. **Cancellations, downgrades, upgrades and refunds are specified in [cancellations-refunds-spec.md](cancellations-refunds-spec.md)** (draft, 29 October 2026). The portal side of mid-term changes is built and deployed to Development, switched off; section 6 is what Creator must do for it.

## 1. Where things stand

**Portal (Development, `main` plus [PR 65](https://github.com/A2Z-Cloud/BeautyGuild_Portal/pull/65), which is deployed but not yet merged)**
- Price list v2 is built. Prices are found in Stripe by **lookup key** (the price list code), so a price change is a new Stripe price and no deployment.
- Every membership level is £55 (£38.00 zero-rated, £14.17 standard-rated, £2.83 VAT). Named employees pay a £55 membership fee as well as any premium.
- **Monthly plans:** the yearly price plus a £1.50 monthly admin fee, divided by 12, each payment rounded up. The joining fee and add-ons are charged once, in full, on the first payment (changed 27 October, MTA-D22), so there is no schedule and the monthly amount is the same at every renewal.
- **Renewal:** membership, insurance, extra branches, employee fees and accreditation all renew automatically, yearly or monthly.
- Every inline Stripe line carries its price list code (the Books SKU) in product metadata. Catalogue lines have it as the price's `lookup_key`.
- Full detail: [pricing-payments.md](../api-contracts/pricing-payments.md).

**Stripe (test mode):** 16 catalogue prices with lookup keys, the old prices archived, the old test subscriptions cancelled. One webhook endpoint matters: Creator's (V1 handler, `zohoapis.eu`). The portal function's own `/stripe/webhook` was removed on 27 October with the monthly schedule. `invoice.paid` has been added to Creator's endpoint.

**Books:** 53 items imported with SKUs, taxes and (for 18 of them) Stripe price IDs. A membership is two Books items (zero-rated and standard-rated). Insurance premiums are VAT exempt; IPT is its own item (`INS-IPT`).

**Verified with a real payment:** an annual accreditation with Associate membership (£409). Session `mode=subscription`, `subscription_type=annual`, line `sku=ACC-ASSOC`, subscription metadata `plan=annual` and `contact_id`.
**Not yet verified with a real payment:** monthly membership with a joining fee and a badge (first invoice with the joining fee and badge in full, then the ongoing amount), annual membership with insurance, insurance on its own, monthly accreditation, a one-off additional venue.

## 2. The Creator app (agreed shape)

Flow: **Stripe event, then the log, then (fetched from Stripe) payment, invoice and subscription, then the CRM update, then Books.** Each step records what it did so it can be retried.

Forms already built: **Stripe Webhook Log**, **Invoice Records**, **Subscription**. What each purchase sends to Stripe, the metadata keys and how to test are in the [Creator handover](creator-handover-price-list-v2.md); the fields are on the forms themselves. Decisions taken:
- The log is a plain inbox: Event ID (no duplicates), type, raw payload, status, attempts, Stripe object id, livemode. No business logic in it.
- Invoice details stay lean: lines are saved as **JSON** in one field (code, name, qty, gross, interval; a `discounts` array, defined in [vouchers-creator-spec.md](vouchers-creator-spec.md)). Line reporting is Books' job, not Creator's.
- Invoices have **Stripe Invoice ID (no duplicates)** and a **Subscription** lookup, plus **Books Sync Status** and **Books Error** so a failed push is visible and retryable.
- Subscriptions hold the checkout metadata snapshot, because renewals do not carry it.
- Creator **fetches the object from Stripe by id** (with `expand`) rather than trusting the event payload, pinned to API version `2026-06-24.dahlia` (what Creator's endpoint already sends) through one constant.
- One trigger per outcome so nothing activates twice: a subscription activates on its **first paid invoice** (`billing_reason=subscription_create`); a one-off activates on `checkout.session.completed` when paid. Later invoices (`subscription_cycle`) only extend dates and record the payment.

**Facts learned from real events**
- **Events arrive out of order.** For a subscription purchase `invoice.paid` arrived a second **before** `checkout.session.completed`. On the first paid invoice the processor must fetch the session with `GET /v1/checkout/sessions?subscription=sub_...` (expand `line_items`) to get the full metadata and codes.
- On the 2026 API versions an invoice's subscription is under `parent.subscription_details` (`subscription`, `metadata`), not at the top.
- Invoice lines carry only `price` and `product` ids and Stripe's own description. The code is on the **product** (`metadata.sku`) for inline lines, or the price's `lookup_key` for catalogue lines. Never map by description or name.
- `invoice_payment.paid` is a separate event Creator's endpoint does not listen to. It is not needed.

## 3. What Creator must handle (check against the V1 handler)
See section 5 of the [Creator handover](creator-handover-price-list-v2.md). In short: `subscription_type` (`annual` or `monthly`) on membership and accreditation; monthly lines are **monthly shares** and the amount drops at payment 13 when there were year-one lines; insurance on its own is now `mode=subscription`; `named_employee_membership` (JSON) is new and sits outside IPT; `contact_id` is now set for new customers too; every renewal arrives as `invoice.paid`.

**Splitting a membership into the two Books items:** take 38/55 of the membership line as the zero-rated item and the rest as the standard-rated item (VAT is 20% of that), putting any rounding on the standard line, so the invoice total always equals Stripe's.

**Vouchers and discounts.** What Creator must do (the `discounts` entry, redemptions held in Creator, the Waive_Logs status, Books line discounts, and issuing the £25 GTi voucher) is in [vouchers-creator-spec.md](vouchers-creator-spec.md). The staff side is in [vouchers-staff-route-spec.md](vouchers-staff-route-spec.md).

## 4. Open decisions
- Additional venues (£60 a year) are still a single payment. Should they renew with the accreditation?
- Renewals charge the same amounts as year one (no re-rating), and renew a year after payment, not after the chosen policy start date (up to 30 days apart).
- International Accreditation: zero-rated or outside the scope of VAT (finance)? Currently Zero Rate in Books. The IPT item should post to an IPT payable account (name needed).
- Creator should record failed payments and cancellations as statuses only for now.
- The portal function's own Stripe webhook is registered for test mode only.

## 5. Next steps, in order
1. **Receiver, log only.** A new Creator function (appendix A) that verifies nothing it cannot (the endpoint may not expose the signature header; the fetch is the defence), saves one log row per Event ID, and returns 200. Register it as a **second** Stripe test endpoint with the same events including `invoice.paid`. Leave the V1 endpoint alone until cutover.
2. Run the real test purchases listed above and confirm one row per event, the right types and nothing duplicated. Real full events can be pulled any time with the Stripe events API (`GET /v1/events`); do not commit them (they hold test customer details).
3. **Processor skeleton:** read a Received row, fetch the object with the pinned version and `expand`, route by event type.
4. **First full slice: a one-off payment** (additional venue), end to end: fetch, invoice, CRM update, Books push.
5. Subscription first payment (annual), then monthly first payment (with the metadata snapshot on the Subscription), then renewals (`invoice.paid` with `subscription_cycle`), then failures and cancellations.
6. **Books push** as its own scheduled function with retry and a Failed view. Use `get_books_item` (appendix B) and never create items; the invoice number should be the Stripe invoice id so a retry cannot duplicate.
7. Cut over once each path has passed.
8. **Mid-term changes** (section 6): after the first full payment slice works, build the `insurance_change` handler, the daily scheduler and the `membership_change` handler.

Carry-over from V1 **not to repeat:** the additional venue branch swapped VAT and net (`vat_amount = gross / 1.2` is the net; VAT is `gross - gross / 1.2`); the log was marked Processed before the work finished; `books_customer_id` was used after a failed lookup; and the Books item function created a £0.00 item for any unmatched name (the source of the junk "1 × ..." items).

## 6. Mid-term adjustments (MTAs): what Creator must do

Added 28 October 2026. The portal side is merged and deployed to Development with its switches off. Until the Creator handler below exists, a paid change stays **Awaiting Payment** and its cover rows stay **Draft**: nothing takes effect. Sources: [stripe-metadata.md](../api-contracts/stripe-metadata.md) (`insurance_change`, `membership_change`), [pricing-payments.md](../api-contracts/pricing-payments.md), `docs/delivery/mta-r3-plan.md` and the customer spec `requirements/mta/customer-portal-functional-spec.md` (both arrive with [PR 30](https://github.com/A2Z-Cloud/BeautyGuild_Portal/pull/30), so these two paths do not exist on main until it is merged).

### 6.1 What the portal has already written before payment
- A **Policy_Revisions** row for each start date in the basket (up to 3): `Revision_Status` Quoted, then **Awaiting Payment** once a Checkout Session exists, with `Stripe_Checkout_Session_ID`, `After_Quote_ID`, `Requested_Effective_Date`, `Premium_Delta_Net`, `IPT_Delta`, `VAT_Delta`, `MTA_Fee` and `Request_Details` (JSON: the change asked for, the declarations, the quote `items`, `removePeople` and `endings`).
- **Draft** `Insurance_Extension` and `Insured_People` rows linked by `Policy_Revision`, dated `Effective_From` to the policy end. An increase or swap names the row it replaces in `Supersedes_Extension`.
- `Request_Details.endings` lists the **live** rows and people the change ends, each with `effectiveTo` (the day before the new cover starts). The portal never edits live cover.
- The portal only ever sets Quoted, Under Review (referred), Awaiting Payment and Withdrawn. **Creator owns Approved, Scheduled and Applied.**

### 6.2 Trigger and checks (insurance changes)
- Trigger: `checkout.session.completed` with `mode=payment`, `payment_status=paid` and `metadata.type=insurance_change`. Fetch the session from Stripe (with `expand`), as for every other purchase. Do not trust the event payload.
- The metadata carries `revision_ids`, `effective_dates` and `quote_ids` (comma separated, same order) and `revision_count`.
- **Verify before changing anything:** `amount_total` equals `total_amount`; every id in `revision_ids` exists; each has `Stripe_Checkout_Session_ID` equal to this session and status Awaiting Payment; each `After_Quote_ID` matches `quote_ids`. If any check fails, record an exception on the log row, change nothing, and tell the office.
- **Idempotent:** key on the revision id. A repeated event, a retry or an out-of-order event must not apply a revision twice. A revision already Approved, Scheduled or Applied is skipped.
- `checkout.session.expired`: set each of its revisions from Awaiting Payment back to Quoted and clear the session id, so the member can pay again. (Proposed; the portal also expires a session itself if it cannot mark the CRM.)

### 6.3 Applying a revision (in effective-date order)
1. Set `Revision_Status` to **Approved** (paid and verified).
2. If `Requested_Effective_Date` is in the future: set **Scheduled**, leave the rows Draft, and let a daily scheduled function apply it when the date arrives (section 6.5).
3. Otherwise apply now:
   - Set each Draft `Insurance_Extension` and `Insured_People` row linked to the revision to the active status.
   - For each entry in `endings` (and for any row named by `Supersedes_Extension`): set `Effective_To` to the `effectiveTo` given and move it to the replaced or removed status. Never delete rows.
   - Set the revision **Applied**, with an applied timestamp and the Stripe session id.
4. Do not touch the policy's Payment_Status, Application_Status or Policy_Status. **Setting Payment_Status to Paid fires the INS Policy Activation workflow**, which an MTA must never do. The Guild confirmed the workflow does not run on draft rows; the Creator handler must keep to that.
5. A swap or increase must end the old row and start the new one in the same run, so there is never a day with both or neither.

### 6.4 Money and Books
- Create one Invoice Record for the payment. Lines come from the session line items, mapped by the product `metadata.sku` (never by description): the premium rows (`INS-*`, `CALC-*`), `INS-IPT`, `FEE-MTA` and, for a named employee, `MEM-FULLNS-Y` (the pro-rated £55 fee, split 38/55 zero-rated and the rest standard-rated as in section 3).
- Split by revision using each revision's own deltas (`Premium_Delta_Net`, `IPT_Delta`, `VAT_Delta`, `MTA_Fee`), so Books can show one adjustment per start date. The £5 fee is once per start date and includes VAT, with no IPT.
- Net credits (a removal or a reduction) are **never collected or refunded by Creator**. The portal tells the member to call the office, which handles refunds and the £10 cancellation fee.
- Monthly payers are not payable online today (referred). If that changes, the rules are in spec section 13B.

### 6.5 Scheduled function
Daily, find revisions with status Scheduled and `Requested_Effective_Date` on or before today and apply them as in 6.3. Log each run, retry failures, and show a Failed view. A policy with a revision stuck in Approved or Scheduled past its date is an exception for the office.

### 6.6 Membership changes (`membership_change`, `mta_scope=membership`)
- Trigger: `checkout.session.completed`, `mode=payment`, `type=membership_change`. Same fetch and amount checks.
- An extra branch: add it to the Deal's branches and create the **Membership_Extension** row from `secondary_branches`. The charge is pro-rated to the end of the term; `branch_yearly_amount` is the full yearly price the branch costs **from the next renewal**, so add it to the renewal subscription. Flat items (`addons`: badge, certificate, sticker, bundle) are charged in full, with no £5 fee, and create their Membership_Extension rows with quantities.
- No Revision record is made for a membership change. The term dates on the Deal do not change.

### 6.7 To agree before building
- The exact status values for replaced, removed and active rows on Insurance_Extension and Insured_People (the portal treats draft, cancelled, superseded, replaced, expired and removed as not current).
- Whether the policy's stored premium totals are recalculated from the active rows by Creator or by a CRM workflow.
- Whether Creator sets `Document_Status` to Regenerate on Applied so CRM makes the endorsement documents. Documents, emails and the bordereau stay in CRM; the portal does none of them.
- The renewal date against the policy anniversary (MTA-D20) and a change in the last month of an already renewed policy (MTA-D23).
- Whether employees get a membership record or certificate (MTA-D26). Today the £55 is a fee on the payer, with no employee record.

### 6.8 Tests (Development, Stripe test mode)
One revision paid now; a basket of two dates paid in one checkout (two revisions applied in date order, one `FEE-MTA` each); a future-dated revision that stays Scheduled and applies on its date; a swap that ends the old row and starts the new one; a repeated and an out-of-order event (applied once); an amount mismatch (nothing changes, exception logged); an expired session (back to Quoted); and a branch bought as a membership change. After each, check the live policy status and Payment_Status are untouched and that no activation or document workflow fired.

## Appendix A: V2 receiver (log only)
Adjust the field link names to the form (V1 used `status_field` for Status).

```deluge
string Stripe_Webhook.stripe_webhook_v2(string payload)
{
	// NOTE: V2 receiver. It only LOGS the Stripe event (once, by Event ID). It does not create
	// or update anything in the CRM or Books. Processing happens later, from the log row.
	try 
	{
		json_payload = payload.toMap();
		incoming_event_id = json_payload.get("id");
		incoming_type = json_payload.get("type");
		if(incoming_event_id == null || incoming_type == null)
		{
			return "Not a Stripe event: missing id or type.";
		}
		existing_log = Stripe_Webhook_Log[Event_ID == incoming_event_id];
		if(existing_log.count() > 0)
		{
			return "";
		}
		event_object = Map();
		data = json_payload.get("data");
		if(data != null && data.get("object") != null)
		{
			event_object = data.get("object");
		}
		subscription_details = Map();
		parent = event_object.get("parent");
		if(parent != null && parent.get("subscription_details") != null)
		{
			subscription_details = parent.get("subscription_details");
		}
		else if(event_object.get("subscription_details") != null)
		{
			subscription_details = event_object.get("subscription_details");
		}
		payment_type = "";
		metadata = Map();
		if(incoming_type == "checkout.session.completed")
		{
			metadata = ifnull(event_object.get("metadata"),Map());
			payment_type = ifnull(metadata.get("type"),"");
		}
		else if(incoming_type.startsWith("invoice."))
		{
			metadata = ifnull(subscription_details.get("metadata"),Map());
			if(event_object.get("billing_reason") == "subscription_cycle")
			{
				payment_type = "Renewal";
			}
			else
			{
				payment_type = "Subscription";
			}
		}
		else if(incoming_type.startsWith("customer.subscription."))
		{
			metadata = ifnull(event_object.get("metadata"),Map());
			payment_type = "Subscription";
		}
		related = Map();
		related.put("contact_id",ifnull(metadata.get("contact_id"),""));
		related.put("accreditation_id",ifnull(metadata.get("accreditation_id"),""));
		related.put("insurance_policy_id",ifnull(metadata.get("insurance_policy_id"),""));
		related.put("membership_profile_id",ifnull(metadata.get("membership_profile_id"),""));
		stripe_created = null;
		created = json_payload.get("created");
		if(created != null)
		{
			stripe_created = (created.toLong() * 1000).toTime();
		}
		log_id = insert into Stripe_Webhook_Log
		[
			Added_User=zoho.loginuser
			Event_ID=incoming_event_id
			Event_Type=incoming_type
			Raw_Payload=payload
			Received_Time=zoho.currenttime
			Status="Received"
			Payment_Type=payment_type
			Related_CRM_Records=related.toString()
			Stripe_Object_ID=event_object.get("id")
			Livemode=(json_payload.get("livemode") == true)
			Attempts=0
			Stripe_Created=stripe_created
		];
		info "Logged " + incoming_event_id + " (" + incoming_type + ")";
	}
	catch (e)
	{
		return e;
	}
	return "";
}
```

## Appendix B: get-only Books item lookup (never creates)

```deluge
map Books.get_books_item(String sku)
{
	// NOTE: Finds an ACTIVE Zoho Books item by its SKU (the price list code). It only reads.
	// If the SKU is not in Books the caller must mark the invoice Failed.
	if(sku == null || sku.trim() == "")
	{
		return {"status":"error","message":"No SKU supplied."};
	}
	wanted = sku.trim();
	organisation_id = "20117176507";
	books_base_url = "https://www.zohoapis.eu/books/v3";
	// Deluge has no while loop, so the pages are a short list.
	pages = {1,2,3};
	more_pages = true;
	for each  page in pages
	{
		if(more_pages == true)
		{
			list_url = books_base_url + "/items?organization_id=" + organisation_id + "&filter_by=Status.Active&per_page=200&page=" + page;
			list_response = invokeurl
			[
				url :list_url
				type :GET
				connection:"zoho_books_connection"
			];
			if(list_response.get("code") != 0)
			{
				return {"status":"error","message":"Books item lookup failed. Response: " + list_response.toString()};
			}
			for each  item in list_response.get("items")
			{
				if(item.get("sku") != null && item.get("sku").trim() == wanted)
				{
					return {"status":"success","item_id":item.get("item_id"),"name":item.get("name"),"rate":item.get("rate"),"tax_id":item.get("tax_id"),"tax_name":item.get("tax_name")};
				}
			}
			more_pages = list_response.get("page_context").get("has_more_page");
		}
	}
	return {"status":"not_found","message":"No active Books item has the SKU " + wanted + "."};
}
```
