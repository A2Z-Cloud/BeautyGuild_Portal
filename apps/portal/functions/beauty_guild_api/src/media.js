'use strict';
const express = require('express');
const { HttpError } = require('./errors');
const { createSchoolApi } = require('./schoolServices');
const { uploadToWordPressMedia } = require('./wordpress');
const fail = (message, status = 422, code = 'INVALID_REQUEST') => {
  throw new HttpError(status, code, message);
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function registerMediaRoutes(app, { enabled, getCurrentUser, getCrmHeaders, config, fetchImpl = fetch }) {
  const router = express.Router();
  const api = createSchoolApi({ getCrmHeaders, crmApiDomain: config.crmApiDomain, fetchImpl });
  const handle = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  // base64 inflates a file by about a third, so this needs real headroom over MAX_IMAGE_BYTES (8MB decoded) for our
  // own, clearer size check below to be what rejects an oversized image, not body-parser's own limit.
  router.use(express.json({ limit: '16mb' }));
  router.use(async (req, res, next) => {
    try {
      if (!enabled) fail('School media uploads are not enabled.', 503, 'SCHOOL_MEDIA_DISABLED');
      req.memberContact = await api.contact(req, await getCurrentUser(req));
      next();
    } catch (e) {
      next(e);
    }
  });
  // Signed in is the only requirement: the upload never touches CRM, so there is no training centre (or even
  // an application) to depend on yet. The URL rides back as a plain answer and reaches CRM when the applicant
  // next saves or submits, exactly like Website or Facebook already do.
  router.post(
    '/upload',
    handle(async (req, res) => {
      const { type, fileName, mimeType, dataBase64 } = req.body || {};
      if (!['image', 'logo'].includes(type)) fail('type must be "image" or "logo".');
      if (!ALLOWED_MIME_TYPES.has(mimeType)) fail('Choose a PNG, JPEG or WEBP image.');
      if (typeof dataBase64 !== 'string' || !dataBase64) fail('Choose a file to upload.');
      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) fail('The image must be under 8MB.');
      const defaultName = type === 'logo' ? 'school-logo' : 'school-image';
      const media = await uploadToWordPressMedia(
        {
          baseUrl: config.wordpressBaseUrl,
          username: config.wordpressUsername,
          appPassword: config.wordpressAppPassword,
          fetchImpl,
        },
        buffer,
        fileName ? String(fileName).slice(0, 80) : defaultName,
        mimeType,
      );
      res.json({ mediaId: media.id, url: media.url });
    }),
  );
  app.use('/portal/media', router);
}

module.exports = { registerMediaRoutes };
