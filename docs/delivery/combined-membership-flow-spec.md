# Combined membership and insurance flow, and manage membership: specification

Status: draft v0.1 for agreement, 30 October 2026. Written after the customer meeting on 29 to 30 October 2026. Nothing here is built yet.

Scope: Beauty Guild Portal V2 (customer app and `beauty_guild_api`), the CRM staff widget, and what Creator must change. Development environment and Stripe test mode only.

## 1. What the customer asked for

1. One combined Membership and Insurance flow. The separate insurance option on the dashboard goes, and the standalone insurance form is disabled.
2. Customers no longer choose their membership type. Their answers decide it (section 2).
3. "Do you require insurance?" moves to the About You page. Country is the first question of all.
4. The Associate wording that says membership is not available abroad is corrected.
5. Layout: keep the step by step progress bar across the top, and bring the price breakdown down the side.
6. All help text and descriptions from the membership journey and from the insurance form and its documents are carried across. Membership extras (badges, window stickers, bundles, additional branches) become a step, because the insurance version was missing them.
7. Our addition, agreed on 30 October: manage membership is redesigned to look and work like school management (section 9).

## 2. Who gets which membership

### 2.1 Questions that decide it

| Order | Question | Asked when | Notes |
|---|---|---|---|
| 1 | Where are you based? (country) | Always | First question. Existing country list. |
| 2 | Do you require insurance? | Country is in the UK group | On the About You page. |
| 3 | How do you work? | Insurance required | Now a single choice (2.3). |

The country list is the same list the accreditation journey uses (`COUNTRY_OPTIONS`, decided 30 October). The membership and insurance forms already read it, so no second list is created.

The UK group is the United Kingdom, England, Scotland, Wales and Northern Ireland, the same set the accreditation journey treats as UK (`UK_COUNTRIES`). Jersey, Guernsey and the Isle of Man are added to the shared list and are International, like Ireland and Other (decided 30 October). They are therefore offered no insurance online, and the "no insurance abroad" message applies to them.


Country decides the branch of the flow. The declaration itself (domiciled and over 18) stays where it is, on the insurance step, so age is not mixed into routing.

### 2.2 Decision matrix

| Country | Insurance required? | How you work | Result | Stripe price (lookup key) |
|---|---|---|---|---|
| Outside the UK group | not asked | not asked | International membership, no insurance, message about insurance not being available | `MEM-INTL-Y` |
| UK group | No | not asked | Associate, all insurance steps skipped | `MEM-ASSOC-Y` |
| UK group | Yes | Work from home, work on a mobile basis, or sole occupier and self-employed | Full Non-Salon with insurance | `MEM-FULLNS-Y` |
| UK group | Yes | I own/operate a salon in a commercial/retail premises | Full Salon with insurance | `MEM-FULLS-Y` |

The "no insurance abroad" message is a single constant (`INTERNATIONAL_NO_INSURANCE_TEXT`), with placeholder wording until the customer sends theirs. Replacing it must not need any other change.

### 2.3 How you work becomes a single choice

Today the question is "Select every way that you work" and allows several answers, and `isSalon()` treats any salon answer as salon. The customer has confirmed that a salon and a non-salon answer cannot be mixed. So:

- The portal asks one question with radio choices: work from home, mobile basis, sole occupier and self-employed, or own/operate a salon.
- The server rejects a request with more than one answer, or with a salon answer together with any other (`INVALID_WORKING`).
- Saved drafts and records that hold several answers are asked this question again on resume. The first answer is not guessed. The Guild confirmed on 30 October that existing data is fine, so there is no data clean-up before release.
- The CRM field that holds the answers (`insWorking`) keeps its array shape, with one entry, so nothing in the CRM or Creator changes shape.

### 2.4 International membership

