# Cancellations, downgrades and upgrades: widget scope

**Status:** draft v0.1, 29 October 2026. **Nothing here is built.** This tells the Staff Workspace build what is coming so it can be designed in, not bolted on. The full cross-system specification (rules, Stripe, Creator, CRM, Books) is on `main` at `docs/delivery/cancellations-refunds-spec.md`; **where this document and that one differ, that one wins.** The Guild's source is `Cancellations.xlsx`.
**Related:** [SPECIFICATION.md](SPECIFICATION.md), [STAFF-API-AND-IDENTITY.md](STAFF-API-AND-IDENTITY.md), [WORKFLOW-FIELD-EDITING.md](WORKFLOW-FIELD-EDITING.md), [STAFF-ASSISTED-MTA.md](STAFF-ASSISTED-MTA.md).

## 1. What the widget has to do

Three of the four scenarios exist **only in the CRM**, so they are widget work. The fourth (upgrade) is also online for the member, and staff need it too.

| Scenario | Widget work |
| --- | --- |
| **S1 Cancel Associate** | A cancel panel with no refund by default and a staff override (full or partial), a reason, no fee, no email |
| **S2 Upgrade Associate to Full** | The staff-assisted version of the portal journey: the same quote with the credit, then a payment link. Reuses the `quote` and `payment_link` actions |
| **S3 Cancel Full** | The cancel panel with the server's refund breakdown, the date, confirm, and the documents and email status |
| **S4 Downgrade Full to Associate** | The same panel as S3, with the new Associate term shown |

### The rule that does not change
**The widget never calculates a refund, a credit, a fee or a date.** It sends the staff member's inputs to the server and shows exactly what comes back. No figure shown on screen is computed in the browser.

## 2. The cancel panel (S1, S3, S4)

Opened from a Membership record (the Deal) for an active membership. It has three states.

