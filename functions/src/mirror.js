export const PROFILE_FIELDS = [
  'uid', 'fullName', 'username', 'country', 'bio',
  'photoURL', 'coverPhotoURL', 'updatedAt'
];

export const POST_FIELDS = [
  'authorId', 'authorName', 'authorUsername', 'text',
  'mediaUrl', 'mediaType', 'createdAt'
];

export function allowlistedFields(data, fields) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(data, field))
      .map((field) => [field, data[field]])
  );
}

export function publicProfile(data, uid) {
  const safe = allowlistedFields(data, PROFILE_FIELDS);
  if (!safe) return null;
  return { ...safe, uid };
}

export function publicPost(data) {
  const safe = allowlistedFields(data, POST_FIELDS);
  if (!safe || typeof safe.authorId !== 'string' || !safe.authorId) return null;
  if (typeof safe.text !== 'string') safe.text = '';
  if (safe.mediaType && !['image', 'video'].includes(safe.mediaType)) {
    delete safe.mediaType;
    delete safe.mediaUrl;
  }
  return safe;
}

export function normalizeAccountStatus(data = {}) {
  const status = ['active', 'suspended', 'banned'].includes(data.accountStatus)
    ? data.accountStatus
    : 'inactive';
  return {
    accountStatus: status,
    suspensionUntil: data.suspensionUntil ?? null
  };
}

export function applyBlockEdge(current, blockerUid, blockedUid, exists) {
  const ownBlockedIds = new Set(current?.ownBlockedIds || []);
  const blockedByIds = new Set(current?.blockedByIds || []);
  if (exists) {
    ownBlockedIds.add(blockedUid);
    blockedByIds.add(blockerUid);
  } else {
    ownBlockedIds.delete(blockedUid);
    blockedByIds.delete(blockerUid);
  }
  return {
    ownBlockedIds: [...ownBlockedIds].sort(),
    blockedByIds: [...blockedByIds].sort()
  };
}


function normalizeVersionKey(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(.*?)(?:\\.(\\d+))?Z$/);
  if (!match) return null;
  return `${match[1]}.${(match[2] || '').padEnd(9, '0').slice(0, 9)}Z`;
}

export function shouldApplyMirrorVersion(currentVersion, incomingVersion) {
  if (typeof incomingVersion === 'number') {
    return Number.isFinite(incomingVersion) && incomingVersion > Number(currentVersion || 0);
  }
  const incoming = normalizeVersionKey(incomingVersion);
  if (!incoming) return false;
  if (typeof currentVersion === 'number') return Date.parse(incoming) > currentVersion;
  const current = normalizeVersionKey(currentVersion);
  return !current || incoming > current;
}

// A persistent per-document version record prevents delayed/retried events
// from resurrecting a deleted document or overwriting a newer mirror value.
export async function writeVersionedMirrorDocument(db, collection, id, data, versionKey, merge = false) {
  const targetRef = db.doc(`${collection}/${id}`);
  const stateRef = db.doc(`_syncState/${collection}__${id}`);
  return db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef);
    const currentVersion = state.exists ? state.get('versionKey') : null;
    if (!shouldApplyMirrorVersion(currentVersion, versionKey)) return false;
    if (data === null) transaction.delete(targetRef);
    else transaction.set(targetRef, data, ...(merge ? [{ merge: true }] : []));
    transaction.set(stateRef, { versionKey, deleted: data === null });
    return true;
  });
}
