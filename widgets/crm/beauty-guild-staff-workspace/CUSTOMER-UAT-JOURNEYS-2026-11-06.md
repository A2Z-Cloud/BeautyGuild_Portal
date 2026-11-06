# Staff Workspace: customer user acceptance testing

Welcome, and thank you for helping us test the Staff Workspace.

The workspace is a single screen inside Zoho CRM where your team can find a member, check their membership and insurance, add notes and tasks, and move an application forward, without hunting through lots of CRM tabs.

## How this test works

Instead of a list of buttons to press, you will follow **seven short journeys**. Each one is a realistic piece of a working day. Work through them in order the first time, because later journeys build on earlier ones.

- Allow about **60 to 90 minutes** in total. Journeys are 5 to 15 minutes each.
- Use the **test records** we give you (listed below). Please do not use live member records.
- Do not worry about breaking anything. If something looks wrong or confusing, that is exactly what we want to hear about.
- This is as much about **how you would really use the workspace** as whether it works. Say out loud what you expect before you click, what you wish was there, and what you would do differently. There are no wrong answers.

### What is in this test, and what is not

| In this test | Not in this test (coming later) |
| --- | --- |
| Finding and reviewing members, membership, insurance and accreditation records | Reassigning tasks, or seeing other people's tasks (do this in CRM) |
| Notes, creating, updating and completing tasks, and seeing your own open tasks | Mid-term adjustments (MTAs) |
| Moving an early-stage application forward | Vouchers |
| Opening the standard CRM edit screen | Cancellations, renewals and upgrades |

If you cannot find one of the items in the right-hand column, that is correct.

### Your test records

| What | Record to use |
| --- | --- |
| A member to look up | `<TEST MEMBER NAME>` |
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

## Final check: what should not be possible

Before you finish, try each of these. They should all be blocked or missing.

- [ ] Find a button for MTAs, cancellations, vouchers, renewals or upgrades.
- [ ] Change **Payment Status** or **Policy Status** from the workspace.

If any of them works, please tell us straight away.

---
