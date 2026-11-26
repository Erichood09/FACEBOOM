import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { safeEqual, verifyWebhookSignature } from './src/index.js';

test('constant-time comparison rejects mismatched and missing values', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('', ''), true);
});

test('webhook signature accepts the correct HMAC and rejects tampering', async () => {
  const body = JSON.stringify({ object: 'page', entry: [] });
  const secret = 'test-app-secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const signature = 'sha256=' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifyWebhookSignature(body, signature, secret), true);
  assert.equal(await verifyWebhookSignature(body + ' ', signature, secret), false);
  assert.equal(await verifyWebhookSignature(body, signature, ''), false);
});

test('Messenger webhook verification returns the challenge only for the configured token', async () => {
  const env = { META_VERIFY_TOKEN: 'faceboom-test-verify-token' };
  const valid = await worker.fetch(new Request(
    'https://meta-bridge.example/webhook?hub.mode=subscribe&hub.verify_token=faceboom-test-verify-token&hub.challenge=123456'
  ), env);
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), '123456');

  const invalid = await worker.fetch(new Request(
    'https://meta-bridge.example/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456'
  ), env);
  assert.equal(invalid.status, 403);
});

test('API rejects an unapproved browser origin before processing requests', async () => {
  const response = await worker.fetch(new Request('https://meta-bridge.example/v1/meta/status', {
    headers: { Origin: 'https://not-faceboom.example' }
  }), { FACEBOOM_ORIGINS: 'https://faceboom-46273.web.app' });
  assert.equal(response.status, 403);
});

test('webhook rejects requests without a valid Meta signature', async () => {
  const response = await worker.fetch(new Request('https://meta-bridge.example/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object: 'page', entry: [] })
  }), { META_APP_SECRET: 'secret', META_DB: {} });
  assert.equal(response.status, 401);
});
