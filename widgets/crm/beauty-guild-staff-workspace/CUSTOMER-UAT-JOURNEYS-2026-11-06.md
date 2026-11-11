# Staff Workspace: customer user acceptance testing

Welcome, and thank you for helping us test the Staff Workspace.

The workspace is a single screen inside Zoho CRM where your team can find a member, check their membership and insurance, add notes and tasks, and move an application forward, without hunting through lots of CRM tabs.

## How this test works

Instead of a list of buttons to press, you will follow **ten short journeys**. Each one is a realistic piece of a working day. Work through them in order the first time, because later journeys build on earlier ones.

- Allow about **90 minutes to two hours** in total. Journeys are 5 to 15 minutes each.
- Use the **test records** we give you (listed below). Please do not use live member records.
- Do not worry about breaking anything. If something looks wrong or confusing, that is exactly what we want to hear about.
- This is as much about **how you would really use the workspace** as whether it works. Say out loud what you expect before you click, what you wish was there, and what you would do differently. There are no wrong answers.

### What is in this test, and what is not

| In this test | Not in this test (coming later) |
| --- | --- |
| Finding and reviewing members, membership, insurance and accreditation records | Reassigning tasks, or seeing other people's tasks (do this in CRM) |
| Notes, creating, updating and completing tasks, and seeing your own open tasks | Mid-term adjustments (MTAs), vouchers and waivers, and cancellations: you can look at the screens, marked **Preview**, but they do not quote, charge or change anything yet |
| Moving an early-stage application forward | |
| Opening the standard CRM edit screen | |

If you cannot find one of the items in the right-hand column, that is correct.

### Your test records

| What | Record to use |
| --- | --- |
| A member to look up | `<TEST MEMBER NAME>` |
| A new customer to create | `<NEW TEST NAME AND EMAIL YOU CONTROL>` |
| A membership to review | `<TEST MEMBERSHIP RECORD>` |
| An insurance policy to review (any stage) | `<TEST POLICY NUMBER>` |
| A **draft** insurance policy you can change | `<TEST DRAFT POLICY NUMBER>` |
| An accreditation in an early stage you can change | `<TEST ACCREDITATION NUMBER>` |

### How to share what you see

For each step, note whether it did what we said, did it but was confusing or slow, or did not work. A screenshot helps. Your A2Z Cloud contact will go through your notes with you afterwards.

---

## Journey 1: Start your day

*You have just sat down and opened the workspace in CRM.*

1. Open the Staff Workspace from its tab in CRM.
   **Expect:** the workspace loads, the sidebar says **Connected**, and your name shows as the signed-in user. No error messages.
2. Look at the **Overview** page.
   **Expect:** it makes sense at a glance. You can tell what needs attention and where to go next.
3. Look at the left-hand navigation.
   **Expect:** you can see Applications, **My tasks**, Customers, Membership, Insurance, Accreditation and **New application**. There are no technical or test buttons along the top.

**Think about:** Would a new colleague know where to start without being told?

---

## Journey 2: A member calls, find them and see where they stand

*A member rings the office. You need to find them and see their position quickly.*

1. Open **Customers** and look through the list.
   **Expect:** real test records with sensible columns. The list shows 15 at a time and you can move between pages.
2. Use **Search all CRM** to look for your test member by name or reference.
   **Expect:** matching results appear, with a message telling you how many were found and a **Clear CRM search** button.
3. Open the member (click the first cell or the **Open** button).
   **Expect:** you see their details, plus their membership and insurance.
4. From the member, click through to their **membership record**, then use **Previous record or list** to go back.
   **Expect:** you land back on the member you started from, not at the top of the list.

**Think about:** Did you find the member as fast as you would in CRM? What did you wish you could see on this page?

---

## Journey 3: Review a policy

*A member asks about their insurance. You need to check the cover and whether anything needs attention.*

1. Open **Insurance** and look at the list.
   **Expect:** policy number, member, status columns, and column headings you can read in full.
2. Scroll to the bottom of the list. If you see **Load next CRM records**, click it.
   **Expect:** more records load and the count at the bottom goes up. When there is nothing more, a message says all records are loaded.
3. Open your test policy.
   **Expect:** you see its cover, current status and any warnings, such as an underwriting stop or a payment that is not recorded as paid.
4. Look through the tabs and sections on the policy: **Details**, **Related lists** (for example Notes and Attachments) and **Timeline**.
   **Expect:** everything opens without errors. Near the top of the record, **Latest activity** shows the last few things that happened. The **Timeline** tab lists everything, newest first, grouped by day, with who did it and what changed. Use the filters to see only **Emails**, **Automatic** changes, **Notes and tasks** or **Field changes**. Emails and automations that CRM ran are labelled.
5. Look at the fields **Payment Status**, **Policy Status**, **Document Status** and **Manual Review Outcome**.
   **Expect:** these are shown as plain text. You cannot change them here.

