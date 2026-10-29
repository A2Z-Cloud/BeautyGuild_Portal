'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { mapInvoice } = require('../src/schoolServices');

const cfg = loadConfig({ PORTAL_SCHOOL_SERVICES_ENABLED: 'true' });
function upstream(url) {
  const str = String(url),
    u = decodeURIComponent(str);
  if (u.includes('Contacts/search')) return { data: [{ id: '101', Email: 'owner@example.test' }] };
  if (u.includes('Training_Centre_Accred/search'))
    return {
      data: [
        {
          id: '301',
          Applicant_Contact: { id: '101' },
          Account: { id: '201', name: 'Grace School' },
          Accreditation_Status: 'Accredited',
          Application_Stage: 'Paid',
          Payment_Status: 'Paid',
        },
      ],
    };
  if (u.includes('Qualifications/search'))
    return {
      data: [
        { id: 'q1', Primary_Accreditation: { id: '301' } },
        { id: 'q2', Primary_Accreditation: { id: '301' } },
        { id: 'q3', Primary_Accreditation: { id: '999' } },
      ],
    };
  if (u.includes('Training_Centre_Accred/301'))
    return {
      data: [
        {
          id: '301',
          Applicant_Contact: { id: '101' },
          Account: { id: '201', name: 'Grace School' },
          Accreditation_Status: 'Accredited',
        },
      ],
    };
  if (u.includes('Training_Centre_Accred/302'))
    return { data: [{ id: '302', Applicant_Contact: { id: 'other' }, Account: { id: '202', name: 'Other School' } }] };
  if (u.includes('Training_Centre_Accred/1011174000000000301'))
    return {
      data: [
        {
          id: '1011174000000000301',
          Applicant_Contact: { id: '101' },
          Account: { id: '201', name: 'Grace School' },
          Accreditation_Status: 'Accredited',
        },
      ],
    };
  if (u.includes('Accreditation_Centre_Link/search'))
    return { data: [{ id: 'link1', Training_Centre: { id: '1011174000000000401' } }] };
  if (u.includes('Training_Centres/1011174000000000401'))
    return {
      data: [
        {
          id: '1011174000000000401',
          Name: 'Grace School',
          Town: 'Derby',
          Contact_Name: 'Jess Owner',
          Website: 'https://glow.test',
          About_the_School: 'A friendly neighbourhood academy.',
          Facebook: 'glowacademy',
          Instagram: '@glowacademy',
          TikTok: '@glowacademy',
          LinkedIn: 'glow-academy',
          School_Image: 'https://paula356.sg-host.com/wp-content/uploads/school.png',
          School_Logo: 'https://paula356.sg-host.com/wp-content/uploads/logo.png',
          Parking: true,
          Free_Wifi: true,
        },
      ],
    };
  if (u.includes('wp-json/wp/v2/training-venue'))
    return [{ link: 'https://paula356.sg-host.com/training-venue/grace-school/' }];
  if (u.includes('Deals/1000000000401')) return { data: [{ id: '1000000000401', Contact_Name: { id: '101' } }] };
  if (u.includes('Deals/1000000000402')) return { data: [{ id: '1000000000402', Contact_Name: { id: 'other' } }] };
  if (u.includes('Membership_Extension/search'))
    return { data: [{ id: '100', Extension_Type: 'Branch', Membership_Branch: 'Nails', Status: 'Active' }] };
  if (u.includes('/creator/'))
    return {
      code: 3000,
      data: [
        {
          ID: '901',
          invoice_number: '123',
          payment_amount: '75.35',
          invoice_status: 'Paid',
          crm_membership_id: '1000000000401',
        },
      ],
    };
  return { data: [] };
}
async function withServer(args, action) {
  const app = createApp({
    config: cfg,
    getCurrentUser: async () => ({ id: 'cat-1', email: 'owner@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer crm' }),
    getCreatorHeaders: async () => ({ Authorization: 'Bearer creator' }),
    fetchImpl: async url => ({ status: 200, ok: true, json: async () => upstream(url) }),
    ...args,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await action(async (path, options) => {
      const response = await fetch(base + path, options);
      return { status: response.status, body: await response.json() };
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
test('invoice mapping follows V1 Creator data fields', () => {
  assert.deepEqual(
    mapInvoice({
      ID: '1',
      invoice_number: '41',
      payment_amount: '80.25',
      invoice_status: 'Paid',
      crm_membership_id: '555',
    }),
    {
      id: '1',
      invoiceNumber: '41',
      type: 'Membership',
      invoiceDate: null,
      dueDate: null,
      paymentDate: null,
      amount: 80.25,
      status: 'Paid',
    },
  );
});
test('requires Catalyst identity before any school or invoice data', async () => {
  await withServer({ getCurrentUser: async () => null }, async call => {
    assert.equal((await call('/portal/management/schools')).status, 401);
    assert.equal((await call('/portal/management/invoices')).status, 401);
  });
});
test('school listing only includes owned accreditations', async () => {
  await withServer({}, async call => {
    const r = await call('/portal/management/schools');
    assert.equal(r.status, 200);
    assert.equal(r.body.schools[0].name, 'Grace School');
  });
});
test('the school profile carries the About/Website/socials/Facilities fields and the image/logo URLs', async () => {
  await withServer({}, async call => {
    const r = await call('/portal/management/schools/1011174000000000301/profile');
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.contactName, 'Jess Owner');
    assert.equal(r.body.profile.website, 'https://glow.test');
    assert.equal(r.body.profile.about, 'A friendly neighbourhood academy.');
    assert.equal(r.body.profile.facebook, 'glowacademy');
    assert.equal(r.body.profile.instagram, '@glowacademy');
    assert.equal(r.body.profile.tiktok, '@glowacademy');
    assert.equal(r.body.profile.linkedIn, 'glow-academy');
    assert.equal(r.body.profile.imageUrl, 'https://paula356.sg-host.com/wp-content/uploads/school.png');
    assert.equal(r.body.profile.logoUrl, 'https://paula356.sg-host.com/wp-content/uploads/logo.png');
    assert.deepEqual(r.body.profile.facilities.sort(), ['freeWifi', 'parking']);
    assert.equal(r.body.profile.wordpressUrl, 'https://paula356.sg-host.com/training-venue/grace-school/');
  });
});
test('the school profile omits the WordPress link when the lookup finds no matching page', async () => {
  const noMatch = u => (String(u).includes('wp-json/wp/v2/training-venue') ? [] : upstream(u));
  await withServer({ fetchImpl: async u => ({ status: 200, ok: true, json: async () => noMatch(u) }) }, async call => {
    const r = await call('/portal/management/schools/1011174000000000301/profile');
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.wordpressUrl, null);
  });
});
test('another Contact cannot open a school by changing its ID', async () => {
  await withServer({}, async call => {
    assert.equal((await call('/portal/management/schools/302/profile')).status, 404);
    assert.equal((await call('/portal/management/schools/abc/profile')).status, 404);
  });
});
test('Creator invoices are scoped using verified Contact id, not a caller-provided id', async () => {
  let url = '';
  await withServer(
    {
      fetchImpl: async u => {
        url = String(u);
        return { status: 200, ok: true, json: async () => upstream(u) };
      },
    },
    async call => {
      let r = await call('/portal/management/invoices?contactId=somebodyelse');
      assert.equal(r.status, 200);
      assert.equal(r.body.invoices[0].amount, 75.35);
      assert.ok(decodeURIComponent(url).includes('crm_contact_id == "101"'));
      assert.ok(!url.includes('somebodyelse'));
    },
  );
});
test('specific membership invoicing requires owner match before calling Creator', async () => {
  await withServer({}, async call => {
    assert.equal((await call('/portal/management/memberships/1000000000402/invoices')).status, 404);
    const r = await call('/portal/management/memberships/1000000000401/invoices');
    assert.equal(r.status, 200);
    assert.equal(r.body.invoices.length, 1);
  });
});
test('invoice routes are disabled unless explicitly configured', async () => {
  await withServer({ config: loadConfig({}) }, async call => {
    assert.equal((await call('/portal/management/invoices')).status, 503);
  });
});

test('qualification and Creator session writes remain disabled unless explicitly authorised', async () => {
  await withServer({}, async call => {
    const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
    assert.equal((await call('/portal/management/schools/301/qualifications', post)).status, 503);
    assert.equal((await call('/portal/management/schools/301/sessions', post)).status, 503);
  });
});
test('an unverified identity cannot invoke school write endpoints even when writes are enabled', async () => {
  await withServer(
    {
      config: loadConfig({ PORTAL_SCHOOL_SERVICES_ENABLED: 'true', PORTAL_SCHOOL_WRITES_ENABLED: 'true' }),
      getCurrentUser: async () => null,
    },
    async call => {
      const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
      assert.equal((await call('/portal/management/schools/301/qualifications', post)).status, 401);
    },
  );
});

test('a verified account with no matching or several matching Contacts cannot see schools', async () => {
  const none = u => (String(u).includes('Contacts/search') ? { data: [] } : upstream(u));
  await withServer({ fetchImpl: async u => ({ status: 200, ok: true, json: async () => none(u) }) }, async call => {
    assert.equal((await call('/portal/management/schools')).status, 404);
  });
  const many = u =>
    String(u).includes('Contacts/search')
      ? {
          data: [
            { id: '101', Email: 'owner@example.test' },
            { id: '102', Email: 'owner@example.test' },
          ],
        }
      : upstream(u);
  await withServer({ fetchImpl: async u => ({ status: 200, ok: true, json: async () => many(u) }) }, async call => {
    assert.equal((await call('/portal/management/schools')).status, 409);
  });
});

const writeCfg = loadConfig({ PORTAL_SCHOOL_SERVICES_ENABLED: 'true', PORTAL_SCHOOL_WRITES_ENABLED: 'true' });
function writeUpstream(extra = {}) {
  return (url, opts = {}) => {
    const u = decodeURIComponent(String(url)),
      post = (opts.method || 'GET') === 'POST';
    if (extra.qualificationsSearch && u.includes('Qualifications/search')) return extra.qualificationsSearch;
    if (u.includes('Accreditation_Centre_Link/search'))
      return { data: extra.centreId ? [{ id: 'link1', Training_Centre: { id: extra.centreId } }] : [] };
    if ((opts.method || 'GET') === 'PUT' && extra.centreId && u.includes('Training_Centres/' + extra.centreId))
      return { data: [{ status: 'success' }] };
    if (u.includes('Training_Centre_Accred/1000000000301'))
      return {
        data: [
          {
            id: '1000000000301',
            Applicant_Contact: { id: '101' },
            Account: { id: '1000000000201', name: 'Grace School' },
          },
        ],
      };
    if (u.includes('Qualifications/search')) return { data: [] };
    if (post && u.includes('/crm/v3/Qualifications')) return { data: [{ status: 'success', details: { id: '777' } }] };
    if (u.includes('TC_Course_Offering/1000000000501'))
      return {
        data: [
          {
            id: '1000000000501',
            Course: { id: 'c1', name: 'Gel Polish' },
            Training_Centre: { id: '401', name: 'Main Centre' },
            Accreditation: { id: '1000000000301' },
          },
        ],
      };
    if (post && u.includes('/creator/')) return { code: 3000, data: { ID: 'sess1' } };
    if (u.includes('Course_Sessions_Report')) return { code: 3000, data: extra.sessions || [] };
    return upstream(url);
  };
}
async function withWrites(extra, action) {
  const calls = [];
  await withServer(
    {
      config: writeCfg,
      fetchImpl: async (u, o) => {
        calls.push({ url: String(u), method: (o && o.method) || 'GET' });
        return { status: 200, ok: true, json: async () => writeUpstream(extra)(u, o) };
      },
    },
    async call => action(call, calls),
  );
}
const jpost = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const jput = body => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const goodQual = {
  name: 'Level 3 Beauty',
  trainingCentre: 'Academy of Beauty, Leeds',
  month: '5',
  year: 2020,
  delivery: ['Online only'],
  assessment: ['Other'],
  assessmentOther: 'Practical review',
};
test('qualification create rejects future dates and a missing training centre, and sends the centre only when its field is configured', async () => {
  const y = new Date().getFullYear();
  await withWrites({}, async (call, calls) => {
    const url = '/portal/management/schools/1000000000301/qualifications';
    assert.equal((await call(url, jpost({ ...goodQual, year: y + 1 }))).status, 422);
    assert.equal((await call(url, jpost({ ...goodQual, trainingCentre: ' ' }))).status, 422);
    assert.equal((await call(url, jpost({ ...goodQual, trainingCentre: 'x'.repeat(201) }))).status, 422);
    assert.equal(calls.filter(c => c.method === 'POST').length, 0);
  });
  const bodies = [];
  const cfg = loadConfig({
    PORTAL_SCHOOL_SERVICES_ENABLED: 'true',
    PORTAL_SCHOOL_WRITES_ENABLED: 'true',
    PORTAL_QUALIFICATION_CENTRE_FIELD: 'Training_Centre_Text',
  });
  await withServer(
    {
      config: cfg,
      fetchImpl: async (u, o) => {
        if (o && o.method === 'POST' && String(u).includes('/Qualifications')) bodies.push(o.body);
        return { status: 200, ok: true, json: async () => writeUpstream({})(u, o) };
      },
    },
    async call => {
      assert.equal(
        (await call('/portal/management/schools/1000000000301/qualifications', jpost(goodQual))).status,
        201,
      );
    },
  );
  assert.match(bodies[0], /"Training_Centre_Text":"Academy of Beauty, Leeds"/);
  const plain = [];
  await withServer(
    {
      config: writeCfg,
      fetchImpl: async (u, o) => {
        if (o && o.method === 'POST' && String(u).includes('/Qualifications')) plain.push(o.body);
        return { status: 200, ok: true, json: async () => writeUpstream({})(u, o) };
      },
    },
    async call => {
      await call('/portal/management/schools/1000000000301/qualifications', jpost(goodQual));
    },
  );
  assert.doesNotMatch(plain[0], /Academy of Beauty/);
});
test('qualification create validates free text and blocks an identical repeat', async () => {
  await withWrites({}, async (call, calls) => {
    assert.equal(
      (
        await call(
          '/portal/management/schools/1000000000301/qualifications',
          jpost({ ...goodQual, assessmentOther: 'x'.repeat(201) }),
        )
      ).status,
      422,
    );
    assert.equal(calls.filter(c => c.method === 'POST').length, 0);
    const ok = await call('/portal/management/schools/1000000000301/qualifications', jpost(goodQual));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.qualification.id, '777');
  });
  const existing = {
    data: [
      {
        id: '9',
        Name: 'level 3 beauty',
        Primary_Accreditation: { id: '1000000000301' },
        Date_Completed_Month: '5',
        Date_Completed_Year: '2020',
      },
    ],
  };
  await withWrites({ qualificationsSearch: existing }, async (call, calls) => {
    const r = await call('/portal/management/schools/1000000000301/qualifications', jpost(goodQual));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'DUPLICATE_QUALIFICATION');
    assert.equal(calls.filter(c => c.method === 'POST').length, 0);
  });
});
const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const goodSession = {
  courseOfferingId: '1000000000501',
  availabilityType: 'Fixed Date',
  sessionStart: nextYear.toISOString(),
  sessionEnd: new Date(nextYear.getTime() + 3600 * 1000).toISOString(),
  maximumPlaces: 8,
  totalAdvertisedPrice: '120.50',
};
test('course date create validates dates, price and days, and blocks a repeat', async () => {
  await withWrites({}, async (call, calls) => {
    const bad = async (patch, code) => {
      const r = await call('/portal/management/schools/1000000000301/sessions', jpost({ ...goodSession, ...patch }));
      assert.equal(r.status, 422, JSON.stringify(patch));
      assert.equal(r.body.code, code);
    };
    await bad({ totalAdvertisedPrice: 'free' }, 'INVALID_PRICE');
    await bad({ totalAdvertisedPrice: -5 }, 'INVALID_PRICE');
    await bad({ sessionStart: '2001-01-01T10:00:00Z' }, 'INVALID_DATE');
    await bad({ sessionEnd: new Date(nextYear.getTime() - 3600 * 1000).toISOString() }, 'INVALID_DATE');
    await bad({ availableDays: 'Monday' }, 'INVALID_SESSION');
    await bad({ flexibleDescription: { a: 1 } }, 'INVALID_SESSION');
    assert.equal(calls.filter(c => c.method === 'POST').length, 0, 'nothing is written for invalid input');
    const ok = await call('/portal/management/schools/1000000000301/sessions', jpost(goodSession));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.session.id, 'sess1');
  });
  await withWrites({}, async call => {
    await call('/portal/management/schools/1000000000301/sessions', jpost(goodSession));
  });
});
test('the school list carries what the Accreditation card needs: stage, payment and the qualification count', async () => {
  await withServer({}, async call => {
    const r = await call('/portal/management/schools');
    assert.equal(r.status, 200);
    const s = r.body.schools[0];
    assert.equal(s.stage, 'Paid');
    assert.equal(s.paid, true);
    assert.equal(s.payable, false);
    assert.equal(s.qualificationCount, 2);
  });
});

