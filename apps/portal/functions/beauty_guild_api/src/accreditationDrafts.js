'use strict';
// Accreditation application: the V1 record set, with the same fields. No new CRM fields.
// A draft is the real set of CRM records V1 writes (Account, Training_Centres, Training_Centre_Accred at stage Draft,
// Accreditation_Centre_Link, TC_Course_Offering) and the applicant's phone and address on the Contact. Nothing is kept
// in a Note and Journey_ID is not used. Resume re-reads those records. The Contact comes from the verified email
// (resolveContact) and every record is checked against it; record ids sent by the browser are only ever hints that are
// fetched and verified, never trusted.
const crypto = require('node:crypto');
const {HttpError} = require('./errors');

const CRMID = /^\d{10,25}$/;
const DRAFT = 'Draft';
const AWAITING = 'Awaiting Payment';
const STANDARD = 'Standard Accreditation Annual';
const INTERNATIONAL = 'International Accreditation Annual';
const UK = new Set(['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland']);
const START_WINDOW_DAYS = 30;
const PAID = new Set(['paid', 'succeeded', 'completed', 'payment received']);
const q = v => encodeURIComponent(String(v));
const fail = (code, message, status = 422) => { throw new HttpError(status, code, message); };

const ACC_FIELDS = ['Account', 'Applicant_Contact', 'Application_Stage', 'Accreditation_Level', 'Valid_From', 'Valid_To', 'Number_of_Tutors',
  'Declaration_1_qualified_for_six_months', 'Declaration_2_teaching_qualification', 'Declaration_3_evidence_available',
  'Other_Tutors_Used', 'Tutor_qualification_declaration_question', 'Additional_Centres_Used', 'Terms_Privacy_Accepted',
  'Payment_Status', 'Modified_Time', 'Created_Time'].join(',');
const CENTRE_FIELDS = 'Name,Account,Contact,Email,Phone_Number,Mobile_Phone_Number,Address_Line_1,Address_Line_2,Address_Line_3,Town,County,Country,Postcode';
const CONTACT_FIELDS = 'Salutation,First_Name,Last_Name,Email,Phone,Mobile,Interests,Correspondence_Address_Line_1,Correspondence_Address_Line_2,Correspondence_Address_Line_3,Correspondence_Town,Correspondence_County,Correspondence_Postcode,Correspondence_Country';

const isUk = country => UK.has(String(country || '').trim().toLowerCase());
// The accreditation applies to the training centre, so its country (not the applicant's home address) decides the level.
const levelFor = country => (country && !isUk(country) ? INTERNATIONAL : STANDARD);
const normCountry = country => (isUk(country) ? 'United Kingdom' : country);
const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
// A one-year period runs to the day before the anniversary of its start date.
function annualPeriodEnd(startIso) {
  const d = new Date(startIso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const placeholderName = contactId => 'Draft application - ' + contactId;
const stripPlaceholder = name => (name && /^Draft application - /.test(name) ? null : name || null);
const yesNo = v => (v === true || v === 'Yes' || v === 'yes' ? 'Yes' : v === false || v === 'No' || v === 'no' ? 'No' : undefined);
const fromYesNo = v => (v === 'Yes' || v === true ? 'yes' : v === 'No' || v === false ? 'no' : '');

function str(value, max = 255) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') fail('INVALID_ANSWERS', 'One of your answers is not valid.');
  // eslint-disable-next-line no-control-regex
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) fail('INVALID_ANSWERS', 'One of your answers is too long.');
  return s;
}
const flag = v => (v === 'yes' || v === true ? true : v === 'no' || v === false ? false : null);

