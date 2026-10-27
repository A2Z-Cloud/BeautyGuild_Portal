# Phase 4: issue the member's £25 GTi voucher

Written 27 October 2026 for A2Z Cloud and the Guild of Beauty Therapists. Design, Creator (Deluge) code and a small portal route. **Nothing is deployed, and nothing has been written to the Guild CRM, Creator, Books or Stripe.** The Deluge has not been run (there is no Creator here to run it in), and the CRM names come from the Guild's field list and one example record (section 2).

Source rule (Guild document and email of 26 October): anyone who joins as Associate, International or Full Member, renews, or upgrades from GTi Student receives a unique £25 GTi voucher. It is assigned to the member, single use, valid until their membership expires or is cancelled, and spent as £25 off a practical GTi course or a £25 contribution to a theory-only course. Decision of 27 October: A2Z sets up a CRM and Creator process that creates it when the membership is verified and Active. Redemption stays where it is today until GTi is rebuilt.

Background: `vouchers-review.md` (PR 67, sections 4.2a, 5 phase 4 and 6) and [creator-payments-app.md](creator-payments-app.md).

## 1. What is in this change

| Part | Where | State |
| --- | --- | --- |
| Design | this file | for review |
| Deluge for Creator | [vouchers-phase-4/](vouchers-phase-4/) (five functions) | written, not run, not deployed |
| Portal route `GET /portal/vouchers` (the member sees their own code) | `apps/portal/functions/beauty_guild_api/src/vouchers.js` | built, off by default, 6 tests, whole suite passes |

## 2. The CRM module `Discount_Voucher`

Read from the Guild CRM's field list and one example record (27 October, supplied by the Vouchers review session; the A2Z connectors do not reach the Guild CRM, so I did not read it myself). The example row `GR0001` is a test record: Bespoke Generic, Fixed Amount, 100.00, applies to Courses and Membership, created by A2Z Cloud Admin on 21 August, expired 31 August. There are no real £25 vouchers in the module to copy.

