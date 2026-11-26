import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFirestoreFields, decodeFirestoreValue, filterBlockedItems, isAccountActive } from './src/index.js';

test('decodes Firestore scalar, array, and map fields', () => {
  assert.deepEqual(decodeFirestoreFields({
    name: { stringValue: 'FACEBOOM' },
    count: { integerValue: '12' },
    enabled: { booleanValue: true },
    createdAt: { timestampValue: '2026-11-26T00:00:00Z' },
    tags: { arrayValue: { values: [{ stringValue: 'web' }, { stringValue: 'social' }] } },
    profile: { mapValue: { fields: { country: { stringValue: 'Nigeria' } } } }
  }), {
    name: 'FACEBOOM',
    count: 12,
    enabled: true,
    createdAt: '2026-11-26T00:00:00Z',
    tags: ['web', 'social'],
    profile: { country: 'Nigeria' }
  });
  assert.equal(decodeFirestoreValue({ nullValue: null }), null);
});

test('removes own posts, blocked authors, and members who blocked the viewer', () => {
  const posts = [
    { id: '1', authorId: 'alice' },
    { id: '2', authorId: 'bob' },
    { id: '3', authorId: 'carol' },
    { id: '4', authorId: 'dave' }
  ];
  assert.deepEqual(
    filterBlockedItems(posts, ['bob'], ['carol'], 'alice'),
    [{ id: '1', authorId: 'alice' }, { id: '4', authorId: 'dave' }]
  );
});

test('filters directory profiles by their uid field', () => {
  const profiles = [
    { uid: 'alice' },
    { uid: 'bob' },
    { uid: 'carol' },
    { uid: 'dave' }
  ];
  assert.deepEqual(
    filterBlockedItems(profiles, ['bob'], ['carol'], 'alice', 'uid'),
    [{ uid: 'dave' }]
  );
});


test('directory visibility fails closed for inactive or missing accounts', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(isAccountActive({ accountStatus: 'active' }, now), true);
  assert.equal(isAccountActive({ accountStatus: 'inactive' }, now), false);
  assert.equal(isAccountActive({ accountStatus: 'banned' }, now), false);
  assert.equal(isAccountActive({ accountStatus: 'suspended', suspensionUntil: '2026-11-27T00:00:00Z' }, now), false);
  assert.equal(isAccountActive({ accountStatus: 'suspended', suspensionUntil: '2026-11-25T00:00:00Z' }, now), true);
  assert.equal(isAccountActive(undefined, now), false);
});
