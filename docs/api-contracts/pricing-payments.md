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
- Pages: `/insurance/buy` and the "Add insurance" section of `/membership/buy`. The questions live in `src/insuranceInputs.js` and also drive the saved-application journey.
- Sanctions checks and policy documents are not part of this checkout.
