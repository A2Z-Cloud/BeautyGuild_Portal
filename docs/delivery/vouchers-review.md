# Vouchers and discount codes: review against Portal V2

Written 24 October 2026 for A2Z Cloud and the Guild of Beauty Therapists, updated 26 October 2026 with the Guild's answers (Qudsiya Talib, with Helen Delaney on VAT). This is a review only. Nothing has been built, and nothing has been changed in Stripe, Books or the CRM.

**Scope.** Insurance, membership and accreditation only. The Guild is not ready for GTi, so everything GTi (the £25 voucher, GTi courses, GTi Student upgrades) is parked in section 6. The school referral credit scheme (the £12 credit to schools and the Diary Date deductions) is being retired and is not covered.

Sources: the Guild's "Discount Codes and Vouchers" document (the Word version of 24 October; the PDF of 20 October has identical text), the Guild's email answers of 26 October, [pricing-payments.md](../api-contracts/pricing-payments.md), [creator-payments-app.md](creator-payments-app.md), and `catalogue.js`, `checkout.js` and `plans.js` in `apps/portal/functions/beauty_guild_api/src`.

## Summary

- **Two code types, used in two places.**
  - The **school referral code** (£10 off the joining fee) is the only code a **customer** enters online.
  - **Bespoke vouchers** and goodwill waivers are applied by **Guild staff** on the phone, in the payment widget or on the payment link. Customers do not type vouchers in online (Guild answer, 26 October).
- **Referral codes already exist in the CRM.** The portal reads `Referral_Code` and `Referral_Code_Active` from the school Account today (`schoolServices.js`). They do not need to be copied into Stripe.
- **What can be discounted is now settled:** the joining fee, additional branches, badges, window stickers, certificates, bundles, and the £5 adjustment fee. Never the membership fee, accreditation fees or insurance. That removes the hardest tax question (IPT) from this phase.
- **One discountable item is recurring: the additional branch.** Everything else is a one-off line. A branch discount must last one year only, so it cannot be done by lowering the line (the lower price would repeat at renewal).
- **Recommendation in one line:** the portal prices discounts itself on the one-off lines (so monthly plans stay exact), uses a Stripe coupon created per checkout only for a branch discount, records every discount (code, amount, who and why) for Creator and Books, and treats the CRM Voucher record as the only list of codes. Details in section 3.
- **Needed in the portal that is not there yet:** the 30-day rule on the joining fee, a staff route for the phone widget and link (with who and why recorded), and a `discounts` shape for Creator. See section 2.2 and the plan in section 5.

---

## 1. What the document asks for, journey by journey

### 1.1 Joining a membership or buying insurance (the Join page)
- **School referral code, £10 off the Joining Fee.** A new applicant for Beauty Guild insurance or membership enters an accredited school's unique code during the online application. Codes can be numeric (`12345`) or branded (`SIENNAX`). One use per user, unlimited users per code. Staff can enter the code for phone applications.
- **£25 GTi voucher issued.** Parked, section 6.
- **No code, automatic or staff-controlled:**
  - Renewing before expiry, or within one month after, has no Joining Fee. After more than one month the fee applies again.
  - Staff can waive the £10 Joining Fee as a goodwill gesture over the phone (back office, not a code).

### 1.2 Upgrades and policy changes
- **GTi Student to Associate or Full:** parked, section 6.
- **£5 adjustment fee on insurance amendments.** Staff can remove it as a goodwill gesture. No code. (This belongs to the mid-term changes workstream.)

### 1.3 Membership extras
- Staff can discount branches, badges, window stickers, certificates and bundles manually in the back office. Not controlled by codes.

### 1.4 Accreditation and tutors
- A non-member applying for accreditation automatically gets Associate (International outside the UK) membership, with a primary membership of the Guild of Therapy Lecturers, and the £10 Joining Fee is discounted automatically. No code.

### 1.5 Discount vouchers
- **Bespoke vouchers (currently made in Enki):** a generic code (not user-specific), each user may redeem once. Applies to specific products (membership extras). Can be restricted to certain people (for example members only). Active for a period, expiring automatically, reusable for later promotions. Fixed amount or percentage off. Can be limited to a set number of uses. Issued to members, schools or anyone else.
- The £25 GTi voucher, GTi pricing and school bundle pricing are parked (section 6).

---

## 2. What is settled, and what conflicts with the portal as built

### 2.1 Settled

**Direction already given**

