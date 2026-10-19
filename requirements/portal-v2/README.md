# Beauty Guild Portal V2: agreed baseline

**Status:** Requirements baseline for frontend architecture; backend API details and fulfilment rules remain subject to confirmation.

## Identity and drafts

- The public user may progress through a journey before account creation.
- Account creation or sign-in is required at final submission/payment; Save & Finish Later triggers that checkpoint sooner.
- Custom-branded Catalyst authentication is used; the backend resolves an authenticated user to a CRM Contact and creates one where appropriate, avoiding duplicates.
- Saved **Membership, Insurance and Accreditation** drafts reside in CRM, are bound to the verified Contact and can be listed, resumed, updated and discarded.
- Public in-progress form state is temporary until the user authenticates and a CRM draft is saved.

## Accreditation

- Training centre country determines Standard (UK) or International Accreditation, not the applicant's residential address.
- UK includes England, Scotland, Wales and Northern Ireland.
- Non-members require Associate Membership for UK accreditation or International Membership for non-UK accreditation.
- Read Valid From and Valid To from the existing CRM Accreditation record.
- Backend remains authoritative for membership eligibility, approved prices, payment and fulfilment.

## Insurance

- Preserve existing insurance questionnaire, calculation display and referral/stop presentation.
- Save referred quotations to CRM with a flag/status and sufficient referral context for Guild review.
- A quotation/policy pending payment or manual review must not be presented as active cover.
- Qualification uploads are excluded from the initial release; a WorkDrive collection URL is the intended later mechanism if evidence is required.

## Experience and deferred work

- Retain the existing Beauty Guild branding and operational journeys.
- Direct record URLs and navigation context should survive record view and return.
- GTi Courses and My Profile may remain placeholders.
- CRM Discount Voucher validation and Stripe discount application follow core payments. Confirm exact redemption and fulfilment behaviour from the existing documentation first.
- Insurance MTAs and endorsements are a separate workstream until scoped.

## Unconfirmed dependencies

- CRM draft schemas for Membership and Insurance
- Final backend API contract and authentication/Contact linkage
- International price and post-payment membership fulfilment
- Referral statuses and notification mechanism
- Voucher-specific business rules and redemption event behaviour


## Related proposed workstream: MTA customer self-service

The [MTA customer portal functional specification](../mta/customer-portal-functional-spec.md) captures the proposed authenticated membership and insurance amendment experience from the Guild's MTA workbook. It is **for review only** and does not authorise a change to the approved Portal V2 release scope or implementation of payments/underwriting.