// Reads the journey answers into one tidy shape. `final` adds the rules for submitting.
function readAnswers(a, {final = false, now = Date.now()} = {}) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) fail('INVALID_ANSWERS', 'Application answers are missing.');
  const country = a.country === 'Other' ? str(a.countryOther, 80) : str(a.country, 80);
  const contactCountry = a.contactCountry === 'Other' ? str(a.contactCountryOther, 80) : str(a.contactCountry, 80);
  const courseIds = Array.isArray(a.courseIds) ? a.courseIds.map(x => String(x)) : [];
  if (courseIds.length > 150 || courseIds.some(x => !CRMID.test(x))) fail('INVALID_COURSE', 'One of the selected courses is not valid.');
  const startDate = str(a.startDate, 10) || todayIso(now);
  const earliest = todayIso(now), latest = todayIso(now + START_WINDOW_DAYS * 864e5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)) || startDate < earliest || startDate > latest) {
    fail('INVALID_START_DATE', 'Choose a start date between today and one month from today.');
  }
  const otherTutors = flag(a.otherTutors);
  let tutorCount;
  if (otherTutors && a.tutorCount !== undefined && a.tutorCount !== '') {
    tutorCount = Number(a.tutorCount);
    if (!Number.isInteger(tutorCount) || tutorCount < 0 || tutorCount > 500) fail('INVALID_ANSWERS', 'Enter the number of tutors as a whole number.');
  }
  const m = {
    phone: str(a.phone, 40), mobile: str(a.mobile, 40),
    address: {l1: str(a.address1), l2: str(a.address2), l3: str(a.address3), town: str(a.town), county: str(a.county), postcode: str(a.postcode, 20), country: contactCountry},
    school: {name: str(a.centre, 100), email: str(a.centreEmail), phone: str(a.centrePhone, 40), mobile: str(a.centreMobile, 40),
      l1: str(a.centreAddress1), l2: str(a.centreAddress2), l3: str(a.centreAddress3), town: str(a.centreTown), county: str(a.centreCounty),
      postcode: str(a.centrePostcode, 20), country},
    declarations: [flag(a.qualifiedSixMonths), flag(a.teachingQualification), flag(a.evidenceAvailable)],
    otherTutors, tutorQualified: flag(a.tutorQualified), tutorCount, otherVenues: flag(a.additionalVenues),
    termsAccepted: a.terms === true || a.terms === 'true' ? true : a.terms === false ? false : null,
    courseIds: [...new Set(courseIds)], startDate,
  };
  if (m.school.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.school.email)) fail('INVALID_EMAIL', 'Enter a valid centre email address.');
  if (final) {
    const s = m.school;
    if (!s.name) fail('CENTRE_REQUIRED', 'Enter your training school name.');
    if (!s.country) fail('CENTRE_REQUIRED', 'Choose your training centre country.');
    if (!s.l1 || !s.town) fail('CENTRE_REQUIRED', 'Enter your training centre address.');
    if (isUk(s.country) && !s.postcode) fail('CENTRE_REQUIRED', 'Enter your training centre postcode.');
    if (m.declarations.some(v => v !== true)) fail('DECLARATIONS_REQUIRED', 'All three declarations must be confirmed to apply for accreditation.');
    if (m.termsAccepted !== true) fail('TERMS_REQUIRED', 'Accept the application terms to continue.');
    if (!m.courseIds.length) fail('COURSES_REQUIRED', 'Choose at least one GTi course.');
    if (m.otherTutors === null || m.otherVenues === null) fail('TUTORS_REQUIRED', 'Answer the tutor and venue questions.');
  }
  return m;
}

