const path = require('path');

const STYLIST_URL = (process.env.STYLIST_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const STYLIST_KEY = process.env.STYLIST_KEY || '';

/**
 * Check if the Python photo stylist service is online and healthy.
 * Used by admin UI to show status rather than crashing or blocking.
 *
 * @param {number} [timeoutMs=4000]
 * @returns {Promise<boolean>}
 */
async function isAvailable(timeoutMs = 4000) {
  if (!STYLIST_URL) return false;
  try {
    const res = await fetch(`${STYLIST_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return !!(body && body.ok);
  } catch (err) {
    return false;
  }
}

/**
 * Styles a dress photo by posting to the Python stylist microservice.
 *
 * @param {Buffer} buffer - Image file buffer
 * @param {Object} [options]
 * @param {'auto'|'hanging'|'flat'|'worn'} [options.mode='auto']
 * @param {'auto'|'yes'|'no'} [options.hanger='auto']
 * @param {'pink'|'cream'|'white'} [options.background='pink']
 * @returns {Promise<{ buffer: Buffer, meta: Object }>}
 */
async function styleImage(buffer, options = {}) {
  const mode = options.mode || 'auto';
  const hanger = options.hanger || 'auto';
  const background = options.background || 'pink';

  const makeAttempt = async () => {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'photo.jpg');
    formData.append('mode', mode);
    formData.append('hanger', hanger);
    formData.append('background', background);

    const headers = {};
    if (STYLIST_KEY) {
      headers['X-Stylist-Key'] = STYLIST_KEY;
    }

    const res = await fetch(`${STYLIST_URL}/style`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(90000) // 90 seconds timeout
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`Stylist service error (${res.status}): ${errText}`);
      err.status = res.status;
      throw err;
    }

    const metaHeader = res.headers.get('x-stylist-meta') || '{}';
    let meta = {};
    try {
      meta = JSON.parse(metaHeader);
    } catch {
      meta = {};
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      meta
    };
  };

  try {
    return await makeAttempt();
  } catch (err) {
    // No retry on client errors (4xx)
    if (err.status && err.status >= 400 && err.status < 500) {
      throw err;
    }

    // One retry on network or server error
    try {
      return await makeAttempt();
    } catch (retryErr) {
      // Never log image data or secret key
      console.error('[PhotoStylist] Request failed after retry:', retryErr.message);
      throw retryErr;
    }
  }
}

module.exports = {
  isAvailable,
  styleImage,
  STYLIST_URL
};

