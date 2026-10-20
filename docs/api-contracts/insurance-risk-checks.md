# Insurance risk checks

Sanctions, flood and subsidence checks that run with the insurance quote and again when the member pays (`src/riskChecks.js`). V1 had no such checks (only a mock "Compliance check" screen). All three are off until switched on, and each one **fails closed**: if it cannot run, the result is REFER, never a clear result.

## What runs

| Check | Source | Subjects | Listed or matched |
|---|---|---|---|
| Sanctions | UK sanctions list in Zoho Analytics (`UK-Sanctions-List`, loaded daily from the Government) | the buyer and each named employee or subcontractor | potential match: REFER |
| Flood | Creator app `insurance-check`, report `All_Flood_Postcodes` | the premises postcode | listed: REFER (or STOP if its Outcome is Stop) |
| Subsidence | same app, report `Subsidence_Postcodes_Report` | the premises postcode | as flood |

Flood and subsidence run only when the cover needs premises (`propertyRequired`). A postcode that is not a UK postcode is INCOMPLETE (the member fixes it). A quote with no postcode yet runs no postcode check; paying requires one.

## Outcomes and wording

- Findings join the underwriting rules in `catalogue.js` (`insurance.summarise`): STOP, then REFER, then INCOMPLETE, else PASS.
- A sanctions match, whatever the score, tells the customer only: "We cannot complete this online. Please contact the Guild on 01332 224830." (`PORTAL_GUILD_PHONE`). Nothing in the response, the metadata or the member's records says sanctions, a score or a list entry.
- A check that could not run: "We could not finish our checks just now. Please try again in a few minutes or contact the Guild on ..." and it is recorded as an Error for staff.
- Flood and subsidence: "The Insurance team needs to review the flood risk for these premises." (or subsidence), or the STOP wording for an Outcome of Stop.

## Sanctions matching

- A name is compared as a set of words: reversed order, an added or missing middle name, spelling variations (Jaro-Winkler per word) and common transliterations (Mohammed, Muhammad) all match. A lone surname never matches a full name. Company suffixes (Ltd, Limited) are ignored.
- Date of birth and country only move the score: a matching year adds, a different year subtracts, neither is required. The portal does not collect a date of birth today; matching works on name alone and uses a Contact's `Date_of_Birth` only if the Contact fetch is ever extended to return it.
- Low quality aliases score slightly lower. Score at or above `PORTAL_RISK_SANCTIONS_THRESHOLD` (default 0.88) is a potential match. Tune this on real names; expect common names to need staff clearing.
- Analytics cannot fuzzy search, so one SQL query pulls candidates: rows whose forenames start with, or surname contains, the first four letters of any word in the names being screened (two-letter words match exactly). Words are reduced to letters and digits before they reach SQL. More than 20,000 candidate rows is treated as a failure. Names with no Latin letters cannot be screened automatically and are REFER.
- Data safety net: the Government list is treated as live, because it is not always updated, so its age never holds up a quote (`PORTAL_RISK_SANCTIONS_MAX_AGE_HOURS` defaults to 0, off; set 1 to 720 to block on old data). The row count must still be at least `PORTAL_RISK_SANCTIONS_ROW_FLOOR` (40,000, checked every 6 hours); otherwise every screening is REFER with "too few rows" for staff. If Analytics cannot be reached, the screening is also REFER. Existing members are screened separately in the CRM.

## Flood and subsidence lists

Each Creator form has `Postcode` (uppercase with one space, e.g. `AB10 1AU`, as in the source sheets), `Outcome` (Refer or Stop), `InActive` (a tick box, left unticked; tick it to switch a postcode off without deleting it) and `List_Date`; `Postcode_Key` is optional and not used. The lookup is `InActive==false && Postcode=="AB10 1AU"`, whole postcode only (the postcode is normalised to that format first). Creator answers "no records" with HTTP 400 code 9280. The lists hold exceptions, so an unlisted postcode passes; a sector or outward-code fallback would refer whole areas. An empty list or an unreadable report is an error, not "nothing listed" (a check that `InActive==false` returns rows, held for 10 minutes).

## Audit and staff route

