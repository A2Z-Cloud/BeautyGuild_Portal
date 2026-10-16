# Portal V2 implementation plan

**Working model:** Frontend and GitHub delivery are assistant-owned with user review. Backend, Catalyst configuration, CRM/Creator/Stripe/WorkDrive logic, data models and release are user-owned.

| Phase | Frontend outcome | Backend dependency |
| --- | --- | --- |
| 0. Repository preparation | Workspace paths, conventions, requirements, no deployment | None |
| 1. Shell | Beauty Guild branded React shell, clean navigation and routes | None |
| 2. Identity | Login/registration UI, checkpoint, resume intent | Catalyst auth + Contact linking |
| 3. Shared journeys | Step framework, summaries, CRM draft list/save/resume/discard UI | Draft CRUD endpoints |
| 4. Accreditation | V1 journey parity, membership classification, record views | CRM accreditation, membership and checkout APIs |
| 5. Membership | V1 quote and renewal/upgrade UI migrated into React | Membership and payment APIs |
| 6. Insurance | Standalone and combined cover, underwriting and referral UX | Quote, referral, policy and payment APIs |
| 7. Portal records | Dashboard, training centre, qualification, document, invoice views | Read APIs and access checks |
| 8. Integration and review | Complete frontend contracts, regression and review PR | Test services and backend/UAT ownership |

Each phase gets a reviewable commit/PR and summary of completed functionality, blockers and unresolved API contracts. Do not merge to `main` or deploy without approval. V1 stays intact.

**Deferred:** Discount Vouchers pending source documentation and core Checkout; MTAs/endorsements; qualification uploads; full GTi Courses/My Profile.
