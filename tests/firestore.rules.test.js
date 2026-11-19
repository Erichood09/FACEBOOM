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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
  writeBatch,
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

test('members can update profile fields but cannot change the stored authentication email', async () => {
  await seed('users/alice', {
    fullName: 'Alice',
    username: 'alice',
    country: 'Nigeria',
    bio: '',
    email: 'alice@example.com',
    accountStatus: 'active',
  });
  const aliceDb = testEnv.authenticatedContext('alice').firestore();

  await assertSucceeds(updateDoc(doc(aliceDb, 'users/alice'), {
    bio: 'Hello FACEBOOM',
  }));
  await assertFails(updateDoc(doc(aliceDb, 'users/alice'), {
    email: 'attacker@example.com',
  }));
});

test('a member can read a public profile unless either member has blocked the other', async () => {
  await seed('publicProfiles/bob', { uid: 'bob', fullName: 'Bob' });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'publicProfiles/bob')));

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

test('the inbox query works from the owner path and is denied to other members', async () => {
  await seed('conversations/alice_bob', {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await seed('users/alice/inbox/alice_bob', {
    conversationId: 'alice_bob',
    participants: ['alice', 'bob'],
    otherUid: 'bob',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    updatedAt: new Date(),
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  await assertSucceeds(getDocs(collection(aliceDb, 'users', 'alice', 'inbox')));
  await assertFails(getDocs(collection(bobDb, 'users', 'alice', 'inbox')));
  await assertSucceeds(getDoc(doc(aliceDb, 'conversations/alice_bob')));
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

  await seed('users/bob/blocked/alice', { uid: 'alice' });
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob')));
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob/messages/message-1')));
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

test('a block batch can remove both inbox summaries atomically', async () => {
  await seed('conversations/alice_bob', {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const aliceInbox = {
    conversationId: 'alice_bob',
    participants: ['alice', 'bob'],
    otherUid: 'bob',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    updatedAt: new Date(),
  };
  const bobInbox = { ...aliceInbox, otherUid: 'alice' };
  await seed('users/alice/inbox/alice_bob', aliceInbox);
  await seed('users/bob/inbox/alice_bob', bobInbox);

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const batch = writeBatch(aliceDb);
  batch.set(doc(aliceDb, 'users/alice/blocked/bob'), {
    uid: 'bob',
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(aliceDb, 'users/alice/inbox/alice_bob'));
  batch.delete(doc(aliceDb, 'users/bob/inbox/alice_bob'));

  await assertSucceeds(batch.commit());
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob')));
});



test('a persisted block allows later cleanup of both inbox summaries', async () => {
  await seed('conversations/alice_bob', {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const summary = {
    conversationId: 'alice_bob',
    participants: ['alice', 'bob'],
    lastMessage: 'Hello',
    lastSenderId: 'alice',
    updatedAt: new Date(),
  };
  await seed('users/alice/inbox/alice_bob', { ...summary, otherUid: 'bob' });
  await seed('users/bob/inbox/alice_bob', { ...summary, otherUid: 'alice' });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice/blocked/bob'), {
    uid: 'bob',
    createdAt: serverTimestamp(),
  }));

  const cleanup = writeBatch(aliceDb);
  cleanup.delete(doc(aliceDb, 'users/alice/inbox/alice_bob'));
  cleanup.delete(doc(aliceDb, 'users/bob/inbox/alice_bob'));
  await assertSucceeds(cleanup.commit());
  await assertFails(getDoc(doc(aliceDb, 'conversations/alice_bob')));
});


test('reports are private to their reporter and moderators, and only moderators can update them', async () => {
  await seed('reports/report-1', {
    reporterId: 'alice',
    targetUid: 'bob',
    contentType: 'account',
    contentId: 'bob',
    reason: 'harassment',
    details: 'Repeated abusive messages',
    status: 'open',
    createdAt: new Date(),
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  const moderatorDb = testEnv.authenticatedContext('mod', { moderator: true }).firestore();

  await assertSucceeds(getDoc(doc(aliceDb, 'reports/report-1')));
  await assertFails(getDoc(doc(bobDb, 'reports/report-1')));
  await assertSucceeds(getDoc(doc(moderatorDb, 'reports/report-1')));

  // Reporters can query only their own reports; moderators can review the queue.
  await assertSucceeds(getDocs(query(
    collection(aliceDb, 'reports'),
    where('reporterId', '==', 'alice')
  )));
  await assertFails(getDocs(query(
    collection(bobDb, 'reports'),
    where('reporterId', '==', 'alice')
  )));
  await assertSucceeds(getDocs(query(collection(moderatorDb, 'reports'))));

  await assertFails(setDoc(doc(bobDb, 'reports/fake-report'), {
    reporterId: 'alice',
    targetUid: 'bob',
    contentType: 'account',
    contentId: 'bob',
    reason: 'spam',
    details: '',
    status: 'open',
    createdAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(aliceDb, 'reports/report-1'), {
    reporterId: 'alice',
    targetUid: 'bob',
    contentType: 'account',
    contentId: 'bob',
    reason: 'harassment',
    details: 'Changed by reporter',
    status: 'resolved',
    createdAt: new Date(),
  }));

  await assertSucceeds(updateDoc(doc(moderatorDb, 'reports/report-1'), {
    status: 'resolved',
    moderatorNote: 'Reviewed',
    resolvedAt: serverTimestamp(),
  }));
});

test('a first message and both inbox summaries can be created atomically', async () => {
  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const conversationId = 'alice_bob';
  const conversationRef = doc(aliceDb, 'conversations', conversationId);
  const batch = writeBatch(aliceDb);

  batch.set(conversationRef, {
    participants: ['alice', 'bob'],
    createdBy: 'alice',
    lastMessage: 'First hello',
    lastSenderId: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(aliceDb, 'conversations', conversationId, 'messages', 'first-message'), {
    text: 'First hello',
    senderId: 'alice',
    senderName: 'Alice',
    createdAt: serverTimestamp(),
  });

  for (const [ownerUid, otherUid] of [['alice', 'bob'], ['bob', 'alice']]) {
    batch.set(doc(aliceDb, 'users', ownerUid, 'inbox', conversationId), {
      conversationId,
      participants: ['alice', 'bob'],
      otherUid,
      lastMessage: 'First hello',
      lastSenderId: 'alice',
      updatedAt: serverTimestamp(),
    });
  }

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDocs(collection(aliceDb, 'users', 'alice', 'inbox')));
});