- Every pay attempt that is REFER or STOP creates the usual records with Insurance_Policy `Application_Status = Referred`, `Risk_Status` Referred or Stopped, `Risk_Summary` (rule and check codes), and Declarations `Referral_Required = true`. Nothing goes to Stripe. The same application within 5 minutes is recorded once; recording counts against the insurance attempt limits and a recording that fails is an error (502), never skipped.
- A payable pay attempt records `Risk_Status = Clear`.
- Each check run writes a `Risk_Screenings` row: Policy, Contact, Check, Subject, Result (Clear, Potential match, Listed postcode, Error), Screened_At, Data_Version (list load time and rows, or list date), Inputs_Hash (SHA-256 of the normalised inputs), Match_Detail (staff only: the top matches with ids, names and scores), and Investigation_Status (Open, or Cleared for a clear result). If the rows cannot be written the member is not sent to pay.
- A Referred policy is shown to its owner in My records, read-only, with the status "With the Insurance team" (`underReview: true`, no quoted amount, `canPay` false, no documents panel); it counts in the insurance total. A Stopped application is also stored at `Application_Status = Referred` with `Risk_Status = Stopped` and stays hidden from the member's records and from the record page (`records.js`), as other drafts do. The customer is told the reference at pay time (`details.reference`, the policy record id) and, for Stopped, to phone the Guild. Staff investigation fields on `Risk_Screenings` (`Investigation_By`, `Investigated_At`, `Investigation_Note`) are for CRM only.
- Quotes (`/quote`) run the checks but write nothing. Results are cached per instance for 10 minutes by inputs hash; errors are not cached.

## Environment

Switches (all default off): `PORTAL_RISK_SANCTIONS`, `PORTAL_RISK_FLOOD`, `PORTAL_RISK_SUBSIDENCE`. Tuning: `PORTAL_RISK_SANCTIONS_THRESHOLD`, `PORTAL_RISK_SANCTIONS_MAX_AGE_HOURS`, `PORTAL_RISK_SANCTIONS_ROW_FLOOR`, `PORTAL_GUILD_PHONE`.
Connection settings: `ANALYTICS_CONNECTION_NAME` (default `analytics`), `ANALYTICS_API_DOMAIN` (`https://analyticsapi.zoho.eu`), `ANALYTICS_ORG_ID` (optional if the connection sees one organisation), `ANALYTICS_WORKSPACE_ID` (`309854000000255068`), `ANALYTICS_SANCTIONS_TABLE` (`UK-Sanctions-List`), `CREATOR_RISK_APP_LINK_NAME` (`insurance-check`), `CREATOR_RISK_FLOOD_REPORT`, `CREATOR_RISK_SUBSIDENCE_REPORT`; Creator owner and domain reuse `CREATOR_ACCOUNT_OWNER` and `CREATOR_API_DOMAIN`.

## CRM and Creator set-up (done by the owner)

Insurance_Policy: `Risk_Status` (Clear, Referred, Stopped), `Risk_Summary`, and `Referred` in the `Application_Status` picklist. Module `Risk_Screenings` with the fields named above plus `Name`, `Investigation_By`, `Investigated_At`, `Investigation_Note`. Verify the API names with the diagnostics routes before switching a check on: `/portal/diagnostics/fields?module=Risk_Screenings`, `/portal/diagnostics/analytics` (organisations, table columns, last-modified time, row count) and `/portal/diagnostics/creator-report?report=...` (field names only).

## Diagnostics access

Off by default. `PORTAL_DIAGNOSTICS_ENABLED=true` plus an allow-list: `PORTAL_DIAGNOSTICS_EMAILS` (exact addresses) and/or `PORTAL_DIAGNOSTICS_DOMAINS` (whole domains, e.g. `beautyguild.com,a2zcloud.com`). A domain matches itself and its subdomains only, never as "contains", because anyone can sign up to the portal and `beautyguild.attacker.test` would otherwise pass. Everyone else gets a plain 404. Switch it off again when finished.

## Known limits

- Caches and rate limits are per function instance, like the rest of the function.
- The sanctions query is a bulk export job, so a first screening of a new name takes a few seconds. Repeats are cached.
- Business names are not collected by the insurance form today, so only people are screened.
- The existing insurance form text after a blocked quote ("You cannot pay for this cover online. Please contact the Guild Insurance team...") follows the new wording; a later pass can tidy the duplication.
