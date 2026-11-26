import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const GRAPH_VERSION = 'v27.0';
const MAX_TEXT_LENGTH = 2000;

function json(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin'
    }
  });
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function verifyWebhookSignature(rawBody, signature, appSecret) {
  if (!signature?.startsWith('sha256=') || !appSecret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = 'sha256=' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return safeEqual(signature, expected);
}

async function authenticateModerator(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { error: 'Sign in to FACEBOOM first.', status: 401 };
  const projectId = env.FIREBASE_AUTH_PROJECT_ID || 'faceboom-46273';
  try {
    const verified = await jwtVerify(token, FIREBASE_KEYS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });
    if (!verified.payload.sub || verified.payload.moderator !== true) {
      return { error: 'Moderator access is required for the Facebook Page inbox.', status: 403 };
    }
    return { uid: verified.payload.sub };
  } catch {
    return { error: 'Your FACEBOOM sign-in session is invalid or expired.', status: 401 };
  }
}

function isPageScopedId(value) {
  return typeof value === 'string' && /^\d{5,30}$/.test(value);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';
}

async function createAppSecretProof(accessToken, appSecret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(accessToken));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function graphRequest(path, body, env) {
  if (!env.META_PAGE_ACCESS_TOKEN) throw new Error('Facebook Page access token is not configured.');
  if (!env.META_APP_SECRET) throw new Error('Meta app secret is not configured.');
  const version = env.META_GRAPH_API_VERSION || GRAPH_VERSION;
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set('access_token', env.META_PAGE_ACCESS_TOKEN);
  url.searchParams.set('appsecret_proof', await createAppSecretProof(env.META_PAGE_ACCESS_TOKEN, env.META_APP_SECRET));
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const error = new Error(result.error?.message || 'Meta rejected the request.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function handleWebhook(request, env) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && env.META_VERIFY_TOKEN && safeEqual(token, env.META_VERIFY_TOKEN) && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Webhook verification failed.', { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  const rawBody = await request.text();
  const valid = await verifyWebhookSignature(
    rawBody,
    request.headers.get('X-Hub-Signature-256') || '',
    env.META_APP_SECRET || ''
  );
  if (!valid) return new Response('Invalid webhook signature.', { status: 401 });

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return new Response('Invalid JSON.', { status: 400 }); }
  if (payload.object !== 'page' || !env.META_DB) return new Response('Unsupported webhook object.', { status: 400 });

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      const senderId = String(event.sender?.id || '');
      const pageId = String(event.recipient?.id || entry.id || '');
      const text = cleanText(event.message?.text || event.postback?.title || '');
      if (!senderId || senderId === pageId || event.message?.is_echo || !text) continue;
      const messageId = String(event.message?.mid || `event-${senderId}-${event.timestamp || Date.now()}`);
      const createdAt = Math.floor(Number(event.timestamp || Date.now()) / 1000);
      await env.META_DB.prepare(
        'INSERT OR IGNORE INTO meta_messages (message_id, psid, direction, message_text, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(messageId, senderId, 'inbound', text, createdAt).run();
      await env.META_DB.prepare(
        'INSERT INTO meta_conversations (psid, last_message, last_message_at, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(psid) DO UPDATE SET last_message = excluded.last_message, last_message_at = excluded.last_message_at, updated_at = unixepoch()'
      ).bind(senderId, text, createdAt).run();
    }

    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (change.field !== 'feed' || value.item !== 'comment' || value.verb !== 'add') continue;
      const commentId = String(value.comment_id || value.id || '');
      if (!commentId) continue;
      const createdAt = Math.floor(Number(value.created_time || Date.now() / 1000));
      await env.META_DB.prepare(
        'INSERT OR IGNORE INTO meta_comments (comment_id, post_id, sender_id, sender_name, message_text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        commentId,
        String(value.post_id || ''),
        String(value.from?.id || ''),
        cleanText(value.from?.name || ''),
        cleanText(value.message || ''),
        createdAt
      ).run();
    }
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function handleApi(request, env, url, origin) {
  const auth = await authenticateModerator(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, origin);
  if (!env.META_DB) return json({ error: 'The Facebook integration database is not configured yet.' }, 503, origin);

  if (request.method === 'GET' && url.pathname === '/v1/meta/status') {
    return json({
      configured: Boolean(env.META_APP_SECRET && env.META_VERIFY_TOKEN && env.META_PAGE_ACCESS_TOKEN && env.META_PAGE_ID),
      pageConnected: Boolean(env.META_PAGE_ID),
      message: 'Meta credentials are stored server-side. Meta App Review and Page webhook subscription are separate approval steps.'
    }, 200, origin);
  }

  if (request.method === 'GET' && url.pathname === '/v1/meta/conversation') {
    const psid = String(url.searchParams.get('psid') || '');
    if (!isPageScopedId(psid)) return json({ error: 'Invalid Messenger conversation.' }, 400, origin);
    const result = await env.META_DB.prepare(
      'SELECT message_id, psid, direction, message_text, created_at, delivery_status FROM meta_messages WHERE psid = ? ORDER BY created_at ASC LIMIT 100'
    ).bind(psid).all();
    return json({ psid, messages: result.results || [] }, 200, origin);
  }

  if (request.method === 'GET' && url.pathname === '/v1/meta/inbox') {
    const type = url.searchParams.get('type') === 'comments' ? 'comments' : 'messages';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    if (type === 'comments') {
      const result = await env.META_DB.prepare(
        'SELECT comment_id, post_id, sender_id, sender_name, message_text, created_at, reply_text, replied_at FROM meta_comments ORDER BY created_at DESC LIMIT ?'
      ).bind(limit).all();
      return json({ type, items: result.results || [] }, 200, origin);
    }
    const result = await env.META_DB.prepare(
      'SELECT psid, sender_name, last_message, last_message_at FROM meta_conversations ORDER BY last_message_at DESC LIMIT ?'
    ).bind(limit).all();
    return json({ type, items: result.results || [] }, 200, origin);
  }

  if (request.method === 'POST' && url.pathname === '/v1/meta/messages') {
    const body = await request.json().catch(() => ({}));
    const recipientId = String(body.recipientId || '');
    const message = cleanText(body.text);
    if (!isPageScopedId(recipientId) || !message) return json({ error: 'Enter a valid Messenger recipient and message.' }, 400, origin);
    try {
      const result = await graphRequest('me/messages', {
        recipient: { id: recipientId },
        message: { text: message }
      }, env);
      const messageId = String(result.message_id || crypto.randomUUID());
      const createdAt = Math.floor(Date.now() / 1000);
      await env.META_DB.prepare(
        'INSERT OR IGNORE INTO meta_messages (message_id, psid, direction, message_text, created_at, delivery_status) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(messageId, recipientId, 'outbound', message, createdAt, 'sent').run();
      await env.META_DB.prepare(
        'INSERT INTO meta_conversations (psid, last_message, last_message_at, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(psid) DO UPDATE SET last_message = excluded.last_message, last_message_at = excluded.last_message_at, updated_at = unixepoch()'
      ).bind(recipientId, message, createdAt).run();
      return json({ sent: true, messageId }, 200, origin);
    } catch (error) {
      return json({ error: error.message || 'Meta could not send this message.' }, error.status || 502, origin);
    }
  }

  if (request.method === 'POST' && url.pathname === '/v1/meta/comments') {
    const body = await request.json().catch(() => ({}));
    const commentId = String(body.commentId || '');
    const message = cleanText(body.text);
    if (!/^\d{5,80}(?:_\d{5,80})?$/.test(commentId) || !message) return json({ error: 'Enter a valid Facebook comment ID and reply.' }, 400, origin);
    try {
      const result = await graphRequest(`${encodeURIComponent(commentId)}/comments`, { message }, env);
      await env.META_DB.prepare(
        'UPDATE meta_comments SET reply_text = ?, replied_at = ? WHERE comment_id = ?'
      ).bind(message, Math.floor(Date.now() / 1000), commentId).run();
      return json({ replied: true, replyId: result.id || null }, 200, origin);
    } catch (error) {
      return json({ error: error.message || 'Meta could not publish this comment reply.' }, error.status || 502, origin);
    }
  }

  return json({ error: 'Not found.' }, 404, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/webhook') return handleWebhook(request, env);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.FACEBOOM_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!allowedOrigins.includes(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Vary': 'Origin'
        }
      });
    }
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, origin);
    try {
      return await handleApi(request, env, url, origin);
    } catch (error) {
      console.error('Meta bridge request failed:', error?.name || 'Error');
      return json({ error: 'The Facebook integration request could not be completed.' }, 500, origin);
    }
  }
};

export { safeEqual, verifyWebhookSignature, authenticateModerator, isPageScopedId, createAppSecretProof };