function createAccreditation({request, listCourses, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), retryDelayMs = 1500}) {
  let stagesChecked = 0;
  const data = r => (Array.isArray(r?.data) ? r.data : []);
  // CRM search lags real writes by up to about 30 seconds; a fetch by id does not. Retry only on an empty result.
  async function searchWithRetry(req, path, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      const rows = data(await request(req, 'GET', path));
      if (rows.length || i === attempts - 1) return rows;
      await sleep(retryDelayMs);
    }
    return [];
  }
  const search = async (req, path) => data(await request(req, 'GET', path));
  async function get(req, module, id, fields) {
    if (!CRMID.test(String(id))) return null;
    return data(await request(req, 'GET', module + '/' + id + '?fields=' + q(fields)))[0] || null;
  }
  async function create(req, module, record) {
    const out = await request(req, 'POST', module, {data: [record]});
    const id = out.data?.[0]?.details?.id;
    if (out.data?.[0]?.status !== 'success' || !id) fail('CREATE_UNCONFIRMED', 'CRM did not confirm the save.', 502);
    return String(id);
  }
  async function update(req, module, id, record) {
    const out = await request(req, 'PUT', module + '/' + id, {data: [record]});
    if (out.data?.[0]?.status !== 'success') fail('SAVE_INCOMPLETE', 'CRM did not confirm the save.', 502);
  }
  async function remove(req, module, ids) {
    if (!ids.length) return;
    const out = await request(req, 'DELETE', module + '?ids=' + q(ids.join(',')));
    const failed = (Array.isArray(out.data) ? out.data : []).filter(r => r.status !== 'success' && r.code !== 'RECORD_DOES_NOT_EXIST');
    if (failed.length) fail('DELETE_UNCONFIRMED', 'CRM did not confirm discard.', 502);
  }
  // Fail closed unless the CRM stage list has the two stages this journey writes.
  async function ensureStages(req) {
    if (stagesChecked && now() - stagesChecked < 300000) return;
    const out = await request(req, 'GET', 'settings/fields?module=Training_Centre_Accred');
    const stage = (out.fields || []).find(f => f.api_name === 'Application_Stage');
    const values = (stage?.pick_list_values || []).map(x => x.actual_value || x.display_value);
    if (!values.includes(DRAFT) || !values.includes(AWAITING)) fail('STAGE_NOT_READY', 'CRM accreditation stages are not configured.', 503);
    stagesChecked = now();
  }
  async function getOwned(req, id, person, {requireDraft = false} = {}) {
    const row = await get(req, 'Training_Centre_Accred', id, ACC_FIELDS);
    if (!row?.id || String(row.Applicant_Contact?.id) !== String(person.id)) fail('NOT_FOUND', 'Application not found.', 404);
    if (requireDraft && row.Application_Stage !== DRAFT) fail('NOT_DRAFT', 'This application can no longer be edited.', 409);
    return row;
  }
  const ownedCentre = (centre, person, accountId) => Boolean(centre?.id) && String(centre.Contact?.id) === String(person.id)
    && (!accountId || String(centre.Account?.id) === String(accountId));
  // Finds the main-centre link and training centre of an accreditation. Hints from the browser are fetched and checked first.
  async function findRelated(req, acc, person, hints = {}) {
    const accountId = acc.Account?.id;
    let link = null, centre = null;
    if (hints.linkId) {
      const row = await get(req, 'Accreditation_Centre_Link', hints.linkId, 'Name,Accreditation,Training_Centre,Centre_Relationship_Type');
      if (row && String(row.Accreditation?.id) === String(acc.id) && row.Centre_Relationship_Type === 'Main Centre') link = row;
    }
    if (!link) {
      const rows = await searchWithRetry(req, 'Accreditation_Centre_Link/search?criteria=' + q('((Accreditation:equals:' + acc.id + ')and(Centre_Relationship_Type:equals:Main Centre))') + '&fields=' + q('Name,Accreditation,Training_Centre,Centre_Relationship_Type'));
      link = rows.find(r => String(r.Accreditation?.id) === String(acc.id)) || null;
    }
    const centreId = link?.Training_Centre?.id || hints.centreId;
    if (centreId) {
      centre = await get(req, 'Training_Centres', centreId, CENTRE_FIELDS);
      if (centre && !ownedCentre(centre, person, accountId)) fail('RECORD_MISMATCH', 'This application needs the Guild to review it.', 409);
    }
    // A save that stopped after the centre was created but before the link: find the centre through the Account.
    if (!centre && accountId) {
      const rows = await searchWithRetry(req, 'Training_Centres/search?criteria=' + q('(Account:equals:' + accountId + ')') + '&fields=' + q(CENTRE_FIELDS));
      centre = rows.find(r => ownedCentre(r, person, accountId)) || null;
    }
    return {link, centre};
  }
  async function verifyCourses(req, ids) {
    if (!ids.length) return;
    const known = new Set((await listCourses(req)).map(c => String(c.id)));
    if (ids.some(id => !known.has(id))) fail('INVALID_COURSE', 'One of the selected courses is not available.');
  }
  async function writeContact(req, person, m) {
    const record = {
      Phone: m.phone || undefined, Mobile: m.mobile || undefined,
      Correspondence_Address_Line_1: m.address.l1 || undefined, Correspondence_Address_Line_2: m.address.l2 || undefined,
      Correspondence_Address_Line_3: m.address.l3 || undefined, Correspondence_Postcode: m.address.postcode || undefined,
      Correspondence_Town: m.address.town || undefined, Correspondence_County: m.address.county || undefined,
      Correspondence_Country: normCountry(m.address.country) || undefined,
    };
    if (Object.values(record).some(Boolean)) await update(req, 'Contacts', person.id, record);
  }
  function centreRecord(m, person, accountId, isNew) {
    const s = m.school;
    // On an update, an emptied field is cleared (null); on create it is simply left out.
    const v = x => (x || (isNew ? undefined : null));
    return {
      Name: s.name || placeholderName(person.id), Account: {id: accountId}, Contact: {id: person.id},
      Email: v(s.email), Phone_Number: v(s.phone), Mobile_Phone_Number: v(s.mobile),
      Address_Line_1: v(s.l1), Address_Line_2: v(s.l2), Address_Line_3: v(s.l3), Town: v(s.town), County: v(s.county),
      Country: v(normCountry(s.country)), Postcode: v(s.postcode),
      ...(isNew ? {Centre_Status: 'Unverified'} : {}),
    };
  }
  function accRecord(m, person, accountId, isNew) {
    const [d1, d2, d3] = m.declarations;
    return {
      Applicant_Contact: {id: person.id}, Account: {id: accountId}, Accreditation_Level: levelFor(m.school.country),
      Accreditation_Status: isNew ? 'Unverified' : undefined,
      Valid_From: m.startDate, Valid_To: annualPeriodEnd(m.startDate),
      Declaration_1_qualified_for_six_months: yesNo(d1), Declaration_2_teaching_qualification: yesNo(d2), Declaration_3_evidence_available: yesNo(d3),
      Other_Tutors_Used: m.otherTutors === null ? undefined : m.otherTutors,
      Tutor_qualification_declaration_question: m.otherTutors ? yesNo(m.tutorQualified) : undefined,
      Number_of_Tutors: m.otherTutors && m.tutorCount ? m.tutorCount : undefined,
      Additional_Centres_Used: yesNo(m.otherVenues),
      Terms_Privacy_Accepted: m.termsAccepted === null ? undefined : m.termsAccepted,
      ...(isNew ? {Payment_Status: 'Not Paid'} : {}),
    };
  }
  // Keeps one TC_Course_Offering per selected course. Pending offerings the applicant has since unselected are removed.
  async function syncCourses(req, m, accId, centreId, linkId, validTo, isNewAcc) {
    const name = (m.school.name || 'Draft application') + ' - Course Offering';
    let existing = [];
    if (!isNewAcc) {
      const path = 'TC_Course_Offering/search?criteria=' + q('((Accreditation:equals:' + accId + ')and(Training_Centre:equals:' + centreId + '))') + '&fields=' + q('Course,Offering_Status');
      existing = await search(req, path);
      if (!existing.length && m.courseIds.length) existing = await searchWithRetry(req, path);
    }
    const have = new Set(existing.map(r => String(r.Course?.id)).filter(Boolean));
    const want = new Set(m.courseIds);
    for (const id of m.courseIds) {
      if (have.has(id)) continue;
      await create(req, 'TC_Course_Offering', {Name: name, Course: {id}, Training_Centre: {id: centreId}, Accreditation: {id: accId},
        Accreditation_Centre_Link: {id: linkId}, Offering_Status: 'Pending Review', Valid_From: m.startDate, Valid_To: validTo});
    }
    const stale = existing.filter(r => r.Course?.id && !want.has(String(r.Course.id)) && (!r.Offering_Status || r.Offering_Status === 'Pending Review')).map(r => String(r.id));
    await remove(req, 'TC_Course_Offering', stale);
  }
  // One path for save and submit. The stage only moves to Awaiting Payment once every related record is written.
  async function persist(req, person, m, acc, hints, {submit}) {
    const validTo = annualPeriodEnd(m.startDate);
    await writeContact(req, person, m);
    let accountId = acc?.Account?.id;
    const schoolName = m.school.name;
    if (!accountId) accountId = await create(req, 'Accounts', {Account_Name: schoolName || placeholderName(person.id)});
    else if (schoolName && acc.Account?.name === placeholderName(person.id)) {
      // Only the placeholder this journey created is ever renamed, never a school's real Account.
      await update(req, 'Accounts', accountId, {Account_Name: schoolName});
    }
    const related = acc ? await findRelated(req, acc, person, hints) : {link: null, centre: null};
    let centreId = related.centre?.id;
    if (centreId) await update(req, 'Training_Centres', centreId, centreRecord(m, person, accountId, false));
    else centreId = await create(req, 'Training_Centres', centreRecord(m, person, accountId, true));
    const isNew = !acc;
    let accId = acc?.id;
    const record = accRecord(m, person, accountId, isNew);
    if (isNew) accId = await create(req, 'Training_Centre_Accred', {...record, Application_Stage: DRAFT});
    else await update(req, 'Training_Centre_Accred', accId, record);
    const linkName = (schoolName || placeholderName(person.id)) + ' - Main Centre';
    let linkId = related.link?.id;
    if (linkId) {
      if (related.link.Name !== linkName) await update(req, 'Accreditation_Centre_Link', linkId, {Name: linkName});
    } else {
      linkId = await create(req, 'Accreditation_Centre_Link', {Name: linkName, Accreditation: {id: accId}, Training_Centre: {id: centreId},
        Centre_Relationship_Type: 'Main Centre', Start_Date: m.startDate, End_Date: validTo});
    }
    await syncCourses(req, m, accId, centreId, linkId, validTo, isNew);
    if (submit) {
      await update(req, 'Training_Centre_Accred', accId, {Application_Stage: AWAITING, Terms_Accepted_Date: new Date(now()).toISOString().split('.')[0] + '+00:00',
        Purchase_Type: 'New Accreditation', Application_Source: 'Portal', Payment_Status: 'Not Paid'});
    }
    return {id: String(accId), accountId: String(accountId), centreId: String(centreId), linkId: String(linkId), validFrom: m.startDate, validTo,
      level: levelFor(m.school.country), schoolName: stripPlaceholder(schoolName)};
  }

  return {
    async save(req, body, person, existingId) {
      await ensureStages(req);
      const m = readAnswers(body.answers, {now: now()});
      await verifyCourses(req, m.courseIds);
      const acc = existingId ? await getOwned(req, existingId, person, {requireDraft: true}) : null;
      const out = await persist(req, person, m, acc, body.related || {}, {submit: false});
      return {id: out.id, service: 'accreditation', journeyId: body.journeyId, revision: 1, step: body.step, savedAt: new Date(now()).toISOString(),
        answers: body.answers, related: {centreId: out.centreId, linkId: out.linkId}};
    },
    async submit(req, body, person, existingId) {
      await ensureStages(req);
      const acc = existingId ? await getOwned(req, existingId, person) : null;
      if (acc && acc.Application_Stage !== DRAFT) {
        // A retry after a successful submit, or a return to pay: nothing is written again.
        if (acc.Application_Stage === AWAITING && !PAID.has(String(acc.Payment_Status || '').toLowerCase())) return {accreditation: summary(acc)};
        fail('NOT_DRAFT', 'This application can no longer be edited.', 409);
      }
      const m = readAnswers(body.answers, {final: true, now: now()});
      await verifyCourses(req, m.courseIds);
      const out = await persist(req, person, m, acc, body.related || {}, {submit: true});
      return {accreditation: {id: out.id, level: out.level, international: out.level === INTERNATIONAL, applicationStage: AWAITING,
        validFrom: out.validFrom, validTo: out.validTo, schoolName: out.schoolName}};
    },
    async read(req, id, person) {
      const acc = await getOwned(req, id, person);
      if (acc.Application_Stage !== DRAFT) fail('NOT_DRAFT', 'This application can no longer be edited.', 409);
      const {link, centre} = await findRelated(req, acc, person);
      const offerings = await searchWithRetry(req, 'TC_Course_Offering/search?criteria=' + q('(Accreditation:equals:' + acc.id + ')') + '&fields=Course', 2);
      const contact = await get(req, 'Contacts', person.id, CONTACT_FIELDS);
      const answers = {...contactAnswers(contact),
        centre: stripPlaceholder(centre?.Name) || '', country: centre?.Country || '', centreEmail: centre?.Email || '', centrePhone: centre?.Phone_Number || '',
        centreMobile: centre?.Mobile_Phone_Number || '', centreAddress1: centre?.Address_Line_1 || '', centreAddress2: centre?.Address_Line_2 || '',
        centreAddress3: centre?.Address_Line_3 || '', centreTown: centre?.Town || '', centreCounty: centre?.County || '', centrePostcode: centre?.Postcode || '',
        qualifiedSixMonths: fromYesNo(acc.Declaration_1_qualified_for_six_months), teachingQualification: fromYesNo(acc.Declaration_2_teaching_qualification),
        evidenceAvailable: fromYesNo(acc.Declaration_3_evidence_available), otherTutors: fromYesNo(acc.Other_Tutors_Used),
        tutorQualified: fromYesNo(acc.Tutor_qualification_declaration_question), tutorCount: acc.Number_of_Tutors ?? '',
        additionalVenues: fromYesNo(acc.Additional_Centres_Used), terms: acc.Terms_Privacy_Accepted === true,
        courseIds: offerings.map(o => String(o.Course?.id)).filter(Boolean), startDate: acc.Valid_From || ''};
      return {id: String(acc.id), service: 'accreditation', journeyId: crypto.randomUUID(), revision: 1, step: 0, savedAt: acc.Modified_Time || acc.Created_Time || null,
        answers, related: {centreId: centre?.id ? String(centre.id) : null, linkId: link?.id ? String(link.id) : null}};
    },
    async discard(req, id, person) {
      const acc = await getOwned(req, id, person, {requireDraft: true});
      const offerings = await search(req, 'TC_Course_Offering/search?criteria=' + q('(Accreditation:equals:' + acc.id + ')') + '&fields=Course');
      await remove(req, 'TC_Course_Offering', offerings.map(o => String(o.id)).filter(i => CRMID.test(i)));
      const links = await search(req, 'Accreditation_Centre_Link/search?criteria=' + q('(Accreditation:equals:' + acc.id + ')') + '&fields=Name');
      await remove(req, 'Accreditation_Centre_Link', links.map(l => String(l.id)).filter(i => CRMID.test(i)));
      // The Account and Training Centre are left alone: they may be shared records. Only this application's own rows go.
      await remove(req, 'Training_Centre_Accred', [String(acc.id)]);
    },
    async list(req, person) {
      const rows = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await search(req, 'Training_Centre_Accred/search?criteria=' + q('((Applicant_Contact:equals:' + person.id + ')and(Application_Stage:equals:' + DRAFT + '))')
          + '&fields=' + q('Account,Applicant_Contact,Application_Stage,Modified_Time,Created_Time') + '&page=' + page + '&per_page=200');
        rows.push(...batch);
        if (batch.length < 200) break;
        if (page === 10) fail('DRAFT_LIST_LIMIT', 'Too many drafts to list safely.', 503);
      }
      return rows.filter(r => String(r.Applicant_Contact?.id) === String(person.id) && r.Application_Stage === DRAFT).map(r => ({
        id: String(r.id), service: 'accreditation', journeyId: null, step: 0, updatedAt: r.Modified_Time || r.Created_Time || null,
        title: stripPlaceholder(r.Account?.name), status: 'Draft'}));
    },
    async prefill(req, person) {
      return contactAnswers(await get(req, 'Contacts', person.id, CONTACT_FIELDS));
    },
  };
}

function summary(acc) {
  return {id: String(acc.id), level: acc.Accreditation_Level, international: acc.Accreditation_Level === INTERNATIONAL, applicationStage: acc.Application_Stage,
    validFrom: acc.Valid_From || null, validTo: acc.Valid_To || null, schoolName: stripPlaceholder(acc.Account?.name)};
}
// The applicant's details as held on the CRM Contact (also used to prefill a new application).
function contactAnswers(c) {
  const v = x => (x === undefined || x === null ? '' : String(x));
  return {title: v(c?.Salutation), firstName: v(c?.First_Name), lastName: v(c?.Last_Name), email: v(c?.Email), phone: v(c?.Phone), mobile: v(c?.Mobile),
    address1: v(c?.Correspondence_Address_Line_1), address2: v(c?.Correspondence_Address_Line_2), address3: v(c?.Correspondence_Address_Line_3),
    town: v(c?.Correspondence_Town), county: v(c?.Correspondence_County), postcode: v(c?.Correspondence_Postcode), contactCountry: v(c?.Correspondence_Country)};
}

module.exports = {createAccreditation, readAnswers, annualPeriodEnd, levelFor, isUk, stripPlaceholder, START_WINDOW_DAYS};