const goodProfile = {
  contactName: 'Jess Owner',
  website: 'https://glow.test',
  about: 'A friendly neighbourhood academy.',
  facebook: 'glowacademy',
  instagram: '@glowacademy',
  tiktok: '@glowacademy',
  linkedIn: 'glow-academy',
  facilities: ['parking', 'freeWifi'],
  imageUrl: 'https://paula356.sg-host.com/wp-content/uploads/school.png',
  imageId: 9001,
  logoUrl: 'https://paula356.sg-host.com/wp-content/uploads/logo.png',
  logoId: 9002,
};
test('school profile writes are disabled unless writes are explicitly authorised', async () => {
  await withServer({}, async call => {
    const r = await call('/portal/management/schools/1000000000301/profile', jput(goodProfile));
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'SCHOOL_WRITES_DISABLED');
  });
});
test('a profile update is rejected before the accreditation has a linked training centre', async () => {
  await withWrites({}, async call => {
    const r = await call('/portal/management/schools/1000000000301/profile', jput(goodProfile));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'CENTRE_REQUIRED');
  });
});
test('another Contact cannot update a school profile by changing its ID', async () => {
  await withWrites({ centreId: '401' }, async call => {
    const r = await call('/portal/management/schools/1000000000999/profile', jput(goodProfile));
    assert.equal(r.status, 404);
  });
});
test('rejects an unrecognised facility, over-long text and an invalid media id', async () => {
  await withWrites({ centreId: '401' }, async call => {
    assert.equal(
      (await call('/portal/management/schools/1000000000301/profile', jput({ ...goodProfile, facilities: ['hotTub'] })))
        .status,
      422,
    );
    assert.equal(
      (
        await call(
          '/portal/management/schools/1000000000301/profile',
          jput({ ...goodProfile, about: 'x'.repeat(2001) }),
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await call(
          '/portal/management/schools/1000000000301/profile',
          jput({ ...goodProfile, imageId: 'not-a-number' }),
        )
      ).status,
      422,
    );
    assert.equal(
      (await call('/portal/management/schools/1000000000301/profile', jput({ ...goodProfile, logoId: -5 }))).status,
      422,
    );
  });
});
test('updates the training centre with the profile content, including clearing fields left blank', async () => {
  await withWrites({ centreId: '401' }, async (call, calls) => {
    const r = await call('/portal/management/schools/1000000000301/profile', jput(goodProfile));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    const put = calls.find(c => c.method === 'PUT' && c.url.includes('Training_Centres/401'));
    assert.ok(put, 'the training centre was updated');
  });
  const writes = [];
  await withServer(
    {
      config: writeCfg,
      fetchImpl: async (u, o) => {
        if ((o?.method || 'GET') === 'PUT' && String(u).includes('Training_Centres/401')) writes.push(o.body);
        return { status: 200, ok: true, json: async () => writeUpstream({ centreId: '401' })(u, o) };
      },
    },
    async call => {
      await call(
        '/portal/management/schools/1000000000301/profile',
        jput({ ...goodProfile, website: '', imageId: '' }),
      );
      // A normal text-only edit must not clear existing ACF attachment IDs.
      await call(
        '/portal/management/schools/1000000000301/profile',
        jput({ ...goodProfile, about: 'Updated description', imageId: undefined, logoId: undefined }),
      );
    },
  );
  const unchangedMedia = JSON.parse(writes[1]).data[0];
  assert.equal(Object.hasOwn(unchangedMedia, 'School_Image_ID'), false);
  assert.equal(Object.hasOwn(unchangedMedia, 'School_Logo_ID'), false);
  const data = JSON.parse(writes[0]).data[0];
  assert.equal(data.Contact_Name, 'Jess Owner');
  assert.equal(data.Website, null);
  assert.equal(data.School_Image, goodProfile.imageUrl);
  assert.equal(data.School_Image_ID, null);
  assert.equal(data.School_Logo, goodProfile.logoUrl);
  assert.equal(data.School_Logo_ID, '9002');
  assert.equal(data.Parking, true);
  assert.equal(data.Free_Wifi, true);
  assert.equal(data.Changing_Area, false);
});
