# Planned service adapters

**Not implemented.** This directory will hold clients to the agreed backend contracts only after the backend owner signs off on them.

- CRM context adapter: read Contact, Membership Deal, Insurance Policy, existing extensions, current revision and related records with verified access.
- MTA quote adapter: send proposed changes; accept **server-calculated** prices, underwriting status and stable quote/version IDs.
- Revision adapter: create/read/update drafts, submit for review, resolve conflicts and recover failed operations.
- Settlement adapter: create/reuse checkout only through approved backend service and poll/read trusted settlement state.
- Documents adapter: list/download authorised revision documents and show generation/delivery failures.

The CRM Embedded App SDK may supply logged-in user/record context, but backend writes must still perform independent authorisation. Do not carry Catalyst session tokens into the widget or expose privileged secrets in JavaScript.

Do not directly call Stripe from this widget, calculate tax or premiums here, or change CRM policy status based on return URLs. The actual routes proposed in docs/api-contracts/mta.md are **unimplemented**.