1. **Set up:** the scenario (Cancel Associate, Cancel Full, Downgrade Full), the **effective date** (default today), and for the cases that allow it a **manual membership fee refund** field with a **required reason** (a picklist plus a note). The manual field is shown only to roles allowed to override.
2. **Review (the server's quote):** every line the server returns, in this order, nothing hidden:
   - membership fee paid, refund (and whether it is a staff override);
   - insurance policy period, used and unused days, premium and IPT refund;
   - the cooling-off flag (14 days from the insurance start), when it applies;
   - the **£10 fee applied** (or "none, cooling off"), and a clear **"No refund due"** state when the fee is more than the refund;
   - the **net refund**, the subscription that will end and when, and the refunds that will be made (which payment, how much);
   - any **warnings** (for example extra branches, employees or add-ons on the membership, or accreditation on the same subscription).
   Changing the date or the override calls **quote** again. Nothing on this screen changes anything.
3. **Confirm:** the staff member confirms the **net figure they saw**. If the server answers `QUOTE_CHANGED` the panel shows the new figure and asks again. Then a progress view shows each step the server reports (subscription ended, refund created, CRM updated, Note added), and any failure with a **Retry** button.

After a cancellation the panel shows the cancellation record: status, the refund amounts, the Stripe refund references, and the documents and email status (defined separately).

### Behaviour rules
- **Roles:** the override field and the confirm button follow the approved roles (the staff API already refuses others; the widget hides what a role cannot do, but never relies on hiding).
- **No double submit:** the confirm button is disabled while a call is in flight, and a repeat is safe on the server (idempotent).
- **Refused cases are explained, not hidden:** `MIXED_SUBSCRIPTION`, `ALREADY_CANCELLED` and `OVERRIDE_NOT_ALLOWED` each show a plain message and who to ask.
- **Nothing is marked Paid, Active or Cancelled by the widget.** Status changes come from the server (and Creator); the widget refreshes and displays them (the existing rule for payments).
- **Do not use the workflow-field editor** to cancel or change status. Cancelling is only through this panel.
- **Audit:** the server writes the log line and a CRM Note; the widget adds nothing of its own.

## 3. The staff-assisted upgrade (S2)

The same journey the member gets online, started by staff for a chosen Contact who holds an active Associate membership:
1. Choose the Contact and their Associate membership, then **Upgrade to Membership with Insurance**.
2. The insurance questions and start date (up to 30 days ahead; the Associate continues until that date), as in the existing assisted creation.
3. A **quote summary**: the insurance quote, the Full membership, **less the refund due on the Associate membership**, and the **total to pay today**, all from the server.
4. A **payment link** for the net (the existing `payment_link` action, which needs the customer's acceptance of the Code of Ethics and terms, captured from the customer). Vouchers and waivers are not allowed on a link yet.
5. No cancellation email and no documents for the Associate. The member receives the normal full membership acceptance email once they pay.

If the member does not pay, nothing changes: the Associate is untouched.

## 4. API actions the CRM function must add

The CRM function maps an action name to one fixed route (STAFF-API-AND-IDENTITY.md section 3). These are to add **when the backend exists**; the names and bodies are the contract the backend will be built to ([staff API contract](../../../docs/api-contracts/staff-api.md) on `main` gets the full shapes when they are built).

| Action | Method and route | Purpose |
| --- | --- | --- |
| `cancellation_quote` | `POST /staff/cancellation/quote` | Read only. Body: `contactId`, `membershipId`, `scenario`, `effectiveDate`, optional `membershipRefundPence`, `overrideReason` |
| `cancellation_confirm` | `POST /staff/cancellation` | Same body plus `confirmNetRefundPence` and `inputsHash` from the quote. Safe to repeat |
| `cancellations_list` | `GET /staff/cancellations?contactId=...` | A Contact's cancellation records |
| `cancellation_retry` | `POST /staff/cancellation/retry` | Body `cancellationId`. Resumes a failed refund |
| `quote`, `payment_link` | existing | The upgrade, with service `membership_upgrade` and `previousId` (the Associate membership) |

Nothing is called until the switch is on (`PORTAL_CANCELLATIONS_ENABLED`, off by default); the widget must show a clear "not available yet" state for a `503 NOT_AVAILABLE`.

## 5. Data the widget needs to read (CRM SDK, with the staff member's own permissions)

- The membership (Deal): type, start and end dates, status, the Stripe subscription reference.
- The insurance policy and its status, if any.
- The **cancellation record** (new CRM module, suggested name `Membership_Cancellations`) and its status, so the panel can show history and any retry state.

The widget reads these itself so the CRM applies the staff member's own permissions. Only the computed figures (the quote) come from the function.

## 6. Acceptance tests (widget side)

| ID | Scenario | Expected |
| --- | --- | --- |
| W-01 | Open the panel on a Full membership with insurance | The server's breakdown is shown; no figure is computed in the browser |
| W-02 | Change the date | A new quote is fetched and replaces the figures |
| W-03 | Cooling off | Flagged, no fee shown, everything refundable |
| W-04 | Fee larger than the refund | "No refund due", net £0.00, confirm still allowed |
| W-05 | A role without override rights | No override field; a direct call is refused by the server |
| W-06 | Confirm after the figures changed | The new figure is shown and re-confirmation is asked |
| W-07 | Double click on confirm | One cancellation |
| W-08 | A refund step fails | The failed step and a Retry button; Retry resumes, never repeats a refund |
| W-09 | A subscription that also holds accreditation | A clear refusal, nothing changed |
| W-10 | Staff upgrade | Quote shows the credit and net; the payment link is for the net |
| W-11 | The switch is off | A clear "not available yet" message |

## 7. Open points that affect the widget
The detailed list is in section 12 of the main specification. The ones that change the screens: the approval limit for a manual membership refund (a second approver?), whether staff may back-date the effective date, what the downgraded Associate period looks like after it ends, and which extra items (branches, employees, add-ons) must be shown or refused. Until they are answered, build the panel to **show a warning and refuse** rather than guess.
