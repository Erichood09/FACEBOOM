import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import {
  applyBlockEdge,
  normalizeAccountStatus,
  publicPost,
  publicProfile,
  writeVersionedMirrorDocument
} from './src/mirror.js';

const publicDataProjectId = defineString('PUBLIC_DATA_PROJECT_ID');
let mirrorApp;

function mirrorDb() {
  if (!mirrorApp) {
    const projectId = publicDataProjectId.value();
    if (!projectId || projectId === process.env.GCLOUD_PROJECT) {
      throw new Error('PUBLIC_DATA_PROJECT_ID must be a separate project.');
    }
    mirrorApp = initializeApp({ projectId }, 'faceboom-public-data-mirror');
  }
  return getFirestore(mirrorApp);
}

function eventMillis(event) {
  const value = Date.parse(event.time || '');
  return Number.isFinite(value) ? value : Date.now();
}

function eventVersion(event) {
  return typeof event.time === 'string' && event.time
    ? event.time
    : new Date(eventMillis(event)).toISOString();
}

export const mirrorPublicProfile = onDocumentWritten(
  { document: 'publicProfiles/{uid}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after?.exists) {
      await writeVersionedMirrorDocument(mirrorDb(), 'publicProfiles', uid, null, eventVersion(event));
      return;
    }
    const safe = publicProfile(after.data(), uid);
    await writeVersionedMirrorDocument(mirrorDb(), 'publicProfiles', uid, safe, eventVersion(event));
  }
);

export const mirrorPublicPost = onDocumentWritten(
  { document: 'posts/{postId}', region: 'us-central1', retry: true },
  async (event) => {
    const after = event.data?.after;
    const safe = after?.exists ? publicPost(after.data()) : null;
    await writeVersionedMirrorDocument(mirrorDb(), 'posts', event.params.postId, safe, eventMillis(event));
  }
);

export const mirrorAccountAccess = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after?.exists) {
      await writeVersionedMirrorDocument(mirrorDb(), 'viewerAccess', uid, null, eventMillis(event));
      return;
    }
    const account = normalizeAccountStatus(after.data());
    await writeVersionedMirrorDocument(mirrorDb(), 'viewerAccess', uid, {
      ...account,
      updatedAt: new Date(eventMillis(event))
    }, eventVersion(event), true);
  }
);

export const mirrorBlockRelationship = onDocumentWritten(
  { document: 'users/{blockerUid}/blocked/{blockedUid}', region: 'us-central1', retry: true },
  async (event) => {
    const { blockerUid, blockedUid } = event.params;
    if (blockerUid === blockedUid) return;
    const db = mirrorDb();
    const edgeRef = db.doc(`blockEdges/${blockerUid}__${blockedUid}`);
    const blockerRef = db.doc(`viewerAccess/${blockerUid}`);
    const blockedRef = db.doc(`viewerAccess/${blockedUid}`);
    const exists = Boolean(event.data?.after?.exists);
    const incomingTime = eventMillis(event);
    const incomingVersion = eventVersion(event);

    await db.runTransaction(async (transaction) => {
      const [edgeSnap, blockerSnap, blockedSnap] = await Promise.all([
        transaction.get(edgeRef),
        transaction.get(blockerRef),
        transaction.get(blockedRef)
      ]);
      const priorVersion = edgeSnap.exists ? edgeSnap.get('eventVersion') : null;
      if (priorVersion && incomingVersion <= priorVersion) return;
      const blockerState = applyBlockEdge(blockerSnap.data(), blockerUid, blockedUid, exists);
      const blockedState = applyBlockEdge(blockedSnap.data(), blockerUid, blockedUid, exists);

      transaction.set(blockerRef, {
        ownBlockedIds: blockerState.ownBlockedIds,
        blockedByIds: blockerSnap.get('blockedByIds') || [],
        updatedAt: new Date(incomingTime)
      }, { merge: true });
      transaction.set(blockedRef, {
        ownBlockedIds: blockedSnap.get('ownBlockedIds') || [],
        blockedByIds: blockedState.blockedByIds,
        updatedAt: new Date(incomingTime)
      }, { merge: true });

      transaction.set(edgeRef, { blockerUid, blockedUid, exists, eventMillis: incomingTime, eventVersion: incomingVersion });
    });
  }
);

// Source blockedBy mirrors are intentionally not separate triggers: every
// relationship is represented once by the canonical users/{uid}/blocked edge.
