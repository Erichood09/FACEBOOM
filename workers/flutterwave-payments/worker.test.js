import test from 'node:test';
import assert from 'node:assert/strict';
import { isTestConfiguration, paymentMatchesOrder, safeEqual } from './src/index.js';

const order = {
  tx_ref: 'FB-test-reference',
  amount: 500,
  currency: 'NGN'
};

test('accepts only an exactly matching successful Flutterwave transaction', () => {
  assert.equal(paymentMatchesOrder({
    id: 12345,
    status: 'successful',
    tx_ref: order.tx_ref,
    amount: 500,
    currency: 'NGN'
  }, order), true);
});

test('rejects wrong amount, currency, reference, and unsuccessful status', () => {
  assert.equal(paymentMatchesOrder({ status: 'successful', tx_ref: order.tx_ref, amount: 499, currency: 'NGN' }, order), false);
  assert.equal(paymentMatchesOrder({ status: 'successful', tx_ref: order.tx_ref, amount: 500, currency: 'USD' }, order), false);
  assert.equal(paymentMatchesOrder({ status: 'successful', tx_ref: 'another-ref', amount: 500, currency: 'NGN' }, order), false);
  assert.equal(paymentMatchesOrder({ status: 'pending', tx_ref: order.tx_ref, amount: 500, currency: 'NGN' }, order), false);
});

test('accepts a complete test-only configuration', () => {
  assert.equal(isTestConfiguration({
    FLW_MODE: 'test',
    FLW_SECRET_KEY: 'FLWSECK_TEST-example',
    FLW_WEBHOOK_SECRET: 'random-webhook-secret',
    FACEBOOM_APP_URL: 'https://faceboom-46273.web.app',
    PAYMENTS_DB: {}
  }), true);
});

test('refuses live keys, missing secrets, missing database, or live mode', () => {
  const valid = {
    FLW_MODE: 'test',
    FLW_SECRET_KEY: 'FLWSECK_TEST-example',
    FLW_WEBHOOK_SECRET: 'random-webhook-secret',
    FACEBOOM_APP_URL: 'https://faceboom-46273.web.app',
    PAYMENTS_DB: {}
  };
  assert.equal(isTestConfiguration({ ...valid, FLW_MODE: 'live' }), false);
  assert.equal(isTestConfiguration({ ...valid, FLW_SECRET_KEY: 'FLWSECK-example' }), false);
  assert.equal(isTestConfiguration({ ...valid, FLW_WEBHOOK_SECRET: '' }), false);
  assert.equal(isTestConfiguration({ ...valid, PAYMENTS_DB: null }), false);
});

test('compares webhook secrets without accepting different values', () => {
  assert.equal(safeEqual('webhook-secret', 'webhook-secret'), true);
  assert.equal(safeEqual('webhook-secret', 'wrong-secret'), false);
  assert.equal(safeEqual('short', 'longer'), false);
  assert.equal(safeEqual('', ''), true);
});
