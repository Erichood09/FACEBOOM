import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const FIREBASE_KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const PAGE_SIZE = 100;
let cachedGoogleToken = null;

function json(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    }
  });
}

export function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
  if ('referenceValue' in value) return value.referenceValue;
  return undefined;
}

export function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

export function filterBlockedItems(items, ownBlockedIds = [], blockedByIds = [], viewerUid, key = 'authorId') {
  const hidden = new Set([...ownBlockedIds, ...blockedByIds]);
  return items.filter((item) =>
    item[key]
    && !hidden.has(item[key])
    && (key !== 'uid' || item[key] !== viewerUid)
  );
}

function encodeCursor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_');
}

function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid page cursor.');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed.name !== 'string' || typeof parsed.createdAt !== 'string') {
    throw new Error('Invalid page cursor.');
  }
  return parsed;
}

async function getGoogleAccessToken(env) {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.value;
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Public-data Worker identity secret is incomplete.');
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: FIRESTORE_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(serviceAccount.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    ));

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error('Google did not issue a public-data Firestore access token.');
  }
  cachedGoogleToken = {
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000
  };
  return cachedGoogleToken.value;
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function firestoreRequest(path, accessToken, projectId) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Public mirror Firestore read failed with status ${response.status}.`);
  }
  return response.json();
}

async function listCollection(path, accessToken, projectId, pageSize = 1000) {
  const docs = [];
  let pageToken = '';
  do {
    const suffix = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) suffix.set('pageToken', pageToken);
    const result = await firestoreRequest(`${path}?${suffix}`, accessToken, projectId);
    if (!result) break;
    docs.push(...(result.documents || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken && docs.length < 10_000);
  if (pageToken) throw new Error('Public mirror collection is too large to safely evaluate.');
  return docs;
}

async function loadViewerContext(uid, projectId, accessToken) {
  const document = await firestoreRequest(
    `viewerAccess/${encodeURIComponent(uid)}`,
    accessToken,
    projectId
  );
  if (!document) return { error: 'FACEBOOM account access record was not found.', status: 403 };
  const viewer = decodeFirestoreFields(document.fields || {});
  const active = viewer.accountStatus === 'active'
    || (viewer.accountStatus === 'suspended'
      && viewer.suspensionUntil
      && Date.parse(viewer.suspensionUntil) <= Date.now());
  if (!active) {
    return { error: 'This account cannot access the public feed or directory.', status: 403 };
  }
  return {
    ownBlockedIds: Array.isArray(viewer.ownBlockedIds) ? viewer.ownBlockedIds : [],
    blockedByIds: Array.isArray(viewer.blockedByIds) ? viewer.blockedByIds : []
  };
}

async function runPostsQuery(accessToken, projectId, cursor) {
  const structuredQuery = {
    from: [{ collectionId: 'posts' }],
    orderBy: [
      { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }
    ],
    limit: PAGE_SIZE
  };
  if (cursor) {
    structuredQuery.startAt = {
      before: false,
      values: [
        { timestampValue: cursor.createdAt },
        { referenceValue: cursor.name }
      ]
    };
  }
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ structuredQuery })
  });
  const result = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Public mirror feed query failed with status ${response.status}.`);
  return (Array.isArray(result) ? result : [])
    .map((entry) => entry.document)
    .filter(Boolean);
}

async function authenticate(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return { error: 'Sign in to FACEBOOM first.', status: 401 };

  const authProjectId = env.FIREBASE_AUTH_PROJECT_ID || 'faceboom-46273';
  const publicDataProjectId = env.FIREBASE_PUBLIC_DATA_PROJECT_ID || '';
  if (!publicDataProjectId || publicDataProjectId === authProjectId) {
    return { error: 'The isolated public-data project is not configured.', status: 503 };
  }

  let payload;
  try {
    const verified = await jwtVerify(idToken, FIREBASE_KEYS, {
      issuer: `https://securetoken.google.com/${authProjectId}`,
      audience: authProjectId
    });
    payload = verified.payload;
  } catch {
    return { error: 'Your sign-in session is invalid or expired.', status: 401 };
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    return { error: 'Your sign-in session is invalid.', status: 401 };
  }

  const accessToken = await getGoogleAccessToken(env);
  const context = await loadViewerContext(payload.sub, publicDataProjectId, accessToken);
  if (context.error) return context;
  return { uid: payload.sub, projectId: publicDataProjectId, accessToken, ...context };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.FACEBOOM_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowedOrigins.includes(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Vary': 'Origin'
        }
      });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, origin);

    const url = new URL(request.url);
    if (url.pathname === '/v1/health') {
      const configured = Boolean(env.FIREBASE_PUBLIC_DATA_PROJECT_ID)
        && env.FIREBASE_PUBLIC_DATA_PROJECT_ID !== (env.FIREBASE_AUTH_PROJECT_ID || 'faceboom-46273');
      return json({ ok: true, service: 'faceboom-public-data', mode: 'isolated-read-only', configured }, 200, origin);
    }

    const profileMatch = url.pathname.match(/^\\/v1\\/profile\\/([A-Za-z0-9_-]{1,128})$/);
    if (!['/v1/feed', '/v1/directory'].includes(url.pathname) && !profileMatch) {
      return json({ error: 'Not found.' }, 404, origin);
    }

    try {
      const auth = await authenticate(request, env);
      if (auth.error) return json({ error: auth.error }, auth.status, origin);

      if (url.pathname === '/v1/directory') {
        const documents = await listCollection('publicProfiles', auth.accessToken, auth.projectId, PAGE_SIZE);
        const profiles = filterBlockedItems(
          documents.map((item) => ({
            ...decodeFirestoreFields(item.fields || {}),
            uid: item.name.split('/').pop()
          })),
          auth.ownBlockedIds,
          auth.blockedByIds,
          auth.uid,
          'uid'
        );
        return json({ profiles: profiles.slice(0, PAGE_SIZE) }, 200, origin);
      }

      if (profileMatch) {
        const uid = profileMatch[1];
        if (uid === auth.uid || auth.ownBlockedIds.includes(uid) || auth.blockedByIds.includes(uid)) {
          return json({ error: 'This profile is not available.' }, 404, origin);
        }
        const document = await firestoreRequest(
          `publicProfiles/${encodeURIComponent(uid)}`,
          auth.accessToken,
          auth.projectId
        );
        if (!document) return json({ error: 'This profile is not available.' }, 404, origin);
        return json({
          profile: { ...decodeFirestoreFields(document.fields || {}), uid }
        }, 200, origin);
      }

      const cursor = decodeCursor(url.searchParams.get('cursor'));
      const documents = await runPostsQuery(auth.accessToken, auth.projectId, cursor);
      const posts = filterBlockedItems(
        documents.map((item) => ({
          ...decodeFirestoreFields(item.fields || {}),
          id: item.name.split('/').pop()
        })),
        auth.ownBlockedIds,
        auth.blockedByIds,
        auth.uid
      );
      const lastDocument = documents.at(-1);
      const createdAt = lastDocument?.fields?.createdAt?.timestampValue;
      const nextCursor = documents.length === PAGE_SIZE && createdAt
        ? encodeCursor({ name: lastDocument.name, createdAt })
        : null;
      return json({ posts, nextCursor }, 200, origin);
    } catch (error) {
      console.error('Public data Worker error:', error?.message || 'Unknown error');
      return json({ error: 'Unable to load FACEBOOM public data right now.' }, 500, origin);
    }
  }
};
