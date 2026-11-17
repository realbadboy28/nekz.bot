const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySignature } = require('../src/signature');

function sign(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

test('accepts a valid signature', () => {
  const body = Buffer.from('{"hello":"world"}');
  assert.equal(verifySignature(body, 'app-secret', sign(body, 'app-secret')), true);
});

test('rejects a tampered body', () => {
  const header = sign(Buffer.from('{"hello":"world"}'), 'app-secret');
  assert.equal(verifySignature(Buffer.from('{"hello":"mars"}'), 'app-secret', header), false);
});

test('rejects a wrong secret, bad header, or missing values', () => {
  const body = Buffer.from('payload');
  assert.equal(verifySignature(body, 'app-secret', sign(body, 'other-secret')), false);
  assert.equal(verifySignature(body, 'app-secret', 'sha1=abc'), false);
  assert.equal(verifySignature(body, 'app-secret', undefined), false);
  assert.equal(verifySignature(body, '', sign(body, 'app-secret')), false);
});
