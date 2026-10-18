'use strict';

// Errors raised here are the only ones whose message may reach the browser.
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { HttpError };