| Purpose | API name | Type | What we write for the £25 voucher |
| --- | --- | --- | --- |
| Internal id | `Name` | Auto Number (GR0001) | Never written; not the code |
| Code | `Voucher_Code` | text (255), exists | The generated code, upper case. **Not unique or case-insensitive in the CRM yet**, so the function checks (below) |
| Type | `Voucher_Type` | picklist: `Personal £25 GTI`, `Bespoke Generic` | `Personal £25 GTI` |
| Method | `Discount_Method` | picklist: `Fixed Amount`, `Percentage` | `Fixed Amount` |
| Amount | `Discount_Value` | Currency | 25 |
| Applies to | `Applies_To_Type` | multiselect: Courses, Membership, Extension | Courses |
| Member | `Assigned_Contact` | lookup to Contacts | the Contact |
| Membership | `Assigned_Member_Profile` | lookup to the Membership profile (not the Deal) | the profile id, when known |
| Member type | `Eligible_Member_Types` | multiselect: Associate, International, Full, GTI Student | Associate, International or Full (Full covers Non-Salon and Salon) |
| Uses | `Maximum_Total_Uses`, `One_Use_Per_Person` | Number, Boolean | 1, true |
| Used so far | `Current_Usage_Count` | Number | not touched: GTi redemption increments it |
| Life | `Expires_With_Membership` | Boolean | true |
| Start | `Valid_From` | DateTime | now |
| End | `Valid_To` | DateTime | the membership expiry, end of day (until the Guild says how today's vouchers behave) |
| State | `Active` | Boolean | true; false when voided |
| Idempotency key | `Voucher_Key` | text, unique, immutable | **New field.** `<ContactId>-<yyyymmdd of expiry>` |
| Source invoice | `Source_Invoice` | text for now | **New field.** The Stripe invoice id (`in_...`). Can later become a lookup; target undecided (below) |
| Void reason | `Void_Reason` | multiline text | **New field.** Written on void |

Not used: `Applicable_Items` (MEM-JOIN, MEM-BRANCH and so on: left empty for the £25 voucher), `Applicable_Course` (GTi is parked), `Can_Be_Reactivated`, `Connected_To__s`, the email fields.

**State is derived, not a picklist.** Void is `Active = false`. Used is `Current_Usage_Count >= Maximum_Total_Uses`. Expired is `Valid_To` in the past. The portal and the void function both use exactly this.

**A2Z must add three fields first:** `Voucher_Key` (unique, immutable), `Source_Invoice` and `Void_Reason`. The unique key is what guarantees there is never a second voucher.

**`Source_Invoice` target is undecided.** The CRM exposes two invoice modules. Until the Guild chooses, the Stripe invoice id is stored as text, and the field name is one setting at the top of `issue_gti_voucher.deluge`. Recommendation: keep the Stripe invoice id (it is the key Creator holds), and add a lookup to the Books-synced invoice only if the Guild needs to open it from the voucher.

**Scope.** This process only issues and voids. It does not decide waivers (phase 2) or redeem (GTi, outside this plan), and it does not change `Current_Usage_Count`.

**Still to check:** the DateTime offset on `Valid_From` and `Valid_To` (the Deluge writes `+00:00`, which is an hour out in summer, and only the date matters for now), and that the CRM user behind the Creator connection can create, read and update the module.

## 3. The process

```
Stripe invoice.paid -> Creator processor -> membership Active + new expiry in the CRM
                                         -> Vouchers.process_voucher_for_invoice
                                              -> issue_gti_voucher (idempotent) -> Discount_Voucher record
                                              -> notify_member_of_voucher (only if just created)
Cancellation (cancellations workstream)  -> Vouchers.void_gti_vouchers
```

### Trigger

The processor calls `process_voucher_for_invoice` after it has marked the membership Active and set the expiry for the new term, on a paid invoice. A voucher is earned when:

- `billing_reason` is `subscription_create` (a new member, or an upgrade from GTi Student, which arrives as a new membership with a `change_type`) or `subscription_cycle` (a renewal); and
- the invoice has a qualifying membership line: `MEM-ASSOC-Y`, `MEM-INTL-Y`, `MEM-FULLNS-Y`, `MEM-FULLS-Y`, or an accreditation purchase that includes membership (`ACC-ASSOC`, `ACC-INTL-MEM`). Insurance only, a mid-term add-on, a one-off venue and GTi Student earn nothing.

"Verified" means the membership is Active in the CRM. If the Guild has a manual check between payment and Active, the processor must call the function when that check completes, not at payment. The function only needs the Contact, the new expiry and the invoice (section 8, question 2).

### One voucher per Contact per term, and idempotent

The term is identified by its **expiry date after this payment**. The idempotency key is `<ContactId>-<yyyymmdd of expiry>`, kept in a unique CRM field.

- **Retry or duplicate event:** the function searches the key first and returns the existing voucher.
- **Two calls at once:** the second create is refused by the unique key. The function re-reads and returns the winner, and does not report a failure.
- **Monthly plans:** Stripe sends a `subscription_cycle` invoice every month. Payments 2 to 12 leave the expiry unchanged, so the key exists and nothing is created. Payment 13 starts the next term, the membership processor extends the expiry, and the key is new. So Creator must extend the expiry **before** calling the function, and only on the term boundary. Whoever builds the renewal slice needs to know this.
- **Annual renewal:** a year later the expiry moves on a year, so a new voucher.
- **Two Contacts for one person:** the key is per Contact, so a duplicate Contact could be issued a second voucher. Creator must not create a second Contact anyway (handover, section 5, point 9).

### The record

One `Discount_Voucher` record with the fields in section 2: type `Personal £25 GTI`, fixed £25, courses only, assigned Contact and Membership profile, one use, expires with the membership, valid to the expiry, active, key and source invoice.

### Code format

`generate_voucher_code.deluge` is the only place the format lives. Today it makes `GTI-XXXXX-XXXXX`: ten characters from a 16 letter alphabet without look-alike characters, derived from a SHA-256 of the key, a secret salt and an attempt number, so a retry is stable and the code cannot be guessed from a Contact id. **This is a placeholder.** When the Guild sends examples, change the body of that one function; the rest treats the code as an opaque string. Because the CRM does not enforce unique or case-insensitive codes, the issuer upper-cases the code, searches for it in both cases, and after creating re-searches to catch a race. A clash is never overwritten: it makes the issuer try the next code (our own new record is voided if two now share a code), up to five times, then it reports an error. To settle with the examples: whether the format carries meaning (a member number or year), and whether Enki checks a pattern when a code is entered.

### Telling the member

Two routes, both draft until the Guild says how members are told today:

1. **Email** from Creator when the voucher is created (`notify_member_of_voucher.deluge`), only on the call that creates it, so a retry never sends it twice. The wording is a draft.
2. **The portal**, behind a switch: `GET /portal/vouchers` returns the signed-in member's own vouchers. It returns only the member's own records with type `Personal £25 GTI` and `Active = true`, and shows the code only while it can be spent (not used, not past `Valid_To`). There is no portal screen yet; the route is the contract for one. If the Guild prefers staff to give the code by phone, leave both off.

### Voiding on cancellation

`void_gti_vouchers.deluge` sets `Active = false` and `Void_Reason` on every active personal voucher for the Contact (optionally one membership profile). It leaves a used voucher alone and never reactivates one, and a second call voids nothing.

- Call it where the **cancellations workstream** marks a membership cancelled, not on every `customer.subscription.deleted`. A subscription that simply ends at the term end needs nothing, because the voucher already expires with the membership.
- Failed payments on a monthly plan: Stripe retries, then cancels. Void on the eventual cancellation, not on `invoice.payment_failed`.
- Refund inside a cooling-off window: not decided (section 8).

### Redemption

Unchanged. GTi booking in Enki checks and spends the code. If Enki holds its own copy of the codes, the new system must write there too, or Enki must read the CRM module. This is the biggest open point (section 8, question 3): a code only the CRM knows about is worthless at the till.

## 4. The Deluge functions

All in [vouchers-phase-4/](vouchers-phase-4/), in the style of Appendix A and B of [creator-payments-app.md](creator-payments-app.md): a `// NOTE:` header, names in one place, never throws, logs with `info`, returns a status map.

| File | Does |
| --- | --- |
| `process_voucher_for_invoice.deluge` | The trigger: decides eligibility, calls the issuer, notifies only on `created` |
| `issue_gti_voucher.deluge` | Idempotent create by key; returns `created`, `exists` or `error` |
| `generate_voucher_code.deluge` | The replaceable code format |
| `notify_member_of_voucher.deluge` | Draft email |
| `void_gti_vouchers.deluge` | Voids active personal vouchers on cancellation |

**Not verified; check when pasting into the Creator editor:** the lookup and multiselect value shapes the CRM accepts through `createRecord` (a plain id for the lookups, a list for the multiselects); the CRM connection name `zoho_crm_connection`; the `zoho.crm.searchRecords`, `createRecord` and `updateRecord` signatures and return shapes on the Guild's account; `zoho.encryption.sha256` (one line, marked `HASH`); and the sender for `sendmail`. The salt must be a Creator constant, not the placeholder text.

**Storing the result:** the processor should save the returned map on the invoice (suggested field `Voucher_Result`) so a failure is visible and can be retried by calling the function again. A failed voucher must never stop the membership activating or the Books push.

## 5. The portal route

`GET /portal/vouchers`, switch `PORTAL_VOUCHERS_ENABLED=true`, signed in, read only. One setting, not secret: `PORTAL_VOUCHER_MODULE` (default `Discount_Voucher`). Field names are fixed to the real ones. Off by default (503). Tests are in `test/vouchers.test.js`: off by default; an active voucher; used and expired vouchers hide their code; voided, bespoke and other Contacts' vouchers are dropped; the module name is a setting. The whole suite passes (255 tests, 252 passed, 0 failed, 3 skipped). The portal's CRM connection needs read on the module and on the new `Voucher_Code` field.

## 6. Gating

Nothing runs against the Guild CRM until the field checks and the end-to-end tests pass. The portal route is off by default; the Creator caller stays disabled (a Creator setting) until Enki's cut-over is agreed. Retries can never create a second voucher: `Voucher_Key` is unique and the function searches it first.

## 7. Risks

- **Two systems issuing.** While Enki still issues vouchers, switching Creator on would double-issue. The cut-over needs a date: Enki stops issuing for portal V2 joins on the day Creator starts. Until then, keep the Creator caller disabled (a Creator setting).
- **Existing members.** Members whose term began before go-live already hold an Enki voucher. This process does not back-fill. A renewal after go-live is the first Creator voucher.
- **Order of events.** Events arrive out of order. The processor must call the function after the CRM update, with the expiry it has just set, not one read from an old event.
- **Cost of a mistake.** A wrong voucher is £25 off a course. The function prefers a clear error to a guess: it refuses without a Contact or an expiry.

## 8. What we still need from the Guild

1. **Examples of the voucher codes** (Qudsiya has offered): the code format, and how today's £25 vouchers are filled in (the only record we have seen is a test). In particular how `Valid_To` behaves when a membership is cancelled, and whether Enki reads `Name` (GR0001) or a code.
2. **When is a membership "verified"?** Is there a manual check after payment, or is Active the moment of payment?
3. **Does Enki also hold or read the codes?** If Enki keeps its own table, who writes it, and can it read the CRM module instead?
4. **How are members told their code today** (email, the portal, staff), and what should it say?
5. **What happens to a code when a membership is cancelled** (void straight away, or valid to the original expiry)? And after a refund?
6. **Edge cases:** a named employee who pays a £55 membership (does each get a voucher, and who is the Contact)? An accreditation that includes Associate membership (we assume it counts as joining). A mid-term change from Associate to Full (we assume no second voucher).
7. **Which invoice module should `Source_Invoice` point at, if it becomes a lookup?** (We store the Stripe invoice id for now.)
8. **Cut-over:** the date Enki stops issuing for portal V2 members, and whether existing members are back-filled.

For A2Z: add the three new fields in section 2, and the code format once the examples arrive.
