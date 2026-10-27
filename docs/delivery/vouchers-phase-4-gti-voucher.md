# Phase 4: issue the member's £25 GTi voucher

Written 27 October 2026 for A2Z Cloud and the Guild of Beauty Therapists. Design, Creator (Deluge) code and a small portal route. **Nothing is deployed, and nothing has been written to the Guild CRM, Creator, Books or Stripe.** The Deluge has not been run (there is no Creator here to run it in), and the CRM names are unverified (section 2).

Source rule (Guild document and email of 26 October): anyone who joins as Associate, International or Full Member, renews, or upgrades from GTi Student receives a unique £25 GTi voucher. It is assigned to the member, single use, valid until their membership expires or is cancelled, and spent as £25 off a practical GTi course or a £25 contribution to a theory-only course. Decision of 27 October: A2Z sets up a CRM and Creator process that creates it when the membership is verified and Active. Redemption stays where it is today until GTi is rebuilt.

Background: `vouchers-review.md` (PR 67, sections 4.2a, 5 phase 4 and 6) and [creator-payments-app.md](creator-payments-app.md).

## 1. What is in this change

| Part | Where | State |
| --- | --- | --- |
| Design | this file | for review |
| Deluge for Creator | [vouchers-phase-4/](vouchers-phase-4/) (five functions) | written, not run, not deployed |
| Portal route `GET /portal/vouchers` (the member sees their own code) | `apps/portal/functions/beauty_guild_api/src/vouchers.js` | built, off by default, 6 tests, whole suite passes |

## 2. The CRM module `Discount_Voucher`: not yet read

**I could not read it.** The A2Z CRM connectors do not reach the Guild CRM, and the portal's diagnostics route only answers a signed-in, allow-listed user on a deployed function. So the API name, field names, picklist values and example records are **not known**, and nothing below is a finding. Everything else in this change takes the names from one place (a settings block at the top of each Deluge function, and `PORTAL_VOUCHER_*` settings in the portal), so correcting them is a one-line change.

**To do (read only; someone signed in to the Development portal with diagnostics on and their email allow-listed):**

```
GET /server/beauty_guild_api/portal/diagnostics/modules
GET /server/beauty_guild_api/portal/diagnostics/fields?module=Discount_Voucher
GET /server/beauty_guild_api/portal/diagnostics/find?modules=Discount_Voucher,Contacts,Deals&q=voucher
```

Diagnostics returns names, types, mandatory and unique flags, lookups and picklist values, but no record data. For examples, a Guild user opens two or three vouchers in the CRM (a current Associate's, a used one, a cancelled member's) and tells us the code and every field. Then fill in this table: API name, label, type, mandatory, unique, picklist values.

**What I assumed, and what must be true for the design to work**

| Purpose | Assumed API name | Needs |
| --- | --- | --- |
| Code | `Voucher_Code` | text; unique |
| Member | `Contact` | lookup to Contacts |
| Membership | `Membership` | lookup to Deals; optional |
| Value | `Value` | currency or number (25) |
| Valid until | `Valid_Until` | date |
| Status | `Status` | picklist with at least an active, a used and a void value (assumed `Active`, `Used`, `Void`) |
| Idempotency key | `Voucher_Key` | **new**, text, **unique** |
| Source invoice | `Source_Invoice` | **new**, text |
| Void reason | `Void_Reason` | **new**, text |

Three fields are probably missing and are small CRM additions: the unique key (the whole "never a second voucher" guarantee rests on it), the source invoice and the void reason. If the module already has bespoke-voucher fields (type, percentage, usage limit), the £25 voucher is one more type in the same module. If `Discount_Voucher` already holds vouchers that Enki created, old and new records must not clash (section 6).

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

"Verified" means the membership is Active in the CRM. If the Guild has a manual check between payment and Active, the processor must call the function when that check completes, not at payment. The function only needs the Contact, the new expiry and the invoice (section 7, question 2).

### One voucher per Contact per term, and idempotent

The term is identified by its **expiry date after this payment**. The idempotency key is `<ContactId>-<yyyymmdd of expiry>`, kept in a unique CRM field.

- **Retry or duplicate event:** the function searches the key first and returns the existing voucher.
- **Two calls at once:** the second create is refused by the unique key. The function re-reads and returns the winner, and does not report a failure.
- **Monthly plans:** Stripe sends a `subscription_cycle` invoice every month. Payments 2 to 12 leave the expiry unchanged, so the key exists and nothing is created. Payment 13 starts the next term, the membership processor extends the expiry, and the key is new. So Creator must extend the expiry **before** calling the function, and only on the term boundary. Whoever builds the renewal slice needs to know this.
- **Annual renewal:** a year later the expiry moves on a year, so a new voucher.
- **Two Contacts for one person:** the key is per Contact, so a duplicate Contact could be issued a second voucher. Creator must not create a second Contact anyway (handover, section 5, point 9).

### The record

One `Discount_Voucher` record: code, Contact, membership (Deal, when known), value 25, valid-until (the expiry), status Active, key, source invoice. The CRM user behind the Creator connection needs create, read and update on the module.

### Code format

