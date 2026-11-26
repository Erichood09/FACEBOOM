import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowlistedFields,
  applyBlockEdge,
  normalizeAccountStatus,
  publicPost,
  publicProfile
} from '../src/mirror.js';

test('public profile copies only the explicit public allowlist', () => {
  assert.deepEqual(publicProfile({
    fullName: 'A Member',
    username: 'member',
    email: 'private@example.com',
    moderationReason: 'private',
    photoURL: 'https://example.test/avatar.png'
  }, 'uid-1'), {
    uid: 'uid-1',
    fullName: 'A Member',
    username: 'member',
    photoURL: 'https://example.test/avatar.png'
  });
});

test('post mirror rejects missing authors and excludes internal fields', () => {
  assert.equal(publicPost({ text: 'orphan', moderationState: 'review' }), null);
  assert.deepEqual(publicPost({
    authorId: 'uid-1',
    authorName: 'A Member',
    text: 'Hello',
    mediaPublicId: 'private-cloudinary-id',
    moderationState: 'clear'
  }), { authorId: 'uid-1', authorName: 'A Member', text: 'Hello' });
});

test('account status is normalized and private fields are not copied', () => {
  assert.deepEqual(normalizeAccountStatus({
    accountStatus: 'suspended',
    suspensionUntil: '2026-12-01T00:00:00Z',
    email: 'private@example.com'
  }), {
    accountStatus: 'suspended',
    suspensionUntil: '2026-12-01T00:00:00Z'
  });
  assert.deepEqual(normalizeAccountStatus({}), {
    accountStatus: 'inactive',
    suspensionUntil: null
  });
  assert.deepEqual(normalizeAccountStatus({ accountStatus: 'unexpected' }), {
    accountStatus: 'inactive',
    suspensionUntil: null
  });
});

test('block edge updates both sides idempotently', () => {
  const empty = { ownBlockedIds: [], blockedByIds: [] };
  const blocked = applyBlockEdge(empty, 'alice', 'bob', true);
  assert.deepEqual(blocked, { ownBlockedIds: ['bob'], blockedByIds: ['alice'] });
  assert.deepEqual(applyBlockEdge(blocked, 'alice', 'bob', true), blocked);
  assert.deepEqual(applyBlockEdge(blocked, 'alice', 'bob', false), {
    ownBlockedIds: [],
    blockedByIds: []
  });
});

test('allowlist helper rejects non-record inputs', () => {
  assert.equal(allowlistedFields(null, ['uid']), null);
  assert.equal(allowlistedFields(['uid'], ['uid']), null);
});
