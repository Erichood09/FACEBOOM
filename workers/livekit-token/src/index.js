import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const FIREBASE_PROJECT_ID = 'faceboom-46273';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

function json(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin !== env.FACEBOOM_ORIGIN) return json({ error: 'Origin not allowed.' }, 403, env.FACEBOOM_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' } });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

    try {
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!idToken) return json({ error: 'Sign in to FACEBOOM first.' }, 401, origin);

      const { payload } = await jwtVerify(idToken, FIREBASE_KEYS, {
        issuer: FIREBASE_ISSUER,
        audience: FIREBASE_PROJECT_ID
      });
      const uid = payload.sub;
      if (!uid || typeof uid !== 'string') return json({ error: 'Invalid account token.' }, 401, origin);

      const body = await request.json();
      const streamId = String(body.streamId || '');
      const mode = body.mode;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(streamId) || !['host', 'viewer'].includes(mode)) {
        return json({ error: 'Invalid live session.' }, 400, origin);
      }

      const profileResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (!profileResponse.ok) return json({ error: 'Could not verify your FACEBOOM account.' }, 403, origin);
      const profileDocument = await profileResponse.json();
      const accountStatus = profileDocument.fields?.accountStatus?.stringValue || 'active';
      const suspensionUntil = profileDocument.fields?.suspensionUntil?.timestampValue || '';
      const suspensionExpired = accountStatus === 'suspended'
        && suspensionUntil
        && Date.parse(suspensionUntil) <= Date.now();
      if (accountStatus !== 'active' && !suspensionExpired) {
        return json({ error: 'Your account cannot join a live broadcast.' }, 403, origin);
      }

      const streamResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/liveStreams/${streamId}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (!streamResponse.ok) return json({ error: 'This live broadcast is no longer available.' }, 404, origin);
      const streamDocument = await streamResponse.json();
      const streamStatus = streamDocument.fields?.status?.stringValue;
      const hostUid = streamDocument.fields?.hostUid?.stringValue;
      const lastHeartbeat = streamDocument.fields?.lastHeartbeat?.timestampValue || '';
      if (streamStatus !== 'live' || !lastHeartbeat || Date.now() - Date.parse(lastHeartbeat) > 90000) {
        return json({ error: 'This broadcast is no longer active.' }, 410, origin);
      }
      const isHost = uid === hostUid;
      if ((mode === 'host' && !isHost) || ((mode === 'viewer' || mode === 'guest') && isHost)) {
        return json({ error: 'You are not authorized for this live session.' }, 403, origin);
      }
      if (mode === 'guest') {
        const guestResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/liveStreams/${streamId}/guestRequests/${uid}`, { headers: { Authorization: `Bearer ${idToken}` } });
        if (!guestResponse.ok) return json({ error: 'Guest approval was not found.' }, 403, origin);
        const guestDocument = await guestResponse.json();
        if (guestDocument.fields?.status?.stringValue !== 'approved') return json({ error: 'The host has not approved your guest request.' }, 403, origin);
      }

      const token = await new SignJWT({
        name: profileDocument.fields?.fullName?.stringValue || 'FACEBOOM member',
        video: {
          roomJoin: true,
          room: `faceboom-${streamId}`,
          canPublish: mode === 'host' || mode === 'guest',
          canSubscribe: true,
          canPublishData: mode === 'host' || mode === 'guest'
        }
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(env.LIVEKIT_API_KEY)
        .setSubject(uid)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(env.LIVEKIT_API_SECRET));
      return json({ token }, 200, origin);
    } catch (error) {
      console.error('Live token error:', error);
      return json({ error: 'Unable to authorize this live session.' }, 401, origin);
    }
  }
};