- A catalogue item `membership_international_annual` is added: lookup key and code `MEM-INTL-Y`, yearly, £55.00. The Stripe price already exists in the test account (`price_1UTnTG10QCT3po6rpgmWqWXk`, product "International Member - Annual Membership", metadata `code` `MEM-INTL-Y`).
- VAT is the same split as the other levels: £38.00 of the £55.00 is zero-rated and the rest standard-rated (`zeroRatedPence: 3800`). The Books item description says this, and that the VAT option and rate stay on the item in case VAT rules change.
- Yearly only, because no monthly price exists. International members are not offered monthly billing (confirmed 30 October). If monthly is wanted later, a monthly price is needed in Stripe first.
- The server stops refusing `international` as a level, but only when the decision function returns it. A client can no longer choose it.
- Metadata `membership_level` gains the value `international` (section 8).
- International members cannot buy insurance and cannot upgrade to Full with insurance (section 6.3).

### 2.5 One server function

All of this lives in one function, `decideMembership(answers)`, in the function code (`membershipDecision.js`). It takes `{ country, insuranceRequired, working }` and returns `{ level, insurance, route, skipSteps, message }`, or an error naming the missing or invalid answer. The portal, the staff API and the draft routes all call it. No client sends a level any more, so they cannot disagree.

Unit tests cover every row of the matrix, an unknown country, a missing answer, a mixed working answer, each UK group member, and Jersey, Guernsey and the Isle of Man as International.

## 3. The customer journey

### 3.1 Steps

The progress bar across the top stays. Steps shown depend on the outcome, which is known after the answers are in. Names are proposed and use the existing wording where it exists.

| Outcome | Steps |
|---|---|
| International | About you, Membership details, Extras, Review and pay |
| Associate (UK, no insurance) | About you, Membership details, Extras, Review and pay |
| Full (UK, insurance) | About you, How you work, Business information, Cover options, Declarations, Membership details, Extras, Review and pay |

- **About you** holds country, "Do you require insurance?", the contact details currently asked in applicant details, and any pre-filled values from the Guild.
- The answers on this page change the steps shown. Changing an answer later recomputes the steps and keeps answers that still apply, with a note for any that no longer do.
- **Extras** is the membership page content moved into its own step: membership bundle, certificate, badge, window sticker and additional branches. Today the insurance version has no extras.
- **Price panel** moves to the side, as in the membership page today. It shows the membership line, joining fee, extras, insurance and IPT where they apply, the upgrade credit row, and the total. On a phone it collapses to a summary bar above the pay button.

### 3.2 Content carried across

Every description, help text and subtext from `BuyMembership.jsx`, from `insuranceInputs.js` (the insurance form questions and cover descriptions) and from the insurance documents is kept. This is a move, not a rewrite. The build must include a check listing each old help string and the new place it appears, so nothing is dropped.

### 3.3 The wording fix

The International line ("International membership is priced individually. Please contact the Guild to join from outside the UK.") is removed, and any Associate wording that says membership is unavailable abroad is corrected. Associate service page copy ("Choose Associate Membership, or Full Membership with insurance") is replaced, because the customer no longer chooses.

### 3.4 Renewals

Renewals ask the same questions, pre-filled from the current membership and policy: country from the Contact, insurance required from whether there is a current policy, how you work from the policy. The member can change them. The result then follows the matrix, so a member who stops needing insurance renews as Associate. The joining fee gap rule is unchanged.

## 4. When insurance cannot go ahead

A UK customer who said they need insurance may be declined or referred, or may not be able to make the declaration (for example, under 18). Today the quote returns a referral, the CRM records are written (Application_Status Referred, Risk_Status and Risk_Summary) and nothing reaches Stripe. That stays. The notice gets two buttons:

- **Contact the Guild.** The referred record stays as it is, for the Insurance team.
- **Join as Associate instead.** The portal writes Application_Status `Customer joined as Associate` on the referred insurance record, then continues the flow as Associate (UK, no insurance). The write happens when the customer clicks, not at payment, so the Insurance team stops chasing as soon as the customer has chosen. If they abandon payment afterwards, they have still dropped insurance.

