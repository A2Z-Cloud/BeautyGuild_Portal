# Vouchers and discount codes: review against Portal V2

Written 24 October 2026 for A2Z Cloud and the Guild of Beauty Therapists. This is a review only. Nothing has been built, and nothing has been changed in Stripe, Books or the CRM.

Sources: the Guild's "Discount Codes and Vouchers" document (the Word version of 24 October; the PDF of 20 October has identical text), [pricing-payments.md](../api-contracts/pricing-payments.md), [creator-payments-app.md](creator-payments-app.md), and `catalogue.js`, `checkout.js` and `plans.js` in `apps/portal/functions/beauty_guild_api/src`.

## Summary

- The document describes **six kinds of discount or credit**, and only **three of them are codes**: the school referral code (£10 off the joining fee), the £25 GTi voucher, and bespoke vouchers. The rest are staff goodwill, automatic rules, and a credit balance for schools.
- **Most of what the document calls a "discount" is already how the portal behaves** (no joining fee on renewals, upgrades and accreditation bundles). Two of those rules are only half right, see section 2.
- **Referral codes already exist in the CRM.** The portal reads `Referral_Code` and `Referral_Code_Active` from the school Account today (`schoolServices.js`). They do not need to be copied into Stripe.
- **The £25 voucher and bespoke vouchers do belong in Stripe**, as a Coupon plus a Promotion Code, created from the CRM. But the portal has no GTi course checkout yet, so the £25 voucher has nothing to be spent on in Portal V2 until that exists.
- **Four things in the portal make a plain "turn on Stripe's code box" approach wrong**: monthly plans (a one-off coupon would hit only the first small payment), insurance (the portal calculates IPT before Stripe sees the amounts), the portal does not create a Stripe Customer (so "once per customer" cannot be enforced by Stripe), and school credits (renewals now charge automatically, with nobody at a checkout to apply a credit).
- **Recommendation in one line:** the portal validates the code and shows the discount in the quote, then passes Stripe-native discounts on the Checkout session for what Stripe can express exactly (catalogue products, yearly or one-off), and prices the joining-fee referral discount itself. Details and the reasons are in section 3.

---

## 1. What the document asks for, journey by journey

### 1.1 Joining a membership or buying insurance (the Join page)
- **School referral code, £10 off the Joining Fee.** A new applicant for Beauty Guild insurance or membership enters an accredited school's unique code during the online application. Codes can be numeric (`12345`) or branded (`SIENNAX`). One use per user, unlimited users per code. Staff can enter the code for phone applications.
- **School credit.** When a student buys Beauty Guild insurance or Associate Membership using a school's code, the school gets a credit of £10 + VAT (£12) (see 1.5).
- **£25 GTi voucher issued.** Anyone who joins as Associate, International or Full, renews, or upgrades from GTi Student gets a unique £25 GTi voucher (see 1.6).
- **No code, automatic or staff-controlled:**
  - Renewing before expiry, or within one month after, has no Joining Fee. After more than one month the fee applies again.
  - Staff can waive the £10 Joining Fee as a goodwill gesture over the phone (back office, not a code).

### 1.2 Upgrades and policy changes
- **GTi Student to Associate or Full, while the student membership is active or within one month of expiry:** the Joining Fee is waived. Online, this uses the referral code of the school where the student most recently enrolled on a GTi course. By phone, staff enter that school's code.
- **£5 adjustment fee on insurance amendments.** Staff can remove it as a goodwill gesture. No code. (This belongs to the mid-term changes workstream.)

### 1.3 Membership extras
- Staff can discount branches, badges, window stickers, certificates and bundles manually in the back office. Not controlled by codes.