**Think about:** Is it clear what is wrong with a policy that needs attention? Are the warnings in words you would use?

---

## Journey 4: Leave a note and manage a follow-up

*You have spoken to the member. Record it, log a follow-up, then find it, update it and close it.*

1. On your **draft test policy**, click **Add note**. Type a short note such as "Spoke to member about cover, will call back" and save.
   **Expect:** the message **Note saved.** appears.
2. Click **Create task**. Give it a subject such as "Call member back" and a due date, then save.
   **Expect:** the message **Task created.** appears.
3. Open the **Notes** and **Open activities** lists on that record.
   **Expect:** your note shows its title and text. Your task shows its subject, type, status and due date.
4. Open **My tasks** in the left-hand navigation.
   **Expect:** a list of the open tasks assigned to you, soonest due first, 15 to a page. Your new task is in it, showing what it is about, its status, priority and due date. Overdue and due-today tasks are marked. Completed tasks are not listed.
5. Click your task's name.
   **Expect:** the task opens inside the workspace, showing what it is related to, the contact, the owner, the due date and its description.
6. Click the **Related to** link.
   **Expect:** the record the task is about opens in the workspace, and **Previous record or list** brings you back to the task.
7. Change the **Due date** or **Priority** and click **Save changes**.
   **Expect:** "Task saved in CRM." Check the same task in CRM to see the change.
8. Click **Mark complete**.
   **Expect:** you are asked to confirm. After you confirm, the task is set to Completed in CRM and disappears from your list.

**Think about:** Is "My tasks" what you would look at first thing in the morning? What else would you want to see or filter by? Would you trust this enough to use it every day?

---

## Journey 5: Move an application forward

*A draft application is ready to progress. Update its status safely.*

1. Open your **draft test policy**.
2. Find **Application Status**. This is the one status you can change here, and only while the policy is at an early stage.
   **Expect:** a drop-down showing sensible options only.
3. Choose **In Progress**.
   **Expect:** you are asked to confirm before anything is saved.
4. Confirm, then check the new status in the workspace and in standard CRM.
   **Expect:** the status has changed and any automatic steps in CRM (such as emails or tasks) behave as you would expect. Tell us what they were.
5. Change it back to **Draft** if you want to repeat the test.
6. Open a policy that is **Awaiting Payment** or **Completed**.
   **Expect:** Application Status is plain text. You cannot change it.
7. Open your **test accreditation** and change its **Application Stage**.
   **Expect:** the same behaviour: sensible options, a confirmation, and the change shows in CRM.

**Think about:** Did the confirmation wording make it clear what would happen? Was anything you needed to change missing?

---

## Journey 6: Something needs a full edit

*You need to change a detail the workspace does not edit, such as an address.*

1. On any record, click **Edit in CRM**.
   **Expect:** a message asks **Leave the workspace to edit?** It explains that you will leave the workspace and come back to the Overview afterwards.
2. Click **Stay here**.
   **Expect:** nothing happens and you remain on the record.
3. Click **Edit in CRM** again, then **Continue to CRM**.
   **Expect:** the standard CRM edit form for the same record opens.
4. Click **Cancel** on the CRM form without saving.
   **Expect:** you return to the workspace Overview, as the message said.

**Think about:** Was the message clear? Would you rather the workspace took you back to the record?

---

## Journey 7: Read the records and tell us how you would use them

*No script for this one. Use the workspace the way you would on a normal day, and talk us through it.*

1. Pick **three records of different types** (for example a member, a membership and an insurance policy). Spend a couple of minutes on each.
2. For each record, tell us in your own words:
   - What is this record telling you?
   - What is the first thing you would want to know, and was it easy to find?
   - Is there anything you do not understand, such as a label, a status, a colour or a warning?
   - Is there anything you can see that you would never use, or anything missing?
3. Think of a **real situation** from your last week at work, such as a call, a query or a case you were chasing. Try to handle it using the workspace. Where did you get stuck or reach for CRM instead?
4. If your users have saved CRM views, try choosing one on the Insurance or Accreditation list and tell us whether it matches the same view in CRM.
5. Tell us what you would change on each page if you could change one thing.

**Think about:** Would you use this instead of CRM, alongside it, or not at all, and why?

---

## Journey 8: Take a new customer and a new application through to payment

*A new customer wants to join and take out cover. Create them, take the application, carry on from a draft, take payment, and find the records.*

1. Open **Customers** and click **New customer**. Enter a first name, surname and a new email address (use a test address you control), then click **Create customer**.
   **Expect:** The customer is created in CRM and their record opens in the workspace, with the message "Customer created in CRM."
2. Click **New customer** again and use the same email address.
   **Expect:** You are told a customer with that email already exists, and you can choose **Open existing customer** instead of creating a duplicate.
