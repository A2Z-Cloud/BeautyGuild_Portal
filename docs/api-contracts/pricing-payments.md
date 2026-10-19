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
`accreditation` (bundle price when the Contact has no current membership, international price rule as V1), `additional_venue`, `membership_addon`, and `membership` (new, renewal, upgrade).

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

## Not built yet
Insurance purchases and membership with insurance (rating tables and rules, IPT, declarations, sanctions check, creation of the insurance CRM records before payment) are not ported from V1.
