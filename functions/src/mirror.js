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
