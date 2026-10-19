# Catalogue-driven Stripe checkout

Follows V1 (`beauty-guild-catalyst`): the portal function creates the Stripe Checkout Session and holds the Stripe key. **Creator owns the Stripe webhook and everything after payment** (marking Deals Active, invoices, payment and add-on records). This function has no webhook.

## How it works
- `src/catalogue.js` lists ITEMS (each points at a Stripe price ID, supplied as an env var such as `STRIPE_PRICE_ACCREDITATION`) and SERVICES (who may pay, which items apply, the metadata Creator expects).
- Books is the source of truth for prices and syncs to Stripe. The portal stores no amounts: it reads each item's live price from Stripe (must be active, GBP).
- `GET /portal/checkout/quote?service=&recordId=` returns a server-built summary. `POST /portal/checkout` creates the session and returns `checkoutUrl`. Amounts from the browser are ignored.
- Every request needs a signed-in user whose verified email matches exactly one CRM Contact, and the record must belong to that Contact.
- Metadata keys match V1 (`type`, `accreditation_id`, `contact_id`, `membership_deal_id`, `product_amount`, ...) so Creator keeps working.
- Open sessions for an accreditation are reused (`Stripe_Checkout_Session_ID`); paid ones return `alreadyPaid`. Accreditation sessions write `Stripe_Checkout_Session_ID` and `Payment_Status = Payment Processing` back to the CRM, as V1 does.
- Only `sk_test_` keys are accepted until live use is agreed.

## Services now
`insurance` (standalone), `accreditation` (bundle price when the Contact has no current membership, international price rule as V1), `additional_venue`, `membership_addon`, and `membership` (new, renewal, upgrade).

### Membership purchase
- Levels `associate`, `full_non_salon`, `full_salon` (international is refused: priced individually). Branches `beauty|holistic|nails|hair`; additional branches and add-ons optional. Annual or monthly.
- Subscription mode: the membership item is recurring; joining fee (new members only), additional branches and add-ons are one-off lines on the first invoice. Stripe prices must have the interval the catalogue expects (year/month, count 1) or the item is refused.
- Price IDs (env): `STRIPE_PRICE_MEMBERSHIP_{ASSOCIATE|FULL_NON_SALON|FULL_SALON}_{ANNUAL|MONTHLY}`, `STRIPE_PRICE_MEMBERSHIP_JOINING_FEE`, `STRIPE_PRICE_MEMBERSHIP_BRANCH`, plus the `STRIPE_PRICE_ADDON_*` items.
- A signed-in user with no CRM Contact may buy (V1 public path): `contact_id` is empty and Creator creates the Contact after payment. A Contact with an active membership must renew or upgrade (`previousId`, owned Deal), which waives the joining fee. Metadata keys match V1 including net amounts (the zero-rated element of the fee is split out for Creator).
- Page: `/membership/buy` (renew: `?renew=<dealId>`).
- Join page details: the POST also accepts `businessName`, `address1`, `address2`, `town`, `county`, `postcode` (each trimmed to 100 characters). Non-empty values go in the session metadata as `business_name`, `address_line_1`, `address_line_2`, `town`, `county`, `postcode`, so Creator can store the trading name and address. Quotes ignore them.
- Extras are named `Certificate`, `Badge` and `Window sticker` in Stripe line items and the price panel.

## Adding a service
1. Add its items to `ITEMS` and set `STRIPE_PRICE_*` env vars (a new Books item synced to Stripe gives the price ID).
2. Add an entry to `SERVICES` with `prepare()` (ownership check, lines, metadata).
3. Add a route link in the portal to `/pay/<service>/<recordId>`.

## Env
`PORTAL_BILLING_ENABLED=true`, `STRIPE_SECRET_KEY` (test), `PORTAL_PUBLIC_ORIGIN`, `STRIPE_PRICE_*`. Client: `VITE_PORTAL_BILLING=true`. Not sent: the Stripe webhook secret.

