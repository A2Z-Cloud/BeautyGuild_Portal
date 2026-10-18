'use strict';
const { HttpError } = require('./errors');

const UPSTREAM_TIMEOUT_MS = 10000;
const CACHE_MS = 5 * 60 * 1000;
const COURSE_FIELDS = [
  'Name', 'Status', 'Course_Type', 'Duration', 'CPD_Points',
  'Member_Price', 'Non_Member_Price', 'Course_Category', 'Treatment_Group', 'Entry_Requirements',
];
const CRITERIA = '((Status:equals:Active)and(Course_Type:equals:GTI))';

function mapCourse(c) {
  return {
    id: c.id,
    name: c.Name,
    category: c.Course_Category || null,
    treatmentGroup: c.Treatment_Group || null,
    courseType: c.Course_Type || null,
    duration: c.Duration || null,
    cpdPoints: c.CPD_Points ?? null,
    memberPrice: c.Member_Price ?? null,
    nonMemberPrice: c.Non_Member_Price ?? null,
    entryRequirements: c.Entry_Requirements || null,
  };
}

// getCrmHeaders(req) resolves Authorization headers from the project's Catalyst Connection.
function createCourses({ config, getCrmHeaders, fetchImpl = fetch, now = Date.now, log = console.log }) {
  let cache = null;
  return Object.freeze({
    async listActiveGti(req) {
      if (cache && now() - cache.at < CACHE_MS) return cache.courses;
      let crmRes;
      try {
        const headers = await getCrmHeaders(req);
        const url = `${config.crmApiDomain}/crm/v3/Courses/search?criteria=${encodeURIComponent(CRITERIA)}&fields=${COURSE_FIELDS.join(',')}`;
        crmRes = await fetchImpl(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      } catch (err) {
        log('CRM courses request failed', err && err.name, err && err.message);
        throw new HttpError(502, 'COURSES_UNAVAILABLE', 'Courses are unavailable.');
      }
      let courses;
      if (crmRes.status === 204) {
        courses = [];
      } else if (!crmRes.ok) {
        log('CRM courses search failed', crmRes.status);
        throw new HttpError(502, 'COURSES_UNAVAILABLE', 'Courses are unavailable.');
      } else {
        const body = await crmRes.json().catch(() => null);
        if (!body || !Array.isArray(body.data)) throw new HttpError(502, 'COURSES_UNAVAILABLE', 'Courses are unavailable.');
        courses = body.data.map(mapCourse);
      }
      cache = { at: now(), courses };
      return courses;
    },
  });
}

module.exports = { createCourses, mapCourse };
