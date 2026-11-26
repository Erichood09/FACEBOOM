import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import {
  applyBlockEdge,
  normalizeAccountStatus,
  publicPost,
  publicProfile
} from './src/mirror.js';

const publicDataProjectId = defineString('PUBLIC_DATA_PROJECT_ID');
const sourceApp = getApps().find((app) => app.name === '[DEFAULT]') || initializeApp();
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

export const mirrorPublicProfile = onDocumentWritten(
  { document: 'publicProfiles/{uid}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    const ref = mirrorDb().doc(`publicProfiles/${uid}`);
    if (!after?.exists) {
      await ref.delete().catch((error) => {
        if (error.code !== 5) throw error;
      });
      return;
    }
    const safe = publicProfile(after.data(), uid);
    if (!safe) {
      await ref.delete();
      return;
    }
    await ref.set(safe);
  }
);

export const mirrorPublicPost = onDocumentWritten(
  { document: 'posts/{postId}', region: 'us-central1', retry: true },
  async (event) => {
    const ref = mirrorDb().doc(`posts/${event.params.postId}`);
    const after = event.data?.after;
    if (!after?.exists) {
      await ref.delete().catch((error) => {
        if (error.code !== 5) throw error;
      });
      return;
    }
    const safe = publicPost(after.data());
    if (!safe) {
      await ref.delete();
      return;
    }
    await ref.set(safe);
  }
);

export const mirrorAccountAccess = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after?.exists) return;
    const account = normalizeAccountStatus(after.data());
    const ref = mirrorDb().doc(`viewerAccess/${uid}`);
    await ref.set({
      ...account,
      ownBlockedIds: FieldValue.arrayUnion(),
      blockedByIds: FieldValue.arrayUnion(),
      updatedAt: new Date(eventMillis(event))
    }, { merge: true });
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

    await db.runTransaction(async (transaction) => {
      const [edgeSnap, blockerSnap, blockedSnap] = await Promise.all([
        transaction.get(edgeRef),
        transaction.get(blockerRef),
        transaction.get(blockedRef)
      ]);
      const priorTime = edgeSnap.exists ? Number(edgeSnap.get('eventMillis') || 0) : 0;
      if (priorTime > incomingTime) return;
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

      if (exists) {
        transaction.set(edgeRef, { blockerUid, blockedUid, eventMillis: incomingTime });
      } else if (edgeSnap.exists) {
        transaction.delete(edgeRef);
      }
    });
  }
);

// Source blockedBy mirrors are intentionally not separate triggers: every
// relationship is represented once by the canonical users/{uid}/blocked edge.