## Insurance
Ported from V1 (`calculateInsuranceQuote`, `evaluateInsuranceRules`, `createInsuranceRecords`) into `src/insurance.js`. Two entry points: `service=insurance` (standalone, one-off payment) and `service=membership` with an `insurance` object (membership subscription plus insurance in one checkout, metadata `type=membership_insurance`).
- **Request**: `country` (territory) and `insurance` (the V1 `ins*` answers). The body is cleaned to a fixed shape: unknown keys are dropped, numbers are bounded, at most 10 named people, and the route is derived from `insSalon`, never trusted from the browser. Use `POST /portal/checkout/quote` (the answers are too big for a query string); `GET /quote` still serves the other services.
- **Rating**: V1 tables and formulas. Premiums are computed, so each cover row and the IPT line (12% of the net total, rounded once to the penny) go to Stripe as inline `price_data` (name, `unit_amount`), not catalogue price IDs. Insurance is one-off, so it rides on the first invoice of a subscription.
- **Rules** (STOP, REFER, PASS): as V1. Territory is UK, the UK nations, Channel Islands or Isle of Man (V1 treated "England" and the other nations as unsupported; the portal's country list contains them, so they count as UK here). Paying also requires every declaration and confirmation to be answered (V1 left that to its wizard), and the premises address when property cover is chosen.
- **Not payable online**: a REFER or STOP quote is returned by `/quote` with `payable: false` and the reasons, and `POST /portal/checkout` refuses it (422, `REFERRAL_REQUIRED`) before anything reaches Stripe. A pay attempt that is REFER or STOP is recorded in the CRM for the Insurance team (a `Referred` Insurance_Policy, see [insurance-risk-checks.md](insurance-risk-checks.md)); a quote never writes anything. The sanctions, flood and subsidence checks add their findings to these rules.
- **CRM records before payment, as V1**: Insurance_Policy (Application_Status `Ready for Payment`, Entry_Route `Existing Member` or `Public Prospect`, Membership = the current active Deal if any), Insured_Premises, Insured_People, Insurance_Extension (one per cover row) and Declarations. Created only on a payable checkout, never on a quote. Their ids go in the session metadata exactly as V1: `insurance_policy_id`, `insured_premises_id`, `insured_people_ids`, `insurance_extension_ids`, `insurance_declarations_id`, plus `insurance_amount` (gross), `insurance_net_amount`, `insurance_ipt_amount`, `insurance_route`, `insurance_requested`. For membership with insurance `total_amount_net` adds the insurance total, which carries no VAT.
- **Standalone metadata**: `type=insurance`, `quote_reference`, `entry_point`, `contact_id`, `membership_deal_id`, `membership_profile_id`, `name`, the insurance keys above, `total_amount`. V1 had no standalone insurance checkout, so Creator's webhook needs a branch for `type=insurance` (activate the policy from `insurance_policy_id`).
- **Contact link**: same rule as membership. A verified email matching one Contact is linked; no Contact means a public prospect (`contact_id` empty, Policy and Declarations have no Contact) and Creator creates the Contact after payment.
- **Who may buy**: insurance is included with Full membership only. Standalone insurance needs a current Full membership (Active, in date, Full Member (Non-Salon) or (Salon)); membership with insurance is refused for the Associate level. Both return 409 `INSURANCE_NEEDS_FULL_MEMBERSHIP` with a customer message.
- **Retries**: an identical application (same answers, lines and user) within 5 minutes reuses the CRM records and the open Stripe session, so a double click or retry creates one set of records and one session. Per function instance, like the rate limiters. A failed attempt is forgotten so the retry can succeed.
- **Limits**: pay attempts that create insurance records are limited to 3 a minute and 10 an hour per user (429 `RATE_LIMIT`); a reused attempt does not count. Quotes keep the general limit.
- **Known limit**: a payment abandoned for more than 5 minutes leaves the policy at `Ready for Payment`, and a new attempt creates a new set of records. Creator can expire stale ones.
- **UAT changes to the answers (AL-INS log, rows 004 to 075)**: the rating tables and prices are unchanged; only what the portal collects and some rule wording moved.
  - Turnover is three radio bands (up to £100,000, £100,001 to £175,000, £175,001 to £250,000). The portal sends the band's upper limit as `insTurnover`, which falls on the same £75, £100 and £150 medical malpractice bands as before. Above £250,000 is a STOP as before (the portal gives the office number instead of an option).
  - Wage roll is a yes/no, `insWageRollOver125k` (salon only). `yes` is a STOP (`WAGE_ROLL_LIMIT`, "Please call the office to discuss your application."). The wage roll figure `insWageRoll` is only asked when Employers' Liability is added, still rated at 0.2%, minimum £75, and a figure over £125,000 is the same STOP.
  - `insPropertyAwayMaxItem` (salon, property away): the highest single item. Over £10,000 is a STOP (`PROPERTY_AWAY_ITEM_LIMIT`). It is not stored in the CRM yet (no field).
  - Declarations are shown as statements ("I agree" or "I do not agree"). The portal turns each answer into the answer the function expects before sending `insDeclarations` (agreeing is `no` for the first five and `yes` for the last two), so the request, the REFER rule and the Declarations record are unchanged.
  - Treatment extension names (quote lines, `Cover_Summary`) now read as the customer's list: "Red Veins, Skin Tags, Milia, Warts & Moles by Advanced Electrolysis", "Microneedling or Dermarolling", "Nose and Cartilage Piercing", "Microblading, Semi-Permanent Make Up & Micropigmentation", "Dermaplaning". The portal shows each price with IPT (£31.36, £200.76, £15.85, £200.76, £200.76; teaching £84 and £168).
  - The buy page has one section per cover, no running price panel, and a quote summary where each cover can be edited or removed (the portal maps a quote line back to its answers by its name, `Insurance - <label>`). Policy wording documents are named but not linked until the customer's documents are supplied (AL-INS-039).
- Pages: `/insurance/buy` and the "Add insurance" section of `/membership/buy`. The questions live in `src/insuranceInputs.js` and also drive the saved-application journey.
- Sanctions checks and policy documents are not part of this checkout.

## Start dates
- Membership and insurance take an optional `start` (ISO date). No date means today. A date from today up to 30 days ahead (UTC days, `START_WINDOW_DAYS` in `catalogue.js`) is accepted; anything else is refused with 422 and the allowed range, never silently changed.
- A membership bought with insurance uses one date for both. The term and the policy year each end the day before the anniversary.
- The date goes to Creator as `membership_start` and `membership_expiry`, and for insurance as `insurance_start_date` and `insurance_end_date`. The insurance policy record is created with `Policy_Start_Date` and `Policy_End_Date`.
- The member pays now. The portal shows any record whose start date is after today as Coming soon with the date, until that day.
- Whether Creator and the CRM treat a future-dated record as pending until its start date is Creator's side to confirm.

## Guest pricing (no account)
- `POST /public/quote` prices a **membership** (optionally with insurance) for a signed-out visitor, so the buy form can be filled in and priced before sign-up. It is off unless `PUBLIC_QUOTES_ENABLED=true` (and billing is on); the client flag is `VITE_PORTAL_PUBLIC_QUOTES`.
- It reads only Stripe prices and the rating tables. No CRM, Creator or Analytics call is made, there is no risk screening, and no record is written. The answer is marked `indicative: true`: the real checks (including sanctions, flood and subsidence) run when the member pays.
- Renewals, upgrades, standalone insurance and accreditation are refused (422 `SIGN_IN_FOR_PRICE`). Rate limited to 30 a minute per client.
- Checkout, drafts and every record write still need a signed-in account. The buy page keeps a guest's answers in the browser tab (sessionStorage, never sent anywhere, consent never restored) and sends them to the account checkpoint at the Pay step; the answers are cleared after a successful payment.

## International accreditation

A centre outside the UK is flat-rated and VAT-free (V1): £350, or £405 with the £55 International membership when the applicant has no current membership. Items `accreditation_international` (`STRIPE_PRICE_ACCREDITATION_INTERNATIONAL`) and `accreditation_international_bundle` (`STRIPE_PRICE_ACCREDITATION_INTERNATIONAL_BUNDLE`) hold the Stripe price IDs. Until both are set the checkout answers 409 "cannot be bought online yet". The metadata membership type is International.

### Resuming and expiring insurance quotes
- Each payable attempt stores on the Insurance_Policy `Stripe_Checkout_Session_ID`, `Quoted_Amount` (gross, with IPT) and `Quote_Expiry` (date). The Stripe session is created with `expires_at` 23 hours 50 minutes ahead (Stripe's maximum is 24 hours), and `Quote_Expiry` is that day.
- `POST /portal/checkout/resume {policyId}` (own Contact's policy only, status `Ready for Payment`): an open session returns its `checkoutUrl`; a paid one returns `alreadyPaid`; an expired, missing or never-created session sets `Application_Status = Expired` and returns 409 `QUOTE_EXPIRED`. Referred and Stopped quotes are not resumable (and stay hidden from the member).
- Records: insurance records carry `quotedAmount`, `quoteExpiry` and `canPay`. A `Ready for Payment` policy past its `Quote_Expiry` shows as Expired without a CRM write. The record page shows the quoted amount and a "Pay now" button when `canPay`, or "Get a new quote" when expired. Creator's webhook should still set the status on payment.
