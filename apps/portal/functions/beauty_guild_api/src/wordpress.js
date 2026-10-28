'use strict';
const { HttpError } = require('./errors');
const fail = (message, status = 422, code = 'INVALID_REQUEST') => {
  throw new HttpError(status, code, message);
};

function authHeader(username, appPassword) {
  return 'Basic ' + Buffer.from(username + ':' + appPassword).toString('base64');
}

// School Image/Logo uploads go straight to the WordPress Media Library (the same Application Password the
// CRM-to-WordPress Deluge sync uses) - CRM only ever stores the returned media URL, never the file itself.
async function uploadToWordPressMedia({ baseUrl, username, appPassword, fetchImpl }, buffer, fileName, mimeType) {
  if (!username || !appPassword) fail('Media uploads are not configured.', 503, 'MEDIA_DISABLED');
  let response;
  try {
    response = await fetchImpl(baseUrl + '/wp-json/wp/v2/media', {
      method: 'POST',
      headers: {
        Authorization: authHeader(username, appPassword),
        'Content-Type': mimeType,
        'Content-Disposition': 'attachment; filename="' + fileName + '"',
      },
      body: buffer,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    fail('The media library could not be reached.', 502, 'MEDIA_UNAVAILABLE');
  }
  // Read as text first: a security plugin or misconfiguration can return HTML instead of JSON, and this way
  // that failure is still a clean MEDIA_UPLOAD_FAILED rather than an unhandled exception from response.json().
  const rawText = await response.text();
  let body = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    // body stays null; handled by the check below
  }
  if (!response.ok || !body?.id || !body?.source_url)
    fail('The media library did not confirm the upload.', 502, 'MEDIA_UPLOAD_FAILED');
  return { id: body.id, url: body.source_url };
}

// Looks up the school's public page on WordPress (the "training-venue" post type) by name, for a "view public
// page" link on the profile. Best-effort only: any failure (not configured, network, no match) returns null
// rather than surfacing an error - the profile is still complete and useful without this link.
async function findSchoolPageUrl({ baseUrl, username, appPassword, fetchImpl }, name) {
  if (!username || !appPassword || !name) return null;
  let response;
  try {
    response = await fetchImpl(
      baseUrl + '/wp-json/wp/v2/training-venue?search=' + encodeURIComponent(name) + '&per_page=1',
      { headers: { Authorization: authHeader(username, appPassword) }, signal: AbortSignal.timeout(8000) },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const link = Array.isArray(body) && body[0]?.link;
  return typeof link === 'string' ? link : null;
}

module.exports = { uploadToWordPressMedia, findSchoolPageUrl };
