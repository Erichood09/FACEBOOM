import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { publicPost, publicProfile, normalizeAccountStatus } from '../src/mirror.js';

const sourceProjectId = process.env.FIREBASE_SOURCE_PROJECT_ID || 'faceboom-46273';
const mirrorProjectId = process.env.PUBLIC_DATA_PROJECT_ID;

if (!mirrorProjectId || mirrorProjectId === sourceProjectId) {
  throw new Error('Set PUBLIC_DATA_PROJECT_ID to a different Firebase project.');
}

const sourceApp = initializeApp({ projectId: sourceProjectId }, 'faceboom-backfill-source');
const mirrorApp = initializeApp({ projectId: mirrorProjectId }, 'faceboom-backfill-mirror');
const sourceDb = getFirestore(sourceApp);
const mirrorDb = getFirestore(mirrorApp);
const PAGE_SIZE = 250;

function timestampKey(value) {
  if (!value || !Number.isFinite(value.seconds) || !Number.isFinite(value.nanoseconds)) return null;
  const base = new Date(value.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  return `${base}.${String(value.nanoseconds).padStart(9, '0')}Z`;
}

async function forEachDocument(collectionRef, callback) {
  let cursor = null;
  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;
    for (const document of page.docs) await callback(document);
    cursor = page.docs.at(-1);
    if (page.size < PAGE_SIZE) break;
  }
}

async function writeInBatches(entries) {
  let batch = mirrorDb.batch();
  let count = 0;
  let total = 0;
  for (const [ref, data] of entries) {
    batch.set(ref, data, { merge: true });
    count += 1;
    total += 1;
    if (count === 450) {
      await batch.commit();
      batch = mirrorDb.batch();
      count = 0;
    }
  }
  if (count) await batch.commit();
  return total;
}

const access = new Map();
function accessFor(uid) {
  if (!access.has(uid)) {
    access.set(uid, {
      accountStatus: 'inactive',
      suspensionUntil: null,
      ownBlockedIds: new Set(),
      blockedByIds: new Set(),
      updatedAt: new Date()
    });
  }
  return access.get(uid);
}

async function copyCollection(sourceName, targetName, transform) {
  let copied = 0;
  let batch = mirrorDb.batch();
  let pending = 0;
  await forEachDocument(sourceDb.collection(sourceName), async (document) => {
    const safe = transform(document.data(), document.id);
    if (!safe) return;
    const sourceVersion = timestampKey(document.updateTime);
    batch.set(mirrorDb.doc(`${targetName}/${document.id}`), safe, { merge: true });
    if (sourceVersion) {
      batch.set(mirrorDb.doc(`_syncState/${targetName}__${document.id}`), { versionKey: sourceVersion, deleted: false });
      pending += 1;
    }
    copied += 1;
    pending += 1;
    if (pending >= 450) {
      await batch.commit();
      batch = mirrorDb.batch();
      pending = 0;
    }
  });
  if (pending) await batch.commit();
  return copied;
}

const profileCount = await copyCollection('publicProfiles', 'publicProfiles', publicProfile);
const postCount = await copyCollection('posts', 'posts', (data) => publicPost(data));

let userCount = 0;
let blockCount = 0;
const userWrites = [];
const blockVersions = new Map();
const userVersions = new Map();
await forEachDocument(sourceDb.collection('users'), async (document) => {
  const uid = document.id;
  const status = normalizeAccountStatus(document.data());
  Object.assign(accessFor(uid), status, { updatedAt: new Date() });
  const userVersion = timestampKey(document.updateTime);
  if (userVersion) userVersions.set(uid, userVersion);
  userCount += 1;

  await forEachDocument(
    sourceDb.collection('users').doc(uid).collection('blocked'),
    async (blockedDocument) => {
      const blockedUid = blockedDocument.id;
      if (blockedUid === uid) return;
      accessFor(uid).ownBlockedIds.add(blockedUid);
      accessFor(blockedUid).blockedByIds.add(uid);
      const blockVersion = timestampKey(blockedDocument.updateTime);
      if (blockVersion) blockVersions.set(`${uid}__${blockedUid}`, blockVersion);
      blockCount += 1;
    }
  );
});

for (const [uid, state] of access.entries()) {
  userWrites.push([mirrorDb.doc(`viewerAccess/${uid}`), {
    accountStatus: state.accountStatus,
    suspensionUntil: state.suspensionUntil,
    ownBlockedIds: [...state.ownBlockedIds].sort(),
    blockedByIds: [...state.blockedByIds].sort(),
    updatedAt: state.updatedAt
  }]);
  const sourceVersion = userVersions.get(uid);
  if (sourceVersion) {
    userWrites.push([mirrorDb.doc(`_syncState/viewerAccess__${uid}`), { versionKey: sourceVersion, deleted: false }]);
  }
}
const accessCount = await writeInBatches(userWrites);

const edgeWrites = [];
for (const [uid, state] of access.entries()) {
  for (const blockedUid of state.ownBlockedIds) {
    edgeWrites.push([
      mirrorDb.doc(`blockEdges/${uid}__${blockedUid}`),
      { blockerUid: uid, blockedUid, exists: true, eventMillis: 0, ...(blockVersions.has(`${uid}__${blockedUid}`) ? { eventVersion: blockVersions.get(`${uid}__${blockedUid}`) } : {}) }
    ]);
  }
}
const edgeCount = await writeInBatches(edgeWrites);

console.log(JSON.stringify({
  sourceProjectId,
  mirrorProjectId,
  publicProfilesCopied: profileCount,
  postsCopied: postCount,
  viewerAccessRecords: accessCount,
  blockEdges: edgeCount,
  sourceUsersScanned: userCount,
  blockRelationshipsScanned: blockCount
}, null, 2));