Both paths keep the CRM record. Required: confirm the portal's CRM write permission covers Application_Status on the insurance record and that the picklist value `Customer joined as Associate` exists in the Development CRM.

## 5. Routes and removal of the standalone insurance flow

| Today | After |
|---|---|
| Dashboard cards: Membership, Accreditation, Insurance | Cards: Membership and Insurance, Accreditation |
| `/membership/buy` | The combined flow |
| `/insurance/buy`, `/insurance/new` | Redirect to the combined flow (the form is disabled) |
| `/insurance` service page | Redirects to the Membership and Insurance page |
| Associate "Get an insurance quote" link | The upgrade flow, as now (section 6) |
| "Buy another policy" (Full members) | Moves to manage membership, "Add another policy" (decided 30 October, section 9.2) |

A client flag `VITE_PORTAL_COMBINED_FLOW` and a function switch `PORTAL_COMBINED_FLOW_ENABLED` switch the new flow on, so it can be turned off while the old routes remain. The old standalone code is removed only after UAT passes.

## 6. Upgrades, cancellations and other interactions

1. **Upgrade from Associate to Full.** Unchanged in money terms (credit coupon, `previous_subscription_id`). The flow skips the questions it already knows: country comes from the Contact and must be in the UK group, insurance required is Yes, and the member answers how they work.
2. **Quote route.** The staff and customer quote routes take answers, not a level (section 7). The upgrade request carries `previousId` as now.
3. **International members cannot upgrade.** The upgrade check looks at country as well as membership type, and refuses `UPGRADE_NOT_AVAILABLE` for International. If an International member moves to the UK group, they renew as a new membership by the matrix. They do not upgrade mid-term.
4. **Cancellations and refunds.** The cancellation engine must recognise `MEM-INTL-Y` as a membership SKU (the SKU classifier in `paymentFacts.js`) and an International membership type. The Guild confirmed on 30 October that International follows the same rules as Full: a pro-rata refund of the unused membership fee with the £10 fee netted off it, no fee inside the 14 day cooling off, which for International (no policy) counts from the membership start. There is no insurance, IPT or policy refund. The engine gets an `international` level for this, separate from Associate.
5. **Joining fee, vouchers and discounts.** Unchanged. The joining fee gap rule already counts International.

## 7. API changes in `beauty_guild_api`

- New input on `POST /portal/checkout/quote`, `/portal/checkout/pay`, the draft routes and the staff routes: `answers: { country, insuranceRequired, working }` in place of `level` for the membership service. The server calls `decideMembership` and fills in `level`, `insurance` and the steps.
- Compatibility: a request that still sends `level` is refused with `LEVEL_NOT_CHOSEN_BY_CLIENT` once the combined flow switch is on. While the switch is off, behaviour is exactly as today.
- Responses add `decision: { level, route, insurance, steps, message }` so every client shows the same steps and message.
- `catalogue.js`: `membership_international_annual` added, `LEVELS` gains `international`, the refusal line removed, and monthly refused for international (`BILLING_NOT_AVAILABLE`).
- `metadataContract.js`: `membership_level` documents `international`, and `docs/api-contracts/stripe-metadata.md` is regenerated.
- `docs/api-contracts/pricing-payments.md` and `staff-api.md` are updated.

## 8. What Creator must change

Little changes in shape. The metadata contract stays the same apart from one new value.

1. `membership_level` can now be `international`. Creator maps it to the International membership type on the Deal and membership record. It is the type the Accreditation bundle already uses, so the type exists.
2. Books items for International are `MEM-INTL-Y-ZERO` (£38.00 zero-rated) and `MEM-INTL-Y-STD`, as for the other levels. `MEM-INTL-Y` is already in the handover list of catalogue prices. Confirm both Books SKUs exist and that the "Stripe to Books" mapping covers them.
3. An International purchase has `insurance_requested=false`, no insurance keys and no Policy. Check the handler does not assume a Policy for every membership.
4. On a monthly plan the membership line code is the level. International is yearly only, so this does not arise, but the handler must not fail on the code `MEM-INTL-Y`.
5. Upgrades: Creator ends the old Associate subscription at `membership_start` using `previous_subscription_id` (decision D11, agreed 30 October). International never upgrades.
6. Cancellations (Creator side, when built): treat International like Full for the refund and the £10 fee, with no policy or IPT (section 6.4).
7. No change to Creator is needed for the decision itself, the extras step, or the layout. The status `Customer joined as Associate` is written by the portal, not Creator.

