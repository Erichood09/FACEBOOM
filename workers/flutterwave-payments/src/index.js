import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';

function json(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin'
    }
  });
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function paymentMatchesOrder(transaction, order) {
  if (!transaction || !order) return false;
  const paidAmount = Number(transaction.amount);
  const expectedAmount = Number(order.amount);
  return transaction.status === 'successful'
    && transaction.tx_ref === order.tx_ref
    && String(transaction.currency || '').toUpperCase() === String(order.currency || '').toUpperCase()
    && Number.isFinite(paidAmount)
    && Number.isFinite(expectedAmount)
    && Math.abs(paidAmount - expectedAmount) < 0.005;
}

export function isTestConfiguration(env) {
  return env?.FLW_MODE === 'test'
    && typeof env.FLW_SECRET_KEY === 'string'
    && env.FLW_SECRET_KEY.startsWith('FLWSECK_TEST-')
    && Boolean(env.PAYMENTS_DB)
    && Boolean(env.FLW_WEBHOOK_SECRET)
    && Boolean(env.FACEBOOM_APP_URL);
}

function projectIds(env) {
  return (env.FIREBASE_PROJECT_IDS || 'faceboom-46273')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function authenticate(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return { error: 'Sign in to FACEBOOM first.', status: 401 };

  let payload;
  let verifiedProjectId = '';
  for (const projectId of projectIds(env)) {
    try {
      const verified = await jwtVerify(idToken, FIREBASE_KEYS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId
      });
      payload = verified.payload;
      verifiedProjectId = projectId;
      break;
    } catch {
      // Continue only through explicitly allowlisted Firebase projects.
    }
  }
  if (!payload?.sub || !verifiedProjectId) return { error: 'Invalid account token.', status: 401 };

  const profileResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${verifiedProjectId}/databases/(default)/documents/users/${encodeURIComponent(payload.sub)}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!profileResponse.ok) return { error: 'Could not verify your FACEBOOM account.', status: 403 };
  const profileDocument = await profileResponse.json();
  const fields = profileDocument.fields || {};
  const accountStatus = fields.accountStatus?.stringValue || 'active';
  const suspensionUntil = fields.suspensionUntil?.timestampValue || '';
  const suspensionExpired = accountStatus === 'suspended'
    && suspensionUntil
    && Date.parse(suspensionUntil) <= Date.now();
  if (accountStatus !== 'active' && !suspensionExpired) {
    return { error: 'Your account cannot make purchases.', status: 403 };
  }
  const email = fields.email?.stringValue || payload.email || '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Add a valid email address to your FACEBOOM account before purchasing.', status: 400 };
  return {
    uid: payload.sub,
    email,
    name: fields.fullName?.stringValue || 'FACEBOOM member'
  };
}

function paymentsReady(env) {
  return isTestConfiguration(env);
}