3. Open **New application** and choose **Membership and Insurance**. Search for the customer you just created and select them.
   **Expect:** The customer is confirmed at the top of the application, and the steps for the application appear.
4. Work through the questions, answering as a real customer would. Use **Next** and **Back** to move between steps.
   **Expect:** The questions flow in a sensible order, only relevant questions appear, and you cannot skip required answers. The **Price summary** on the right updates as you go.
5. Look at **Documents and links** under the price summary, before and after you ask for insurance.
   **Expect:** Links to the Terms of Business, Privacy Policy and Code of Ethics are shown and open the Guild's pages. When insurance is requested, the list of policy documents that come with the chosen cover appears, and it changes if you change the cover.
6. For a customer who already has a membership, look at **Existing membership** near the top of the application.
   **Expect:** You choose the membership from a list of that customer's memberships. You are never asked to type an ID. **See what is available** shows what can be renewed or upgraded in plain language.
7. Click **Save to CRM**, then leave the application by opening **Insurance** and the draft policy it created.
   **Expect:** "CRM draft saved." appears. On the draft policy, a **Continue application** button is shown.
8. Click **Continue application**.
   **Expect:** The application reopens at the step where you stopped, with your answers still filled in. You can also reach drafts with **Find saved drafts for this customer**, which lists each draft by type and when it was saved.
9. Calculate the quote.
   **Expect:** The Price summary shows a verified quote with the amount and any payment plan.
10. Confirm the customer has accepted the terms, then click **Create payment link** and confirm.
   **Expect:** A secure payment link is created and can be opened or copied.
11. Open the payment page and pay using the test card details your A2Z Cloud contact gives you. Then come back and refresh the payment status.
   **Expect:** Payment completes, and the record in CRM shows Payment Status as Paid.
12. Under **Go to the records**, click **Open the application record**, then go back and click **Open the customer record**.
   **Expect:** Each opens inside the workspace, showing the new purchase, its status and its Timeline, and you can get back to the application.
13. Start an **Accreditation** application for a customer, complete it, click **Save to CRM**, then **Submit saved Accreditation application**.
   **Expect:** You are asked to confirm before it is submitted. A message confirms it, and **Open the application record** takes you to the new accreditation.

**Think about:** Did the questions make sense in the order you would ask them on the phone? Could you always find your way back to the draft, the customer and the new records?

---

## Journey 9: Look at the screens that are coming next

*These screens are marked **Preview**. They show how mid-term adjustments, vouchers and cancellations will look. Nothing is quoted, charged, saved or cancelled.*

1. Open an insurance policy and click **Manage changes (MTA)**.
   **Expect:** A change screen opens with a **Preview** banner. It has steps for the current policy, the change, the quote and payment.
2. Move through the steps, then click **Calculate live quote**.
   **Expect:** The screen says it is a preview. No quote is asked for and nothing is saved.
3. Open a membership and click **Voucher / waiver**.
   **Expect:** The voucher and waiver screen opens with a **Preview** banner, and nothing is applied.
4. On the membership, click **Cancellation / downgrade quote**.
   **Expect:** A cancellation screen opens with a **Preview** banner and four steps. You can look at each step. Pressing **Calculate refund quote** says it is a preview and does nothing.

**Think about:** Is this the information and the order you would want when you take a change or a cancellation from a customer? What is missing?

---

## Journey 10: Generate documents for a customer

*The customer needs a letter, certificate or schedule. Produce it from the right record, edit it, and send or store it.*

1. Open a customer and click **Generate documents**.
   **Expect:** A window lists the customer, then their memberships, membership purchases, insurance policies and accreditations, so you can choose what the document is for.
2. Choose an insurance policy and click **Open Mail Merge in CRM**.
   **Expect:** CRM opens in a new tab on that policy. Open the Zoho Writer add-on there and select a template from the list.
3. Change any text you need in the merged document, then download it.
   **Expect:** The template opens in Writer, in another tab, ready to merge. You can change the text, merge it and download the file.
4. Email the downloaded file to the customer, and/or upload it to the record's WorkDrive folder.
   **Expect:** The file reaches the customer and/or is stored in the right WorkDrive folder. If the record has a WorkDrive link, **Open WorkDrive folder** appears in the window and opens it in a new tab.
5. Go back to the window and choose a membership or accreditation, then repeat.
   **Expect:** You can generate documents for any of the customer's records without leaving the workspace.

**Think about:** Is it clear which record to choose? Are the templates you need available, and is the WorkDrive step quick enough?

---

## Final check: what should not be possible

Before you finish, try each of these. They should all be blocked or missing.

- [ ] Press any button on an MTA, voucher or cancellation screen and see a quote, a payment or a cancellation actually happen.
- [ ] Change **Payment Status** or **Policy Status** from the workspace.

If any of them works, please tell us straight away.

---