## 9. Manage membership redesigned like school management

### 9.1 Problems today

`MembershipManagement` is a plain page with five tabs (Details, Your cover, Change history, Add-ons, Invoices). Details prints every raw CRM key and value as a list. A "Renew membership" button floats above the tabs. Insurance, cancellation and upgrade actions are scattered. School management, by contrast, has a heading with the school name and status, a left navigation grouped into sections, and a panel that follows the same pattern everywhere.

### 9.2 Target layout

Use the same shell as school management (`school-layout`, `school-nav`, `surface padded` panel), taken out into a shared `ManagementLayout` component that both use, so they cannot drift apart.

- **Header:** eyebrow `MEMBERSHIP`, the membership title, and a line of level, status and expiry (for example "Full Member (Non-Salon) · Active · to 30 Nov 2026").
- **Left navigation, grouped:**
  - Membership: Overview, Branches and extras
  - Insurance (only when there is a policy): Your cover, Changes and history, and Add another policy
  - Records: Documents, Invoices
  - Actions: Renew, Upgrade (Associate, UK only), Cancel (when cancellations are on)
- **Overview** replaces the raw Details dump with labelled fields: level, status, start and end dates, billing (annual or monthly), primary branch, referral and reference. Raw CRM keys are never shown. It also shows what needs attention: renewal due, payment failed, change awaiting payment.
- **Branches and extras** replaces the Add-ons tab. Purchased extras and branches in a table, with the "Add a branch or buy add-ons" button.
- **Your cover and Changes and history** are the existing cover and change history panels, unchanged in content.
- **Documents** adds the membership documents, now reachable from the manage page, as school management does for accreditation.
- **Invoices** is the existing table.
- **Add another policy** (decided 30 October) quotes and buys a further policy from here, for an active Full member in the UK group. It uses the existing insurance steps and the existing `insurance` service with the membership as context, with no membership fee and no joining fee. The standalone insurance form for non-members stays removed. The policy asks "How you work" again, as a new premises may differ, and follows its own answer. The membership level stays as it is, unless the member upgrades it, or the renewal upgrades it (decided 30 October: a Non-Salon member who answered salon on a policy is moved to Full Salon at renewal). The member is told this when they buy the policy. The server refuses it for Associate, International, non-UK or inactive memberships.
- **Actions** show only what the member can do. Renew shows from 60 days before expiry or after it. Upgrade shows for an active UK Associate. Cancel shows only with the cancellation switches on, and opens the cancellation quote.
- On a phone the left navigation becomes a horizontal scrolling tab bar, as school management does.
- Routes become `/membership/manage/:id/:section`, with the old `?tab=` links redirecting to the matching section so saved links and emails keep working.

### 9.3 Consistency with the school profile

The school profile (PR 113) set the visual pattern: identity hero, tabbed content, clear save and discard states, read-only details shown with a lock note. The membership overview follows it. Nothing on the overview is editable, because membership details change through renewals and changes, so it shows the "managed by the Guild" note in the same style.

## 10. Staff widget ripple effects

The staff widget "follows the portal" (customer decision, 30 October). The decision function is shared, so the widget cannot hold its own rules.