| Point | Status |
|---|---|
| Referral codes exist; school referral credits are being retired | Direction given by the user |
| Vouchers are generated from the CRM | Direction given by the user. See 3.5 for how this changes now that vouchers are staff-only |
| No Joining Fee on a renewal, an upgrade, or the accreditation + Associate bundle | Already built: the portal adds a `joining_fee` line only when there is no `previousId`, and `ACC-ASSOC` is the bundle price |
| Prices come from Stripe by lookup key (the price list code and Books SKU) | Built. A voucher must never carry an amount of its own that duplicates a price |
| The joining fee is charged **per person**, not per product | Direction given by the user, 26 October |
| Customers do not enter bespoke vouchers online; only staff do | Direction given by the user, 26 October |

**Guild answers, 26 October** (numbers are the question numbers in the email)

| # | Answer | What it means for the build |
|---|---|---|
| 1 | The discount is always £10 | One fixed discount on `MEM-JOIN`. Because the joining fee is £10, the code always waives it in full, so the line is left out, as the renewal waiver already does |
| 2 | The code only works for a completely new member, or someone rejoining more than a month after their membership or insurance last expired | The code only applies where a joining fee is actually charged |
| 3 | A lapsed member who rejoins can use a code again | **Once per joining fee, not once per lifetime.** (The Guild's document says "once by a user". We follow the email.) |
| 4 | A referral code and a goodwill waiver (for example a free branch) can both apply, but only on the phone. Online there are no other discounts. The branch comes before the summary page, so the goodwill waiver comes first | They discount different lines, so order does not change the price. Staff-only waivers need a staff route (see 2.2, point 3) |
| 5 | The £10 applies to International membership too | International membership is not payable online (no fixed price), so it reaches International joiners through the staff route only |
| 7 | Discountable: the joining fee, additional branches, badges, window stickers, certificates, bundles, and the option to waive the £5 adjustment fee. Never the membership fee or insurance | The code list in 3.2. Accreditation fees are not discountable either |
| 8 | A membership extras discount lasts only the year it was bought and is not applied at renewal | Branch discount: Stripe coupon `once` (yearly) or `repeating` for 12 months (monthly). Other extras are one-off anyway |
| 9 | On a monthly plan the discount is spread over the first 12 payments | Matches how one-off lines are already spread (3.1) |
| 10 | A wrong or out-of-date code shows "That code is not valid". A school code whose school has expired still gives the student the £10 | **Do not reject a code because the school's accreditation has expired.** The portal must not rely on `Referral_Code_Active` meaning "school is current" (to confirm in the CRM) |
| 11 | Follow the same split as the fee (£38 zero-rated, £17 standard-rated) | Settled. Largely moot, because the membership fee is never discounted. It decides how a discount on a mixed-rate line is split if one is ever allowed |
| 12 | Any staff member may enter a code in the widget and on the link | No permission tiers. Every use is still recorded (13) |
| 13 | Yes, record every waiver: who, what and why | A discount record on every staff-applied waiver (3.5) |
| 30 days | The 30-day rule always applies | Implement as 30 days after the expiry date |

### 2.2 Conflicts with the portal as built

1. **The 30-day rule is not enforced.** The portal waives the joining fee for any owned `previousId`, however long ago the membership expired. After the Guild's rule, a membership expired more than 30 days ago must pay the fee again (and may then use a referral code). *Needs a rule in `catalogue.js`, driven by the expiry date.*
2. **Monthly plans spread the joining fee and extras over 12 payments** as inline monthly lines. A "£10 off the joining fee" has to work with that. *See 3.1.*
3. **There is no staff route.** The portal needs a signed-in customer. The phone widget and payment link are being built, and they need an endpoint that only staff can call, that applies waivers and voucher codes, and that records who and why. *Design in 3.6.*
4. **The additional branch is a recurring line.** A branch discount must last one year only. Lowering the line would repeat the discount at every renewal (renewals charge the same amounts as year one). *See 3.1.*
5. **The £5 adjustment fee is not in the catalogue.** It belongs to the mid-term changes workstream. A waiver option for it needs the item to exist first. *See 3.8.*
6. **Creator's invoice JSON has an empty `discounts` array.** It needs defining before any discount goes live (3.5).
7. **Creator's per-item amounts (`joining_fee_amount`, `branch_addon_amount`, and so on) are the charged amounts.** With a discount they need the list price and the discount separately, or Books cannot show the discount.

---

## 3. Technical questions, with a recommendation each

Stripe behaviour below is from Stripe's documented model. Where it matters I have marked **(verify)**, meaning it must be checked in Stripe test mode before it is relied on. The appendix lists the checks.

### 3.1 How a Stripe discount behaves on a subscription, and on a monthly plan

**The model.** A Stripe Coupon is a percentage or a fixed amount (GBP) with a duration: `once` (the first invoice only), `repeating` (the first N months) or `forever`. It can be limited to named Stripe Products (`applies_to`).

**On a yearly purchase** the first invoice carries the first year's lines and any one-off lines. A `once` coupon covers that invoice, and the renewal pays full price. `forever` would discount every renewal and must never be used here.

**On a monthly plan** the portal builds every line as an inline monthly price with a new Product each time, and a Stripe schedule drops the year-one lines at payment 13 (`ensureSchedule`). Three problems follow for a Stripe coupon:
1. **The joining fee is not on the invoice as £10.** It is about 84p a month for 12 months. A `once` coupon of £10 would cap at the first invoice and the rest of the discount would be lost.
2. **Inline lines have no stable Product ID**, so `applies_to` cannot name them. A fixed coupon would take money off the membership and the admin fee as well.
3. **The schedule may drop the discount.** `ensureSchedule` rebuilds the phases from items only **(verify)**.

**What can be discounted, and how** (the Guild's list, answer 7):

| Line | Kind | How the discount is applied |
|---|---|---|
| Joining fee (`MEM-JOIN`) | One-off (`year_one`) | **The portal leaves the line out** (the £10 code and a staff waiver both clear it in full). On a monthly plan this happens before `splitMonthly` runs, so the first payment on the quote is exactly what Stripe takes |
| Badge, sticker, certificate, bundle | One-off (`year_one`) | **The portal lowers the line's amount** before the plan is split. On a monthly plan, the discount is spread over the first 12 payments, as the Guild wants (answer 9). Nothing carries into renewal because the line does not recur |
| Additional branch (`MEM-BRANCH`) | **Recurring** (`ongoing`) | **A Stripe coupon the portal creates for that checkout**: a fixed amount equal to the discount, `once` on a yearly purchase, `repeating` for 12 months on a monthly plan (the monthly share). **Never** lower the branch line itself, because the lower price would repeat every year |
| £5 adjustment fee | One-off, mid-term | Part of the mid-term changes workstream: the portal (or the change flow) leaves the fee out, with the waiver recorded |

Why a per-checkout coupon for the branch and not a synced code: the branch line has no stable Product, so a shared coupon could not be limited to it. A fixed amount equal to the discount (never more than the branch price) discounts only what it should, whatever else is on the invoice. It is created by the portal at checkout, carries the voucher id in its metadata, and is used once.

### 3.2 Which lines a code may discount, and the VAT and IPT effect

**Which lines.** Each code lists the price list codes it may discount.

| Code type | May discount | Never |
|---|---|---|
| School referral | `MEM-JOIN` only | everything else |
| Bespoke voucher or staff waiver | From `MEM-JOIN`, `MEM-BRANCH`, `MEM-BUNDLE`, `MEM-CERT`, `MEM-BADGE`, `MEM-STICKER` (and the £5 adjustment fee once it is in the catalogue) | Membership fees, accreditation (`ACC-*`), `MEM-ADMIN`, `INS-*`, `CALC-*`, `INS-IPT`, named employee fees |

**IPT.** Because no code can touch an insurance premium, the portal's IPT calculation (12% of the net premium total, rounded once, sent as `INS-IPT`) is unaffected. A membership bought with insurance can still use a code on the joining fee or extras. If the Guild ever wants an insurance discount, the portal would have to discount the premium **before** it rates IPT, and the CRM policy would need both the list premium and the discounted premium. That is separate work, not planned.

**VAT.** Portal prices are gross (VAT included), so a discount is a gross amount:
- On the joining fee and the extras (standard-rated), VAT comes down by one sixth of the discount: £10 off is £8.33 net and £1.67 VAT.
- On a membership fee the Guild's rule is the same split as the fee (£38 zero-rated, £17 standard-rated, Helen Delaney, 26 October). No code touches the membership fee today, so this only matters if that changes.
- The invoice must end up equal to Stripe's total (the rounding rule Creator already uses).

### 3.3 Duration on renewals

Renewals use the same inline amounts as year one (no re-rating). So:
- Every discountable line is a one-off except the branch, so a discount on those lines never carries into renewal.
- The branch discount is a `once` coupon (yearly) or a 12-month coupon (monthly). The Guild confirmed it must last that year only (answer 8).
- `forever` is never used.

### 3.4 Once per user, and first-time-customer rules

**The rule the Guild gave:** a code is used **once per joining fee**, not once per lifetime. A lapsed member who rejoins pays a new joining fee and can use a code again (answer 3). A code can be used by any number of people.

**How to enforce it.**
1. The code can only matter where the portal is about to charge a joining fee (a new person, or a membership expired more than 30 days). That already limits it, with no extra rule.
2. The portal records each redemption in the CRM against the Contact and the application (code, date, session, payment status, who applied it), so a second code cannot be added to the same application, and the Guild can report on it.
3. Stripe's own limits are not used for this. Stripe cannot say "unlimited uses overall, once per customer" for a shared code, and the portal opens Checkout with `customer_email`, which makes a new Stripe Customer for each payment. Customer-based rules in Stripe therefore have nothing to hold on to.
4. **Guard against guessing.** Referral codes can be five-digit numbers. The code check needs a rate limit per user (for example 10 wrong codes an hour) and one message for every failure: "That code is not valid" (answer 10). The message does not say whether the code exists, has expired or is used up.
5. **School expiry.** A code whose school has expired is still valid for the student (answer 10). The portal accepts any referral code found on a school Account. Whether a code can be withdrawn on purpose, for example after misuse, is a question for the Guild (section 4).

A persistent Stripe Customer per Contact would still help cancellations and the Stripe billing portal, but it is not needed for discounts. Recorded as optional work in phase 3.

### 3.5 Who creates codes, and how Books records the discount

**The CRM is the only list of codes.** The Guild already manages vouchers in a separate section of the CRM (Enki). So:
- School referral codes stay on the school Account (`Referral_Code`).
- Bespoke vouchers are a CRM `Voucher` record (code, discount, allowed SKUs, start and end date, usage limit, restrictions such as members only). A CRM `Voucher Redemption` record is written for each use.
- Because vouchers are staff-only, **no Stripe Promotion Codes are synced**. This differs from the earlier direction ("generated from the CRM and synced to Stripe so they can be used at checkout"), which assumed customers would type them at Stripe Checkout. If the Guild later opens vouchers to customers online, a Promotion Code sync from Creator is the way to add it; section 3.6 says what would change.
- The portal reads the Voucher record, checks it (dates, limit, restrictions, allowed SKUs), and prices the discount. It creates a Stripe coupon only for a branch discount (3.1).
- Voucher codes and referral codes must not share a namespace: the CRM refuses a voucher code equal to a referral code.

**How Books records it.** Creator's invoice JSON already reserves a `discounts` array. Define one object per discount:

```json
{"source": "referral | voucher | staff_waiver", "code": "SIENNAX", "reason": "text for staff waivers", "applied_by": "staff user or customer", "amount": "10.00", "sku": "MEM-JOIN", "stripe_coupon_id": "only for a branch discount"}
```

- The portal passes it in the Checkout metadata (a single JSON key, as the metadata limit is 50 keys) alongside the list price and the discount for each line. Creator copies it into `discounts`.
- For a branch discount done with a Stripe coupon, Creator can also read it from the Stripe invoice (`lines[].discount_amounts`, `total_discount_amounts`).
- In Books, push the **list price on the line plus a line-level discount**, so the VAT split follows the line and the invoice total equals Stripe's. Use the existing get-only item lookup. A discount must not create an item.
- The Books report then shows list price, discount and net income per code or per reason.
- **Waivers are recorded the same way**, so "who waived what and why" (answer 13) is the same record as a voucher, with `source: staff_waiver`, the staff member and a reason.

### 3.6 Should the portal validate the code itself, and where does it go?

**Recommendation: the portal validates every code, shows the discount in the quote, and prices it. Do not use Stripe's own code box (`allow_promotion_codes`).**

Reasons:
1. **The quote and price panel need the figure before the customer leaves for Stripe.** With Stripe's box the customer sees the true price only on Stripe's page.
2. **Referral codes are not Stripe objects.** They would not work in Stripe's box at all.
3. **Monthly plans and the one-off lines** need the portal to price the discount (3.1). Stripe's box cannot do that.
4. **Eligibility.** The portal knows what is in the basket and whether a joining fee is being charged. Stripe's box does not.
5. **One message and a rate limit** (3.4) are only possible if the portal owns the box.

**Two entry points.**

| Entry point | Who | What it accepts |
|---|---|---|
| **Customer code box** on the Join page | The customer, signed in or as a guest | School referral code only |
| **Staff route** for the phone payment widget and the payment link | Any Guild staff member | Referral code, bespoke voucher code, and waivers (joining fee, free or discounted extras, the £5 adjustment fee). A reason is required for a waiver, and the staff member is recorded |

Outline:
- The quote and pay endpoints accept an optional `code`. The portal normalises it (trim, case-insensitive).
- Lookup for a customer: a school referral code on the CRM Accounts. A staff request may also match a CRM Voucher.
- The quote returns `discount: {code, label, amountPence, lines}` plus "That code is not valid" when refused.
- The Checkout session carries the discount in the lowered lines (or the branch coupon) and in the metadata.
- The portal re-checks the code when the session is created, not only at the quote.
- The staff route must be a separate endpoint that only a staff identity can call. How staff are identified in the widget is part of the widget build and must be settled before phase 2.

### 3.7 Where the code box goes

| Page | Where | Notes |
|---|---|---|
| **Join (`/membership/buy`)** | A "Have a code?" link in the price panel, above the Pay step, after the add-ons | School referral code only. The discount shows as its own line in the panel and the quote. Shown only when a joining fee applies (a new person, or one lapsed more than 30 days). A guest's code is kept in the browser tab like their other answers and applied at the account checkpoint (a guest quote is indicative: it can show the discount, never record a redemption). A saved application must keep the code with the other answers |
| **Accreditation pay page (`/pay/accreditation/:recordId`)** | No code box | The Guild gave no code for accreditation, and the bundle has no joining fee |
| **Insurance (`/insurance/buy`, and "Add insurance" on Join)** | No code box | The Guild confirmed there are no online discounts on insurance. On the Join page, a referral code covers the joining fee whether or not insurance is added |
| **Add-ons (`membership_addon`) and renewal** | No code box | Online vouchers are not offered. Staff handle goodwill discounts on the phone |
| **Staff phone widget and payment link** | Code field and waiver controls, in the staff route | See 3.6 |

### 3.8 Smaller points
- **A refund or cancellation** must reverse a redemption, so a released code can be counted correctly. This belongs to the cancellations workstream.
- **The £5 adjustment fee** is not a catalogue item yet. A waiver option for it can only be built once the mid-term changes work defines it.
- **Test mode.** Everything is first built against the Stripe test account, with a test school code and a test voucher created in the CRM by A2Z.
- **Records.** A `Voucher` module and a `Voucher Redemption` module are needed in the CRM, and a waiver log (see 3.5). Field design is not part of this review. A2Z controls the CRM set-up.

---

## 4. Questions for the Guild

### 4.1 Answered on 26 October
Questions 1 to 5 and 7 to 13 are answered (section 2.1). Insurance, the joining fee and the online or phone split are settled by the Guild and by the user:
- The joining fee is charged per person.
- Customers do not enter bespoke vouchers online.

### 4.2 Still open, plain wording for the Guild
1. **Can a school's code ever be switched off on purpose?** A school whose accreditation has expired still gives students the £10. Is there ever a reason to stop a code working, for example if it is being misused?
2. **What reasons will staff give when they waive something?** Should the system offer a short list (for example goodwill, complaint, promotion) or free text?
3. **Do you want a limit on how often staff can waive the joining fee for the same person?** For example once. Any staff member can do it today, with nothing recorded.

### 4.3 For us to confirm ourselves
- What `Referral_Code_Active` means in the CRM (school current, or code on or off).
- That a referral code is unique across all school Accounts.
- How staff are identified in the phone payment widget.

---

## 5. Build plan

Each phase ships on its own and is tested in Stripe test mode first. Merges are the user's decision.

### Phase 0: rules the portal already breaks (no codes needed)
- Enforce the 30-day rule: a membership expired more than 30 days ago pays the joining fee again (2.2, point 1).
- **Needs from the Guild:** nothing further. **Creator:** nothing. **Books:** nothing.

### Phase 1: school referral code online, £10 off the joining fee
- Portal: a `code` field on the quote and pay endpoints; the check against the school Account (accepting expired schools); the joining fee line is left out before `splitMonthly` runs (yearly and monthly are exact); a "Have a code?" box on the Join page, shown only when a joining fee applies; the discount shown in the price panel and the quote; a rate limit and one neutral error; a CRM redemption record; the code kept in a saved application.
- Checkout metadata: the discount JSON (3.5) and the list prices.
- Creator: copy the metadata into the invoice `discounts` array. Books: the line-level discount on `MEM-JOIN`.
- Done when: a yearly and a monthly purchase with a code both show the joining fee waived in the quote, in Stripe's first payment, in the Creator invoice and in Books.

### Phase 2: staff route for the phone widget and payment link
- A staff-only endpoint: referral code, bespoke voucher codes, and waivers on the joining fee, the one-off extras and (when it exists) the £5 adjustment fee. A reason is required, and the staff member is recorded.
- CRM: `Voucher`, `Voucher Redemption` and the waiver log. Creator: the `discounts` shape for vouchers and waivers.
- Lowered one-off lines as in 3.1. A branch discount is not in this phase.
- **Needs from the Guild:** the answers in 4.2, and a test voucher. **A2Z:** the CRM set-up and how staff are identified in the widget. **Creator and Books:** as phase 1, plus the waiver reasons in reports.

### Phase 3: the recurring branch discount, and the Stripe Customer
- The per-checkout Stripe coupon for a branch discount (`once` yearly, 12 months monthly).
- Prove in test mode what survives `ensureSchedule`, and pass the coupon into the schedule phases if it does not.
- Optional: a persistent Stripe Customer per Contact (helps cancellations and the billing portal; not required for discounts).
- **Creator:** read branch discounts from the Stripe invoice. **Books:** none beyond phase 2.

### Later: GTi
Parked in section 6.

### Not in this plan
- Any discount on insurance premiums or IPT, on the membership fee or on accreditation fees (the Guild confirmed none is wanted).
- Customer-entered bespoke vouchers online (staff-only by the Guild's answer).
- Everything GTi (section 6).
- The £5 adjustment fee waiver until the mid-term changes workstream defines the fee.

---

## 6. Parked for GTi (future)

The Guild is not ready for GTi, so none of this is in the build plan. It is kept here so it is picked up when GTi course booking is planned.

- **£25 GTi voucher.** Unique to the member, single use, valid until their membership expires, spent as £25 off a practical GTi course or a £25 contribution to a theory-only one. It is issued when someone joins as Associate, International or Full, renews, or upgrades from GTi Student, and when an accreditation becomes active. If customers are to type it in at checkout, the design is a unique Stripe Promotion Code (`max_redemptions = 1`, `expires_at` set to the membership expiry) created by Creator from a CRM Voucher record. The trigger set would be the first paid invoice of a membership (new, renewal, upgrade) and an accreditation activation, once per Contact per membership term.
- **GTi Student upgrade.** The joining fee waiver applies if the student membership is active or within one month of expiry. Online it uses the referral code of the school of the most recent GTi enrolment, which needs GTi enrolment data the portal does not have. The portal also does not check that the previous membership was a Student membership.
- **GTi pricing and bundles.** Member and non-member course prices, and the £25 school bundle, are catalogue and staff-set pricing, not codes.
- **Course vouchers.** The Guild said a course voucher lasts while it is available, generally a month, and members or the public can use it. This is a different life from a membership extras discount.
- **Questions to ask the Guild when GTi starts:**
  - Where are the £25 vouchers held in the CRM today, and what is the module called?
  - Is the £25 voucher a code the member types in, or a credit applied for them? Should it also work on membership or insurance pages (we assume not)?

---

## Appendix: checks to make in Stripe test mode before building

Nothing below has been run. These are the assumptions that the recommendations depend on:

1. A subscription Checkout session where the joining fee line is left out, and where a line's amount is lowered (inline price data): does Checkout accept both in subscription mode?
2. A per-checkout fixed-amount coupon (`once` on a yearly purchase, `repeating` for 12 months on a monthly plan) passed in `discounts` on the session: does Stripe accept it, and apply it to the first invoice or the first 12 invoices only?
3. Does that subscription discount survive `ensureSchedule` (from-subscription schedule, then the phases update)? If not, pass `discounts` in each phase.
4. Invoice `lines[].discount_amounts` and `total_discount_amounts` as returned by Creator's fetch (with `expand`) on API version `2026-06-24.dahlia`.
5. If vouchers are ever opened to customers: whether Checkout accepts more than one coupon or promotion code, and whether a customer-restricted Promotion Code works with a Customer the portal creates.