async function flutterwaveRequest(path, env, options = {}) {
  const response = await fetch(`${FLUTTERWAVE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== 'success') {
    throw new Error('Flutterwave did not accept the payment request.');
  }
  return body.data;
}

async function verifyAndCredit(transactionId, txRef, uid, env) {
  if (!/^\d+$/.test(String(transactionId || '')) || typeof txRef !== 'string' || !txRef) {
    return { error: 'Invalid payment reference.', status: 400 };
  }
  const order = await env.PAYMENTS_DB.prepare(
    'SELECT tx_ref, uid, coins, amount, currency, status FROM payment_orders WHERE tx_ref = ?'
  ).bind(txRef).first();
  if (!order || (uid && order.uid !== uid)) return { error: 'Payment order was not found.', status: 404 };

  const verified = await flutterwaveRequest(
    `/transactions/${encodeURIComponent(transactionId)}/verify`,
    env
  );
  if (!paymentMatchesOrder(verified, order) || String(verified.id) !== String(transactionId)) {
    return { error: 'Payment could not be verified against this order.', status: 409 };
  }

  const now = new Date().toISOString();
  await env.PAYMENTS_DB.batch([
    env.PAYMENTS_DB.prepare(
      "UPDATE payment_orders SET status = 'paid', provider_transaction_id = ?, paid_at = ? WHERE tx_ref = ? AND status = 'pending'"
    ).bind(String(transactionId), now, txRef),
    env.PAYMENTS_DB.prepare(
      "INSERT OR IGNORE INTO wallet_ledger (ledger_id, uid, tx_ref, entry_type, coins_delta, created_at) SELECT ?, uid, tx_ref, 'topup', coins, ? FROM payment_orders WHERE tx_ref = ? AND status = 'paid'"
    ).bind(`topup:${txRef}`, now, txRef)
  ]);
  const balance = await env.PAYMENTS_DB.prepare(
    'SELECT COALESCE(SUM(coins_delta), 0) AS balance FROM wallet_ledger WHERE uid = ?'
  ).bind(order.uid).first();
  return { verified: true, balance: Number(balance?.balance || 0), coinsAdded: Number(order.coins) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const isWebhook = url.pathname === '/webhooks/flutterwave';
    const allowedOrigins = (env.FACEBOOM_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowedOrigins.includes(origin) && !(isWebhook && !origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          Vary: 'Origin'
        }
      });
    }

    if (url.pathname === '/webhooks/flutterwave' && request.method === 'POST') {
      if (!env.FLW_WEBHOOK_SECRET || !safeEqual(request.headers.get('verif-hash') || '', env.FLW_WEBHOOK_SECRET)) {
        return json({ error: 'Invalid webhook signature.' }, 401, origin);
      }
      if (!paymentsReady(env)) return json({ error: 'Test payment service is not configured.' }, 503, origin);
      try {
        const event = await request.json();
        const transactionId = event?.data?.id;
        const txRef = event?.data?.tx_ref;
        if (!transactionId || !txRef) return json({ received: true }, 200, origin);
        const result = await verifyAndCredit(String(transactionId), String(txRef), null, env);
        if (result.error && (result.status >= 500 || result.status === 409)) {
          return json({ error: result.error }, 500, origin);
        }
        if (result.error) return json({ received: true, ignored: true }, 200, origin);
        return json({ received: true }, 200, origin);
      } catch (error) {
        console.error('Flutterwave webhook processing failed:', error?.message || 'unknown error');
        return json({ error: 'Webhook processing failed; retry delivery.' }, 500, origin);
      }
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405, origin);
    }
    if (url.pathname === '/v1/health' && request.method === 'GET') {
      return json({
        service: 'FACEBOOM Wallet',
        mode: 'test-only',
        configured: paymentsReady(env),
        livePaymentsEnabled: false
      }, 200, origin);
    }
    if (!url.pathname.startsWith('/v1/')) return json({ error: 'Not found.' }, 404, origin);

    const identity = await authenticate(request, env).catch(() => ({ error: 'Unable to verify your FACEBOOM account.', status: 503 }));
    if (identity.error) return json({ error: identity.error }, identity.status, origin);

    if (url.pathname === '/v1/catalog' && request.method === 'GET') {
      if (!env.PAYMENTS_DB) return json({ packages: [], configured: false }, 200, origin);
      const result = await env.PAYMENTS_DB.prepare(
        'SELECT package_id AS packageId, label, coins, amount, currency FROM wallet_packages WHERE active = 1 ORDER BY display_order ASC, coins ASC'
      ).all();
      return json({ packages: result.results || [], configured: paymentsReady(env), mode: 'test' }, 200, origin);
    }

    if (url.pathname === '/v1/wallet' && request.method === 'GET') {
      if (!env.PAYMENTS_DB) return json({ balance: 0, configured: false }, 200, origin);
      const result = await env.PAYMENTS_DB.prepare(
        'SELECT COALESCE(SUM(coins_delta), 0) AS balance FROM wallet_ledger WHERE uid = ?'
      ).bind(identity.uid).first();
      return json({ balance: Number(result?.balance || 0), configured: paymentsReady(env), mode: 'test' }, 200, origin);
    }

    if (!paymentsReady(env)) {
      return json({ error: 'FACEBOOM Wallet test mode is not configured yet.' }, 503, origin);
    }

    if (url.pathname === '/v1/checkout' && request.method === 'POST') {
      try {
        const body = await request.json();
        const packageId = String(body.packageId || '');
        if (!/^[a-z0-9_-]{2,40}$/i.test(packageId)) return json({ error: 'Choose a valid coin package.' }, 400, origin);
        const selected = await env.PAYMENTS_DB.prepare(
          'SELECT package_id, coins, amount, currency FROM wallet_packages WHERE package_id = ? AND active = 1'
        ).bind(packageId).first();
        if (!selected || !Number.isInteger(Number(selected.coins)) || Number(selected.coins) <= 0
          || !Number.isFinite(Number(selected.amount)) || Number(selected.amount) <= 0
          || !/^[A-Z]{3}$/.test(String(selected.currency))) {
          return json({ error: 'This coin package is not available.' }, 404, origin);
        }

        const txRef = `FB-${crypto.randomUUID()}`;
        const redirectUrl = new URL(env.FACEBOOM_APP_URL);
        redirectUrl.searchParams.set('wallet', 'return');
        await env.PAYMENTS_DB.prepare(
          "INSERT INTO payment_orders (tx_ref, uid, package_id, coins, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"
        ).bind(txRef, identity.uid, selected.package_id, Number(selected.coins), Number(selected.amount), selected.currency, new Date().toISOString()).run();

        let checkout;
        try {
          checkout = await flutterwaveRequest('/payments', env, {
            method: 'POST',
            body: JSON.stringify({
              tx_ref: txRef,
              amount: Number(selected.amount),
              currency: selected.currency,
              redirect_url: redirectUrl.toString(),
              customer: { email: identity.email, name: identity.name },
              customizations: { title: 'FACEBOOM Wallet', description: 'Buy FACEBOOM gift credits' },
              meta: { uid: identity.uid, package_id: selected.package_id }
            })
          });
        } catch (error) {
          await env.PAYMENTS_DB.prepare(
            "UPDATE payment_orders SET status = 'failed' WHERE tx_ref = ? AND status = 'pending'"
          ).bind(txRef).run();
          throw error;
        }
        if (!checkout?.link || !checkout.link.startsWith('https://checkout.flutterwave.com/')) {
          throw new Error('Flutterwave returned an invalid checkout URL.');
        }
        await env.PAYMENTS_DB.prepare(
          'UPDATE payment_orders SET checkout_url = ? WHERE tx_ref = ?'
        ).bind(checkout.link, txRef).run();
        return json({ checkoutUrl: checkout.link, txRef }, 200, origin);
      } catch (error) {
        console.error('Wallet checkout failed:', error?.message || 'unknown error');
        return json({ error: 'Could not start checkout. Please try again later.' }, 502, origin);
      }
    }

    if (url.pathname === '/v1/verify-return' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await verifyAndCredit(String(body.transactionId || ''), String(body.txRef || ''), identity.uid, env);
        return result.error ? json({ error: result.error }, result.status, origin) : json(result, 200, origin);
      } catch (error) {
        console.error('Wallet return verification failed:', error?.message || 'unknown error');
        return json({ error: 'Payment verification is temporarily unavailable.' }, 502, origin);
      }
    }

    return json({ error: 'Not found.' }, 404, origin);
  }
};
