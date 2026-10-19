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
`accreditation` (bundle price when the Contact has no current membership, international price rule as V1), `additional_venue`, `membership_addon`.

## Adding a service
1. Add its items to `ITEMS` and set `STRIPE_PRICE_*` env vars (a new Books item synced to Stripe gives the price ID).
2. Add an entry to `SERVICES` with `prepare()` (ownership check, lines, metadata).
3. Add a route link in the portal to `/pay/<service>/<recordId>`.

## Env
`PORTAL_BILLING_ENABLED=true`, `STRIPE_SECRET_KEY` (test), `PORTAL_PUBLIC_ORIGIN`, `STRIPE_PRICE_*`. Client: `VITE_PORTAL_BILLING=true`. Not sent: the Stripe webhook secret.

## Not built yet
New membership and insurance purchases (rating tables, VAT/IPT split, declarations, sanctions check, CRM record creation, subscription pricing) are not ported from V1. The checkout already supports recurring prices (subscription mode) for when they are.