`generate_voucher_code.deluge` is the only place the format lives. Today it makes `GTI-XXXXX-XXXXX`: ten characters from a 16 letter alphabet without look-alike characters, derived from a SHA-256 of the key, a secret salt and an attempt number, so a retry is stable and the code cannot be guessed from a Contact id. **This is a placeholder.** When the Guild sends examples, change the body of that one function; the rest treats the code as an opaque string. The issuer checks the code is unused and tries up to five times before reporting an error. To settle with the examples: whether the format carries meaning (a member number or year), and whether Enki checks a pattern when a code is entered.

### Telling the member

Two routes, both draft until the Guild says how members are told today:

1. **Email** from Creator when the voucher is created (`notify_member_of_voucher.deluge`), only on the call that creates it, so a retry never sends it twice. The wording is a draft.
2. **The portal**, behind a switch: `GET /portal/vouchers` returns the signed-in member's own vouchers. The code is shown only while it can be spent (active and not past its date). There is no portal screen yet; the route is the contract for one. If the Guild prefers staff to give the code by phone, leave both off.

### Voiding on cancellation

`void_gti_vouchers.deluge` sets every **Active** voucher for the Contact (optionally one membership) to Void, with the reason and source id. It never changes a Used voucher, and a second call voids nothing.

- Call it where the **cancellations workstream** marks a membership cancelled, not on every `customer.subscription.deleted`. A subscription that simply ends at the term end needs nothing, because the voucher already expires with the membership.
- Failed payments on a monthly plan: Stripe retries, then cancels. Void on the eventual cancellation, not on `invoice.payment_failed`.
- Refund inside a cooling-off window: not decided (section 7).

### Redemption

Unchanged. GTi booking in Enki checks and spends the code. If Enki holds its own copy of the codes, the new system must write there too, or Enki must read the CRM module. This is the biggest open point (section 7, question 3): a code only the CRM knows about is worthless at the till.

## 4. The Deluge functions

All in [vouchers-phase-4/](vouchers-phase-4/), in the style of Appendix A and B of [creator-payments-app.md](creator-payments-app.md): a `// NOTE:` header, names in one place, never throws, logs with `info`, returns a status map.

| File | Does |
| --- | --- |
| `process_voucher_for_invoice.deluge` | The trigger: decides eligibility, calls the issuer, notifies only on `created` |
| `issue_gti_voucher.deluge` | Idempotent create by key; returns `created`, `exists` or `error` |
| `generate_voucher_code.deluge` | The replaceable code format |
| `notify_member_of_voucher.deluge` | Draft email |
| `void_gti_vouchers.deluge` | Voids Active vouchers on cancellation |

**Not verified; check when pasting into the Creator editor:** the CRM connection name `zoho_crm_connection`; the `zoho.crm.searchRecords`, `createRecord` and `updateRecord` signatures and return shapes on the Guild's account; `zoho.encryption.sha256` (one line, marked `HASH`); and the sender for `sendmail`. The salt must be a Creator constant, not the placeholder text.

**Storing the result:** the processor should save the returned map on the invoice (suggested field `Voucher_Result`) so a failure is visible and can be retried by calling the function again. A failed voucher must never stop the membership activating or the Books push.

## 5. The portal route

`GET /portal/vouchers`, switch `PORTAL_VOUCHERS_ENABLED=true`, signed in, read only. Settings (none secret): `PORTAL_VOUCHER_MODULE` (default `Discount_Voucher`), `PORTAL_VOUCHER_FIELDS` (JSON renaming `code`, `contact`, `value`, `validUntil`, `status`), `PORTAL_VOUCHER_ACTIVE_STATUS` (default `Active`). Off by default (503). Tests are in `test/vouchers.test.js`: off by default; an active voucher; used, void and expired vouchers hide their code; another Contact's voucher is dropped; settings override names and bad names are ignored. The whole suite passes (255 tests, 252 passed, 0 failed, 3 skipped). The portal's CRM connection needs read on the module.

## 6. Risks

- **Two systems issuing.** While Enki still issues vouchers, switching Creator on would double-issue. The cut-over needs a date: Enki stops issuing for portal V2 joins on the day Creator starts. Until then, keep the Creator caller disabled (a Creator setting).
- **Existing members.** Members whose term began before go-live already hold an Enki voucher. This process does not back-fill. A renewal after go-live is the first Creator voucher.
- **Order of events.** Events arrive out of order. The processor must call the function after the CRM update, with the expiry it has just set, not one read from an old event.
- **Cost of a mistake.** A wrong voucher is £25 off a course. The function prefers a clear error to a guess: it refuses without a Contact or an expiry.

## 7. What we still need from the Guild

1. **Examples of the voucher codes** (Qudsiya has offered): the format, and how each `Discount_Voucher` field is filled today (an active one, a used one, a cancelled member's).
2. **When is a membership "verified"?** Is there a manual check after payment, or is Active the moment of payment?
3. **Does Enki also hold or read the codes?** If Enki keeps its own table, who writes it, and can it read the CRM module instead?
4. **How are members told their code today** (email, the portal, staff), and what should it say?
5. **What happens to a code when a membership is cancelled** (void straight away, or valid to the original expiry)? And after a refund?
6. **Edge cases:** a named employee who pays a £55 membership (does each get a voucher, and who is the Contact)? An accreditation that includes Associate membership (we assume it counts as joining). A mid-term change from Associate to Full (we assume no second voucher).
7. **Cut-over:** the date Enki stops issuing for portal V2 members, and whether existing members are back-filled.

For A2Z: someone with portal diagnostics access to run the three read-only calls in section 2 and fill in the field table.
