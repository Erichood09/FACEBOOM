import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-faceboom',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test('a member can read a public profile unless either member has blocked the other', async () => {
  await seed('publicProfiles/bob', { uid: 'bob', fullName: 'Bob' });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'publicProfiles/bob')));

  // Firestore cannot filter query results using the cross-user block lookup in this list rule.
  // The current participants-array inbox query must be tested even before any block exists.
  await assertFails(getDocs(query(
    collection(aliceDb, 'conversations'),
    where('participants', 'array-contains', 'alice'),
  )));

  await seed('users/bob/blocked/alice', { uid: 'alice' });
  await assertFails(getDoc(doc(aliceDb, 'publicProfiles/bob')));
});

test('a blocked member cannot directly open another member post', async () => {
  await seed('posts/post-1', { authorId: 'bob', text: 'Hello' });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'posts/post-1')));

  await seed('users/alice/blocked/bob', { uid: 'bob' });
  await assertFails(getDoc(doc(aliceDb, 'posts/post-1')));
});

test('blocking either participant denies conversation and message-history reads', async () => {
  await seed('conversations/alice_bob', {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await seed('conversations/alice_bob/messages/message-1', {
    text: 'Hello',
    senderId: 'alice',
    senderName: 'Alice',
    createdAt: new Date(),
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'conversations/alice_bob')));
  await assertSucceeds(getDoc(doc(aliceDb, 'conversations/alice_bob/messages/message-1')));

  // Firestore cannot filter query results using the cross-user block lookup in this list rule.
  // Verify the current inbox query before any block exists.
  await assertFails(getDocs(query(
    collection(aliceDb, 'conversations'),
    where('participants', 'array-contains', 'alice'),
  )));

  await seed('users/bob/blocked/alice', { uid: 'alice' });
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob')));
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob/messages/message-1')));
  await assertFails(getDocs(query(
    collection(aliceDb, 'conversations'),
    where('participants', 'array-contains', 'alice'),
  )));
});


test('blocking prevents new likes and comments on the other member posts', async () => {
  await seed('posts/post-2', { authorId: 'bob', text: 'Post' });
  await seed('posts/post-3', { authorId: 'bob', text: 'Another post' });
  const aliceDb = testEnv.authenticatedContext('alice').firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'posts/post-2/likes/alice'), {
    userId: 'alice',
  }));
  await assertSucceeds(setDoc(doc(aliceDb, 'posts/post-2/comments/comment-before-block'), {
    authorId: 'alice',
    text: 'A valid comment',
    createdAt: new Date(),
  }));

  await seed('users/bob/blocked/alice', { uid: 'alice' });
  await assertFails(setDoc(doc(aliceDb, 'posts/post-3/likes/alice'), {
    userId: 'alice',
  }));
  await assertFails(setDoc(doc(aliceDb, 'posts/post-2/comments/comment-after-block'), {
    authorId: 'alice',
    text: 'This should be denied',
    createdAt: new Date(),
  }));
});

test('blocking prevents new friend requests and new messages', async () => {
  await seed('conversations/alice_bob', {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const aliceDb = testEnv.authenticatedContext('alice').firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'friendRequests/alice_bob'), {
    fromUid: 'alice',
    toUid: 'bob',
    status: 'pending',
  }));

  await assertSucceeds(setDoc(doc(aliceDb, 'conversations/alice_bob/messages/message-before-block'), {
    text: 'Hello',
    senderId: 'alice',
    senderName: 'Alice',
    createdAt: serverTimestamp(),
  }));

  await seed('users/bob/blocked/alice', { uid: 'alice' });

  await assertFails(setDoc(doc(aliceDb, 'friendRequests/alice_bob-2'), {
    fromUid: 'alice',
    toUid: 'bob',
    status: 'pending',
  }));
  await assertFails(setDoc(doc(aliceDb, 'conversations/alice_bob/messages/message-after-block'), {
    text: 'This should be denied',
    senderId: 'alice',
    senderName: 'Alice',
    createdAt: serverTimestamp(),
  }));
});