1. **Quote and payment link routes.** `/staff/quote`, `/staff/payment-link`, `/staff/membership-options`, the draft routes and `/staff/cover` take `answers` for a membership. `level` is no longer sent by the widget. The responses carry `decision` so the widget can show "Full Member (Non-Salon), with insurance" without logic of its own.
2. **Assisted creation (widget spec section 6).** The membership and standalone insurance forms merge into one staff form with the same questions in the same order: country, insurance required, how you work. The staff declarations step stays. The separate "insurance" service for new customers is removed with the portal's standalone form. The `insurance` service stays only for "Add another policy" on an existing Full member's record.
3. **Staff API doc and the widget spec** are updated (staff-api.md, SPECIFICATION.md sections 6.1 and 6.4, and the build brief). The cross-system cancellation spec and the widget cancellations note refer to levels, so they follow.
4. **The CRM function (Deluge).** The named actions that send `level` change to send the answers. The action names and signing stay the same. The widget needs the updated function body, as for the previous staff API changes.
5. **Existing drafts.** Staff drafts with a mix of working answers get the same re-ask as customers (2.3).
6. **Another policy for an existing member.** The staff quote and payment-link routes accept `service=insurance` only with the membership as context, under the same eligibility rules as the portal (9.2).
7. **UAT.** The widget scenarios for assisted membership and insurance, the staff quote tests (`staff-routes.test.js`) and the widget mock tests are rewritten for the answers input.

## 11. Decisions

Decided on 30 October 2026:
- A second policy is quoted and bought from manage membership (9.2).
- International is yearly only.
- The "no insurance abroad" message is a placeholder constant until the customer sends wording.
- `Customer joined as Associate` is the Application Status value. Still to confirm in Development: the portal can write it.
- Existing data is fine, so there is no clean-up of mixed working answers.
- Creator ends the old Associate subscription on upgrade (D11).
- The country list is the accreditation list.

Also decided on 30 October:
- The £10 cancellation fee applies to International, and International follows the same rules as Full (6.4).
- A second policy with a different "How you work" answer leaves the membership level alone until the member upgrades or the renewal upgrades it (9.2). The renewal quote shows the higher price before the member pays.
- Jersey, Guernsey and the Isle of Man are added to the country list and are International (2.1).
- A member moving between the UK and abroad renews by the matrix, with no mid-term change.
- The existing insurance declaration still names the Channel Islands and the Isle of Man. The Guild understands they are now International and will review that wording separately. No change is made to it in the build.
- The "no insurance abroad" message and the corrected Associate wording ship with customer facing placeholder text, replaced when the Guild sends its own.
- The portal's write to Application Status `Customer joined as Associate` needs no new permission: the portal already writes that field on `Insurance_Policy` (it sets `Expired`). Only the picklist value has to exist, and the Guild has confirmed it does.

Still open: nothing blocking. Wording from the customer (the two placeholders) is the only item waiting on them.

## 12. Delivery plan

Each piece is its own pull request, merged and deployed in this order. Switches stay off until UAT.

1. **Decision function and catalogue** (`membershipDecision.js`, `membership_international_annual`, metadata value, tests, docs). No visible change.
2. **API inputs** (`answers` on customer and staff routes, `decision` in responses, compatibility rule, old `level` refusal behind the switch).
3. **Combined journey** (country first, About You, single choice working question, steps by outcome, extras step, side price panel, content carried across with the check list, referral buttons and the status write).
4. **Routes and dashboard** (single card, redirects, flags). Standalone code stays until UAT passes.
5. **Manage membership redesign** (`ManagementLayout`, sections, Overview fields, redirects from `?tab=`).
6. **Staff widget and the CRM function** (answers input, merged form, spec updates).
7. **Creator** (section 8) and the updated UAT workbook.

Tests: unit tests for the matrix and every error; API tests for each route with answers and for the refusal of `level`; client tests for step lists per outcome and the help text checklist; the existing cancellation, upgrade and staff suites updated and green; a Development run of one purchase per outcome in Stripe test mode (International, Associate, Full Non-Salon, Full Salon) and one referral that ends in "Join as Associate".

Risks: changing the question to a single choice affects saved drafts and renewals (re-ask rule); losing help text in the move (checklist); staff and customer drifting apart (one function); International pricing and VAT depending on Books staying as described (the VAT split is a single constant per item).
