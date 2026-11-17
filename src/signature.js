const crypto = require('node:crypto');

function verifySignature(rawBody, appSecret, header) {
  if (!appSecret || !header || !rawBody) return false;

  const digest = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expected = Buffer.from(`sha256=${digest}`);
  const actual = Buffer.from(String(header));

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { verifySignature };
