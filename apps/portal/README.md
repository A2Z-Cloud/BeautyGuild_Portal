# Beauty Guild Portal V2: Milestone 1 frontend preview

**Status:** Frontend-only demonstration. No live CRM, user accounts, pricing, underwriting, payments, documents, draft persistence or policy issuance.

## Prerequisites and local validation

Use Node.js 20.19+ or Node 22+ with npm.

~~~sh
cd apps/portal
npm install
npm run check
npm run dev
~~~

The local Vite development server URL is printed by npm. For a production-style static preview:

~~~sh
npm run build
npm run preview
~~~

The built static site is in apps/portal/dist/. Do **not** commit dist/ or node_modules/. Example records and names are labelled sample/demo data and are not persisted or fetched from CRM.

## Manual deployment and Catalyst considerations

The repo does not have a Catalyst project link or deployment manifest and intentionally does not deploy automatically. The backend/release owner determines which Catalyst project, environment and hosting model is used.

- For root-hosted static sites: build using npm run build, publish the contents of dist/ to a hosting setup that serves index.html and supports SPA history fallback. Verify deep routes on direct browser refresh.
- For a legacy Catalyst web client hosted at /app/: set VITE_PUBLIC_BASE=/app/ when building. Browser routing is automatically configured to use /app/ in that mode. The release owner must confirm the required Catalyst client packaging and SPA fallback rules before deployment. This repository currently does **not** contain a tested Catalyst deployment configuration.
- If Catalyst uses a different hosting root, configure VITE_PUBLIC_BASE to the actual public mount path, and verify generated asset URLs and deep links.
- This frontend preview is not a replacement for Catalyst Authentication. The React dev server does not provide authenticated Catalyst runtime behaviour; session tests will require your Development hosting and backend setup.

Do not add the portal to a Catalyst project that deploys unrelated code without verifying targets and working configuration. Do not enable automatic functions deployment.

## Expanded Milestone 1 screens

- Dashboard, Membership, Accreditation, Insurance, sample records and direct record tabs.
- Multi-step membership details, branches, optional insurance and review.
- Applicant, correspondence, training centre, tutors, courses and declarations for Accreditation.
- Insurance business working methods, specialist treatments, conditional premises, underwriting disclosures and review.
- Login, sign-up, password reset, and account checkpoint at the end or on Save & Finish Later.
- Account management with sample profile, communication preferences, account/security and membership links.

**Security and persistence:** React keeps demo answers in memory only; it does not persist passwords or CRM drafts. Form actions report unavailable backend functionality rather than giving false success.

## Expected smoke test

See [SMOKE-TEST.md](SMOKE-TEST.md) for routes, mobile sidebar, forms, review screens, sample record tabs and return navigation.

## Backend handover for Milestone 2

The isolated frontend service boundary is src/services/api.js. It **deliberately** throws for identity, CRM draft create/update/list/get/discard, authoritative pricing, underwriting, record submission, document access and Stripe Checkout.

You own all backend integration endpoints, authenticated Contact association, CRM schemas, Creator/Stripe business logic and Catalyst deployment. Share confirmed API contracts when ready. Do not substitute mock fixture values into live operations. Ensure the backend verifies ownership and determines all payable amounts and active statuses.

## Limits

- All three forms now contain V1-informed membership, accreditation and insurance stages with conditional questions for tutors/venues and insurance property. They are not an exact CRM field map or full V1 pricing/underwriting implementation. Catalogue, Loqate, pricing and final field parity require backend review.
- Completing the review screen opens an account checkpoint (sign in/create account), not a real submission. Nothing is sent to CRM or Stripe.
- Sample record details, statuses and dates are fictional, with URL-persistent tabs.
- Login, sign-up, password reset, account checkpoint and account management are navigable frontend demonstrations. No real account creation, authentication, emails, CRM changes or payments occur. Sample journey answers remain in React memory when navigating between screens, but are lost after a full page refresh.
- Fonts are loaded from Google Fonts (fallbacks are provided); confirm branding assets/licensing before Production.
