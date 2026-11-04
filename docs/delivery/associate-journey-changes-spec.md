# Associate Join journey: changes from the Guild's UAT comments

Source: the Guild's comments on S01 and S02 (UAT v1.1, 3 November 2026). Agreed in conversation with the Guild's tester that these are reviewed, not committed scope. This spec covers the part we are building now. It does not cover GDPR preferences, a password on page one, or the course and referral changes.

## 1. What changes

| # | Change | Done when |
|---|---|---|
| 1 | The step called "Extras" is called "Personalise your membership". | The step list and the page heading say so. |
| 2 | Under "Membership Bundle" the page says "Includes Membership Certificate, Badge and Window Sticker". | The line shows under the bundle row. |
| 3 | "Have a code?" is a heading with the box under it, always visible when a code applies. | No button to open it. The Apply and Remove buttons and the messages stay. |
| 4 | "Where are you based?" lists United Kingdom once, with no England, Scotland, Wales or Northern Ireland. | The drop-down shows United Kingdom once. A saved England, Scotland, Wales or Northern Ireland shows as United Kingdom. The server still treats them as UK. |
| 5 | "Membership details" is not a step for an Associate or an International member. | Associate and International see About you, Personalise your membership, Review and pay. The price is for today and the pay frequency is chosen on the price panel (annual or monthly). A Full member with insurance keeps the step, because the start date sets when cover starts. |
| 6 | About you asks interests first: Beauty, Holistic, Nails, Hair, Training. At least one is needed. The question comes before "Do you require insurance?". | The question shows in place of Primary branch. Next stops with "Choose at least one interest". |
| 7 | Primary branch moves to Personalise your membership, as a single "Membership branches" list. The first branch is ticked and included. Further branches cost £15 each. | One list of four branches. The first ticked branch is included, the rest are labelled £15. |
| 8 | The first branch defaults from the interests, in the order Beauty, Holistic, Nails, Hair. Other branches that match an interest are marked "Suggested additional branch". | Choosing Hair and Beauty ticks Beauty and marks Hair as suggested. Changing the interests changes the default until the person has made their own choice. |
| 9 | The review page shows what is being bought: membership, branches, extras, the person's details. Each part has Edit, and extra branches and extras can be removed. | Remove changes the price panel straight away. Edit goes to the right step. |
| 10 | The branch description reads: "There are 4 branches of Guild membership. Select the branch which is best suited to your qualifications and the area you work in. Please note, the branch you choose does not affect your insurance where applicable and the membership element is not regulated by the Financial Conduct Authority. Additional branches are charged at £15 each." | The same words on the page. |

## 2. Decisions we made, for the Guild to confirm

- **Training** is an interest with no branch. It is stored as an interest and ignored when choosing the default. A person who ticks only Training chooses their branch themselves.
- **Interests go back to the Contact.** When a member presses Pay, the function adds their interests to the Contact's `Interests` field (a multi-select picklist) as Beauty, Holistic, Nails, Hair and Training. It adds to what the Contact already holds and never removes anything. It is a best effort: if the CRM refuses a value, the payment still opens. **Training must be an option on the picklist**; if it is not, add it in the CRM. A saved application keeps the interests in its answers but does not write them to the Contact until the member pays.
- **Start date** is today for an Associate and International member. Full membership keeps its start date question.
- **Pay choice** is removed from the steps for Associate and International. It stays on the Full membership details step until the Guild confirms a phone user can find the price panel toggle.
- **£15 an extra branch** is the price the server already charges. The page does not calculate it: the amount shown is the server's.

## 3. Not in this change

- GDPR preferences, a password on the first page, the one-line monthly price, and course data.