### 1.4 Accreditation and tutors
- A non-member applying for accreditation automatically gets Associate (International outside the UK) membership, with a primary membership of the Guild of Therapy Lecturers, and the £10 Joining Fee is discounted automatically. No code.
- **Referral credits (the school's balance):** see 1.5.

### 1.5 School referral credits
- Each qualifying purchase (insurance or Associate Membership, using the school's code) credits the school £10 + VAT = £12.
- Credits can be used towards **accreditation renewal fees** or **Diary Date listings for non-GTi courses**. Each Diary Date listing automatically deducts one £10 + VAT credit.
- Credits last while the accreditation is active. When it expires, all credits are removed and the balance resets to £0.

### 1.6 Discount vouchers
- **£25 GTi voucher:** unique to the member, single use, valid until their membership expires. Either £25 off a practical GTi course, or a £25 contribution towards a theory-only GTi course.
- **GTi pricing:** each course has a member and a non-member price (some member prices are £0). Eligibility is by membership status. No code.
- **Bespoke vouchers (currently made in Enki):** a generic code (not user-specific), each user may redeem once. Applies to specific products (membership extras) and GTi courses and certificates. Can be restricted to certain people (for example members only). Active for a period, expiring automatically, reusable for later promotions. Fixed amount or percentage off. Can be limited to a set number of uses. Issued to members, schools or anyone else.
- **School bundle pricing:** a few schools can enrol a student on several GTi courses for a single £25. Staff set this up. No code.

---

## 2. What is settled, and what conflicts with the portal as built

### 2.1 Settled (the user has told us, or the portal already matches)

| Point | Status |
|---|---|
| Vouchers are generated from the CRM and synced to Stripe so they work at checkout | Direction given by the user |
| £25 voucher is generated when an accreditation (or membership) becomes active | Direction given by the user |
| Referral codes and school referral credits exist | Direction given by the user |
| No Joining Fee on a renewal, an upgrade, or the accreditation + Associate bundle | Already built: the portal adds a `joining_fee` line only when there is no `previousId`, and `ACC-ASSOC` is the bundle price |
| Staff goodwill waivers, manual extras discounts, GTi member pricing and school bundle pricing are not codes | Settled by the document. Nothing for the portal checkout to do |
| Prices come from Stripe by lookup key (the price list code and Books SKU) | Built. A voucher must never carry an amount of its own that duplicates a price |

### 2.2 Conflicts with the portal as built

1. **The one-month renewal rule is not enforced.** The document says a renewal more than one month after expiry pays a new Joining Fee. The portal waives the fee for any owned `previousId`, however long ago the membership expired. The same applies to the GTi Student upgrade: the portal does not check that the previous membership was a Student membership, or that it was active or within one month of expiry. *Needs a rule in `catalogue.js`, driven by the expiry date, with no code involved.*
2. **Insurance has no Joining Fee line.** The document says an applicant for "Beauty Guild insurance or membership" gets £10 off the Joining Fee. In the portal, standalone insurance needs a current Full membership and never charges a Joining Fee. The fee only appears on a new membership, which may be bought with insurance. So a referral code on a standalone insurance purchase has nothing to discount. *Question for the Guild (question 2).*
3. **Associate membership has no insurance in the portal** (insurance is included with Full membership only). The credit rule says "insurance or Associate Membership". We need to know whether a Full membership bought without insurance earns the school a credit, because the document does not say.
4. **Renewals now charge automatically.** The document assumes a school applies credit "towards renewal fees". The portal now renews accreditation as a Stripe subscription (yearly or monthly), so nobody is at a checkout when it renews. A credit that is only applied at a checkout would never be used. *See 3.8.*
5. **Monthly plans spread the Joining Fee and extras over 12 payments** as inline monthly lines. A document-style "£10 off the Joining Fee" has to work with that. *See 3.1.*
6. **No Stripe Customer is created.** Checkout is opened with `customer_email`, so Stripe makes a new Customer per payment. Stripe rules such as "first-time customer" and "this code is for one customer" depend on a Customer that persists. *See 3.4.*
7. **The £25 voucher spends on GTi courses, which the portal cannot yet sell.** GTi courses are listed as deferred in [portal-v2-plan.md](portal-v2-plan.md). *Question for the Guild (question 10).*
8. **A code that discounts a recurring line would renew at the discounted price.** Renewals charge the same amounts as year one (open decision in creator-payments-app.md). If the portal simply lowered a recurring line's amount, the lower price would repeat every year. *See 3.1.*
9. **Creator's invoice JSON has an empty `discounts` array.** It needs defining before any code goes live (see 3.5).
10. **Phone applications.** The document says staff enter codes for phone applications. The portal needs a signed-in customer, so how staff take phone applications in V2 is not defined. *Question for the Guild (question 17).*

---

## 3. Technical questions, with a recommendation each

Stripe behaviour below is from Stripe's documented model. Where it matters I have marked **(verify)**, meaning it must be checked in Stripe test mode before it is relied on. Section 5 lists those checks.

### 3.1 How a Stripe discount behaves on a subscription, and on a monthly plan

**The model.** A Coupon is either a percentage or a fixed amount (GBP), with a duration:
- `once`: the first invoice only.
- `repeating`: the first N months.
- `forever`.

It can be limited to named Stripe Products (`applies_to`). A Promotion Code is the customer-facing string that points at a Coupon, with its own expiry, redemption limit, and restrictions (see 3.4).

**On a yearly purchase** (subscription mode, one invoice a year):
- Duration `once` discounts the first invoice and the renewals pay full price. This is almost always what the Guild means.
- `forever` would discount every renewal. Do not use it unless the Guild asks for that.
- A fixed amount scoped by `applies_to` to a product cannot take off more than that product's lines on the invoice.
- One-off lines (the Joining Fee and extras on a yearly purchase) are added to the first invoice, so `once` covers them.

**On a monthly plan** the portal builds every line as an **inline monthly price** with its own new Product each time, and a Stripe schedule drops the year-one lines at payment 13 (`ensureSchedule`). This breaks the obvious approach in three ways:
1. **The Joining Fee is not on the invoice as £10.** It is about 84p a month for 12 months (£6.92 first payment for an Associate, £6.09 after). A `once` coupon of £10 would cap at the first invoice and the rest of the discount would be lost (Stripe does not carry unused coupon value forward).
2. **Inline lines have no stable Product ID**, so `applies_to` cannot name them. A fixed coupon would take money off the membership and the admin fee as well.
3. **The schedule may drop the discount.** `ensureSchedule` rebuilds the phases from items only. A discount on the subscription may not survive onto the schedule's phases unless it is passed through **(verify)**.

A third consequence of the monthly arithmetic: if a coupon is applied on top of the plan's own rounding (each payment rounded up to the next penny, pence shared out by `allocate`), the discount and the rounding no longer reconcile to a number the Guild can state.

**Recommendation.** Use one rule, based on what the line is:

| Line | How the discount is applied |
|---|---|
| One-off line on a yearly or one-off purchase (Joining Fee, extras, additional venue) | Stripe-native coupon, `once`, scoped with `applies_to` to the catalogue Product; or the portal lowers the line (either is exact) |
| Joining Fee and extras on a **monthly** plan | **The portal lowers the year-one line before `splitMonthly` runs**, so the 12 shares are rounded once, correctly, and the first payment shown on the quote is the payment Stripe takes |
| A **recurring** line (membership, branch, accreditation, insurance) | Stripe-native coupon with duration `once` (yearly) or `repeating` for 12 months (monthly). **Never** lower the recurring line itself, because the lower amount would repeat at every renewal |

In phase 1 no code touches a recurring line, because the document asks for none on the membership fee itself. Bespoke vouchers might (the Guild to say, question 12). That is why recurring-line discounts are phase 3, not phase 1.

If monthly bespoke vouchers on extras matter, the cleanest later change is to send extras as price data against **one stable Stripe Product per SKU** (`price_data.product`), so `applies_to` can name them. The SKU would then also sit on the Product permanently. That is a change to `checkout.js`, noted here rather than assumed.

### 3.2 Which lines a code may discount, and the VAT and IPT effect

**Which lines.** A code should list the price list codes it may discount, never "everything". Suggested defaults:

| Code type | May discount | Never |
|---|---|---|
| School referral | `MEM-JOIN` only | everything else |
| £25 GTi voucher | GTi course lines (not built yet) | membership, insurance |
| Bespoke voucher | A list chosen in the CRM from: `MEM-BRANCH`, `MEM-BUNDLE`, `MEM-CERT`, `MEM-BADGE`, `MEM-STICKER`, `MEM-JOIN`, membership levels, accreditation, `ACC-VENUE`, GTi items | `MEM-ADMIN`, `INS-*`, `CALC-*`, `INS-IPT`, named employee fees |

The admin fee is excluded because it is a charge for paying monthly. The employee fee is excluded because it is a membership fee that sits outside the premium; the Guild can reverse this.

**VAT.** Portal prices are gross (VAT included). A discount is therefore a gross amount:
- On the Joining Fee (standard-rated), the VAT comes down by one sixth of the discount: a £10 discount is £8.33 net and £1.67 VAT.
- On a membership fee (£38.00 zero-rated, £17.00 standard-rated), the existing Creator rule is 38/55 zero-rated and the rest standard-rated, with rounding on the standard line. A discount on that line would follow the same split by default. **Finance must confirm** this, because a Guild may prefer to treat the discount as coming off the standard-rated part only (question 9).
- The invoice must end up equal to Stripe's total. This is the same rounding rule Creator already uses.

**IPT.** A discount on an insurance premium changes the IPT, and the portal has already calculated the IPT before Stripe sees it (IPT is 12% of the net premium total, rounded once, sent as the inline line `INS-IPT`). A Stripe coupon cannot fix this: it would discount the premiums and leave IPT calculated on the old figure, or discount IPT too, neither of which is correct tax.

**Recommendation.** The document does **not** ask for any discount on an insurance premium. So:
- No code may discount insurance premiums, IPT, or the named employee premium. This is a hard rule in the code list above, and a code with an insurance SKU is refused when it is created.
- If the Guild later asks for it, the **portal** must apply the discount **before** it rates IPT (discounted premium first, then IPT at 12% of that, rounded once), and then send both to Stripe as ordinary inline lines. The CRM policy would then also need both the list premium and the discounted premium, because underwriting needs the true premium. Treat that as a separate piece of work.

A discount on a **membership with insurance** bought together is fine as long as it targets non-insurance lines. The IPT stays untouched.

### 3.3 Duration on renewals

Renewals use the same inline amounts as year one (no re-rating). A code must therefore never be `forever` by accident:
- Referral and one-off extras are one-off lines anyway, so nothing carries into renewal.
- The £25 voucher is not a checkout discount on the membership.
- If a bespoke voucher is ever allowed on a recurring line, it must say "first year only" or "for as long as" in the CRM, and the CRM form must map that to `once` or `repeating` or `forever`. Default `once`.

### 3.4 Once per user, and first-time-customer rules

What Stripe can do on a Promotion Code:
- `max_redemptions`: a total count across everyone.
- `expires_at`.
- `restrictions.first_time_transaction`: only customers with no earlier successful payment.
- `restrictions.minimum_amount` (with currency).
- `customer`: only that Stripe Customer can use the code.
- The Coupon has its own `max_redemptions` and `redeem_by`.

What Stripe does **not** do: "each customer may use this shared code once". Stripe cannot express "unlimited uses overall, once per customer" for an ordinary shared code. That is exactly the school referral rule and the bespoke voucher rule.

Why this matters here:
- The portal passes `customer_email` and so creates a new Stripe Customer per payment. A returning member looks like a first-time customer to Stripe, and a `customer`-restricted code cannot be used, because there is no Customer to restrict it to. **(verify)** whether Checkout recognises an earlier Customer by email; do not rely on it.

**Recommendation.**
1. **The portal enforces once-per-user itself.** It records every redemption in the CRM against the Contact (code, date, session, payment status) and refuses a second use. "User" means the CRM Contact, not the browser and not a Stripe Customer.
2. For the referral code, the rule is nearly free: a Joining Fee is only charged to a new member, so a code can only matter once. Still record it, because a member who lapses for over a month pays a Joining Fee again (question 3).
3. **Personal vouchers (the £25) are unique codes**, one per member, with `max_redemptions = 1` and `expires_at` set to the membership expiry. Stripe then enforces single use atomically, and no Customer is needed. Binding to a Customer is optional later.
4. **Introduce a persistent Stripe Customer per Contact** (store `Stripe_Customer_ID` on the Contact and pass `customer` instead of `customer_email`). It is a change to checkout, but it also helps the cancellations work, the Stripe billing portal, and `first_time_transaction`. It is **not** required for phase 1.
5. **Limits at the moment of use.** Two checkouts opened at once can both pass a portal check. For referral codes this does not matter (no cap). For capped bespoke vouchers, rely on Stripe's `max_redemptions`, which Stripe applies atomically.
6. **Guard against guessing.** Referral codes can be five-digit numbers, which are easy to try. The code check needs a rate limit per user (for example 10 wrong codes an hour) and one neutral message for every failure ("That code is not valid"), without saying whether it exists, has expired, or is used up.

### 3.5 Who creates the Coupon and Promotion Code, and how Books records the discount

| Option | For | Against |
|---|---|---|
| **Creator (Deluge)** | Creator already owns the CRM-to-Stripe-to-Books chain, and runs on a CRM trigger (a Voucher record, or an accreditation becoming Active). It is where the £25 voucher is born. | Another Stripe key and API surface in Deluge. Needs the same idempotency care as V1 (do not create twice) |
| **Portal function** | Already holds the Stripe key | The portal function is a customer-facing request path. It should not mint codes on its own, and it does not know when an accreditation turned Active |
| **CRM Deluge directly** | Short | Hides business logic in CRM scripts, duplicates what Creator does |

**Recommendation: Creator creates the Coupon and Promotion Code**, from a CRM `Voucher` record, and writes `Stripe_Coupon_ID`, `Stripe_Promotion_Code_ID` and `Sync_Status` back to it. Rules:
- Idempotent: one Voucher record maps to one Promotion Code. A retry finds the existing one by code, never creates a second.
- The CRM record is the source of truth (the document's "separate section" that controls vouchers). The CRM, not Stripe, holds who a code was issued to.
- Metadata on the Coupon: `voucher_id`, `sku_list` (the price list codes it may discount), `issued_to_contact_id` when personal.
- Stripe codes are case-insensitive and must be unique among **active** codes. School referral codes are not synced, so they cannot collide. Bespoke codes need a uniqueness check in the CRM.
- The portal never creates Stripe codes. It only reads them.

**How Books records it.** Creator's invoice JSON already reserves a `discounts` array. Define it as one object per discount:

```json
{"code": "SPRING10", "promotion_code_id": "promo_...", "coupon_id": "...", "amount": "10.00", "applies_to_sku": ["MEM-JOIN"], "source": "stripe | portal_referral"}
```

- For Stripe-native discounts, read it from the Stripe invoice: `lines[].discount_amounts` and `total_discount_amounts`, alongside the expanded fetch Creator already does.
- For a portal-priced discount (the referral), Stripe never sees a discount, so the portal puts it in the Checkout metadata (`discount_code`, `discount_amount`, `discount_sku`, `referral_school_id`) and Creator copies it into `discounts`.
- In Books, push the **list price on the line plus a line-level discount**, so the VAT split follows the line and the invoice total equals Stripe's. Use the existing get-only item lookup. The discount must not create an item.
- The Books report then shows list price, discount and net income per code.

### 3.6 Should the portal validate the code itself and pass it on the session, or turn on Stripe's own code box?

**Recommendation: the portal validates, shows the discount in the quote, and sends it on the session. Do not enable `allow_promotion_codes`.**

Reasons:
1. **The quote and price panel need the figure before the customer leaves for Stripe.** `GET/POST /portal/checkout/quote` is a server-built summary. With Stripe's own box, the customer sees the true price only on Stripe's page.
2. **Referral codes are not Stripe objects.** They would not work in Stripe's box at all.
3. **Monthly plans and the Joining Fee** need the portal to price the discount (3.1). Stripe's box cannot do that.
4. **Stripe accepts one coupon or promotion code per session** (verify against the pinned API version `2026-06-24.dahlia`), and `allow_promotion_codes` cannot be combined with a coupon passed in `discounts`. A portal-owned box lets the portal decide the stacking rules.
5. **Eligibility by service.** The portal knows what is in the basket and whether the customer is new. Stripe's box does not, so it would accept a code on lines it should not touch.
6. **One neutral error message and a rate limit** (3.4) are only possible if the portal owns the box.

Design in outline:
- The quote and pay endpoints accept an optional `code`. The portal normalises it (trim, case-insensitive).
- Order of lookup: (a) a school referral code in the CRM Accounts (`Referral_Code`, `Referral_Code_Active`), then (b) a Stripe Promotion Code (`GET /v1/promotion_codes?code=...&active=true`). Referral codes and vouchers must not share a namespace; the CRM must refuse a voucher code equal to an existing referral code.
- The quote returns `discount: {code, label, amountPence, lines}` plus a customer-readable reason when a code is refused.
- The Checkout session carries the Stripe promotion code in `discounts[0][promotion_code]` for Stripe-native discounts, or has the lowered line for a portal-priced one, and the discount in the metadata either way.
- **A session that carries a code should expire sooner than 24 hours** (for example 30 minutes), so a capped voucher is not held up by an abandoned checkout.
- The portal must still re-check the code when the session is created, not trust the quote.

### 3.7 Where the code box goes

| Page | Where | Notes |
|---|---|---|
| **Join (`/membership/buy`)** | A "Have a code?" link in the price panel, above the Pay step, after the add-ons | Shows the discount as its own line in the panel and in the quote summary. School referral code goes here. A guest's code is kept in the browser tab like their other answers, and applied at the account checkpoint (a guest quote is indicative only: it can show the discount, never record a redemption) |
| **Accreditation pay page (`/pay/accreditation/:recordId`)** | Same link beside the Annual or Monthly choice | Referral codes do not apply (no Joining Fee in the bundle). Bespoke vouchers might. School credit shows as its own line (3.8) |
| **Insurance (`/insurance/buy`, and "Add insurance" on Join)** | Do not show a code box in phase 1 | The document gives no code that discounts insurance, and the IPT effect (3.2) makes it risky. On the Join page, a referral code covers the Joining Fee whether or not insurance is added |
| **Add-ons (`membership_addon`)** | Phase 2, when bespoke vouchers on extras are live | |
| **Renewal** | Nothing in phase 1 | The Joining Fee is already waived. A bespoke voucher may be wanted here (question 12) |

### 3.8 School credits (the balance, not a code)

This is a **ledger**, not a coupon. It earns £12 per qualifying purchase, spends at accreditation renewal or Diary Date listings, is deducted in £12 steps for listings, and resets to £0 when the accreditation expires.

The conflict is that the document assumes a school chooses to apply credit. Accreditation now renews automatically, so credit can only be used if Stripe sees it.

Options:
- **CRM ledger only**, applied by the portal at a checkout. Simple, but auto-renewals charge in full and the credit is never used. Not workable with auto-renewal.
- **CRM ledger as the truth, mirrored to the school's Stripe Customer balance.** Stripe applies a Customer's credit balance to the next invoice automatically, so an auto-renewal consumes it with nobody at a checkout. Creator writes a balance entry when a credit is earned, and a reversing entry when the accreditation expires. Needs a persistent Stripe Customer for the school (3.4, item 4).
- **Manual only**: a member of Guild staff applies the credit to each renewal. Safe and slow.

**Recommendation:** the CRM ledger as the truth plus the Stripe Customer balance mirror, as its own phase (phase 4), after the code work. Diary Date listing deductions are made in the ledger and the mirror together. Before building, the Guild and finance must answer questions 5 to 9. Note that a credit used as payment, rather than a discount, may have different VAT treatment. Finance to confirm.

### 3.9 Smaller points
- **Creator trigger for the £25 voucher.** "When an accreditation becomes active" is a Creator or CRM event. The document also says it is issued to anyone joining, renewing or upgrading. So the trigger set is: first paid invoice of a membership (new, renewal, upgrade) and an accreditation activation. Idempotent per Contact and per membership term.
- **A refund or cancellation** must reverse or void any voucher issued and, for referral credits, the school credit (question 7).
- **Test mode.** Everything in the plan is first built against the Stripe test account and a test CRM record. A test code is needed (open item from the user).
- **Records.** A `Voucher` module (code, type, discount, SKUs, validity, limit, issued to) and a `Voucher Redemption` module (Contact, code, session, invoice, amount, status) are needed in the CRM. Field design is not part of this review.

---

## 4. Questions the Guild must answer

Written plainly, so they can go to the Guild as they are.

**Referral codes and the Joining Fee**
1. **Is the £10 off a fixed £10, always?** Or could a school's code ever be worth a different amount?
2. **Where does the £10 come off when someone only buys insurance?** In the new portal, insurance is sold to people who already have Full membership, and they are not charged a Joining Fee. So a student buying insurance has no Joining Fee to take £10 off. Do you want the code to work only when someone is joining, or is something else meant?
3. **What happens if a member lapses and comes back after more than a month?** They pay a new Joining Fee. Can they use a school code again, or only the first time they ever joined?
4. **Can a student use a school code and a voucher on the same purchase?** If yes, which comes first?

**School credits**
5. **Which purchases earn the school £12?** The document says insurance or Associate Membership. Does a Full membership without insurance earn it? What about someone who joins by phone?
6. **When does the school get the credit?** On the first payment, or once the student has paid for a full year? If the student pays monthly, which of those applies?
7. **If the student cancels or is refunded, does the school lose the credit?** And can a school earn credit from its own staff using its own code?
8. **How should a school use its credit?** Applied automatically to its next accreditation renewal, or only when the school asks? (The renewal now happens automatically, so someone has to decide.) What if the credit is more than the renewal fee: carry the rest forward, or lose it?
9. **How is the £12 shown to the school and to your accountants?** Is it a discount on the school's invoice, a payment on account, or something else for VAT purposes? (Finance question.)

**Vouchers**
10. **The £25 GTi voucher: where is it spent?** At the moment the new portal cannot sell GTi courses. Should the voucher wait for GTi course booking, or be spent somewhere else in the meantime? Where do the £25 vouchers live in the CRM today, and what is the module called?
11. **Is the £25 voucher a code the member types in, or a credit that is applied for them?** Should it also work on the Beauty Guild membership or insurance pages? (We assume not.)
12. **Bespoke vouchers: which products can they ever discount?** The document names membership extras (branches, badges, window stickers, certificates, bundles), and GTi courses and certificates. Is that the full list? Should a voucher ever reduce the membership fee, accreditation fees, the Joining Fee, or insurance? (We recommend never insurance.)
13. **How long does a bespoke discount last?** Just the first payment, the first year, or every year? We assume the first year only, unless you say otherwise.
14. **Can a monthly payer use a voucher?** If the voucher is £10 off a £30 badge and they pay monthly, do they get £10 off over the 12 months?
15. **What should a customer see when a code is wrong, used up or out of date?** We suggest one message, "That code is not valid", for all cases, to stop people guessing codes. Is that acceptable, or do your staff need to tell the customer why?
16. **Do you want a test code?** We need one referral code and one voucher code made in the CRM so we can test with real-looking data (we will test only in Stripe's test mode).

**Staff and phone applications**
17. **How will staff take phone applications in the new portal?** The code box needs a signed-in customer. Will staff enter the application for the customer in the back office, or send the customer a link?
18. **Which of the staff goodwill waivers need to be recorded?** (Joining Fee, the £5 adjustment fee, manual extras.) Staff apply these by hand today, with nothing recorded against a voucher. Do you want a record of who waived what and why, for audit?

---

## 5. Build plan

Each phase ships on its own and is tested in Stripe test mode first. Merges are the user's decision.

### Phase 0: rules the portal already breaks (no codes needed)
- Enforce the one-month rule for renewals and GTi Student upgrades (2.2, point 1).
- Decide how phone applications work (question 17).
- **Needs from the Guild:** answers to 3 and 17. **Creator:** nothing. **Books:** nothing.

### Phase 1: school referral code, £10 off the Joining Fee
- Portal: a `code` field on the quote and pay endpoints; the check against the school Account (`Referral_Code`, `Referral_Code_Active`); the discount lowers the `year_one` Joining Fee line before `splitMonthly` (so a monthly plan is exact); a "Have a code?" box on the Join page; the discount shown in the price panel and the quote; a rate limit and one neutral error; a CRM redemption record.
- Checkout metadata: `discount_code`, `discount_amount`, `discount_sku`, `referral_school_id`.
- Creator: copy the metadata into the invoice `discounts` array; a "referral credit due" record for the school (the credit itself is phase 4); the Books line discount.
- **Guild:** answers to 1 to 6. **Creator:** the `discounts` shape (3.5) and the redemption record. **Books:** line-level discount for `MEM-JOIN`, with the VAT split checked by finance (question 9).
- Done when: a yearly and a monthly purchase with a code both show the discounted Joining Fee in the quote, in Stripe's first payment, in the Creator invoice and in Books.

### Phase 2: vouchers from the CRM (Stripe Coupons and Promotion Codes)
- CRM: `Voucher` and `Voucher Redemption` modules.
- Creator: create the Coupon and Promotion Code from a Voucher record, idempotently, and write the IDs and sync status back (3.5).
- Portal: look up the Promotion Code, check eligibility (service, SKUs, member status), pass it as `discounts[0][promotion_code]` for yearly and one-off lines scoped by `applies_to`, and show it in the quote.
- Scope: yearly and one-off extras only. Monthly plans refuse a voucher with a clear message until phase 3.
- **Guild:** answers 12 to 16, and a test code. **Creator:** the sync function, `discounts` read from Stripe. **Books:** discount lines from Stripe invoices.

### Phase 3: monthly plans, recurring lines, and the Stripe Customer
- Prove in test mode what survives `ensureSchedule` (3.1); use stable Stripe Products for extras so `applies_to` works on monthly lines; coupon duration `repeating` for 12 months on monthly.
- Add the persistent Stripe Customer per Contact (3.4, item 4).
- **Guild:** question 13 and 14 settled. **Creator:** store the Customer ID. **Books:** none beyond phase 2.

### Phase 4: school credit ledger and the £25 GTi voucher
- The ledger and the Stripe Customer balance mirror for schools (3.8), with the reset at expiry and the Diary Date deductions.
- The £25 voucher: issued by Creator on the triggers in 3.9, as a unique single-use Promotion Code expiring with the membership. The redemption side waits for GTi course checkout.
- **Guild:** questions 5 to 11. **Creator:** the ledger, the mirror, the issue trigger. **Books:** how a credit used is recorded (finance).

### Not in this plan
- Staff goodwill waivers, manual extras discounts, the £5 adjustment fee (mid-term changes workstream), GTi member and non-member pricing, and school bundle pricing. None is a code.
- Any discount on insurance premiums or IPT.

---

## Appendix: checks to make in Stripe test mode before building

Nothing below has been run. These are the assumptions that the recommendations above depend on:

1. A coupon on a subscription Checkout session: does the pinned API version accept a single `discounts` entry with `promotion_code`, and refuse more than one?
2. A `once` fixed-amount coupon that exceeds the first monthly invoice: confirm the unused value is lost.
3. Does a subscription discount survive `ensureSchedule` (from-subscription schedule, then the phases update)? If not, pass `discounts` in each phase.
4. Does `first_time_transaction` treat a returning email as a new customer when Checkout is opened with `customer_email`?
5. `applies_to.products` against a stable Product, with `price_data.product` on a monthly line.
6. A `customer`-restricted Promotion Code against a Customer created by the portal.
7. Case-insensitivity and uniqueness of numeric and branded codes among active Promotion Codes.
8. Invoice `lines[].discount_amounts` and `total_discount_amounts` as returned by the Creator fetch (with `expand`) on API version `2026-06-24.dahlia`.
9. A Customer balance credit consumed by an automatic accreditation renewal.
