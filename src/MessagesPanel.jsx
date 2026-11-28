import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import SafetyActions from './SafetyActions';

const conversationIdFor = (a, b) => [a, b].sort().join('_');

function inboxSummary(userUid, otherUid, conversationId, conversation) {
  return {
    conversationId,
    participants: [userUid, otherUid].sort(),
    otherUid,
    lastMessage: conversation.lastMessage || '',
    lastSenderId: conversation.lastSenderId || '',
    updatedAt: serverTimestamp()
  };
}

export default function MessagesPanel({ user, profile, onBack }) {
  const [people, setPeople] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ownBlocks = [];
    let incomingBlocks = [];
    const updateHiddenMembers = () => {
      setBlockedUserIds([...new Set([...ownBlocks, ...incomingBlocks])]);
    };
    const unsubscribeOwn = onSnapshot(collection(db, 'users', user.uid, 'blocked'), (snap) => {
      ownBlocks = snap.docs.map((item) => item.id);
      updateHiddenMembers();
    }, (err) => console.error('Load block list:', err));
    const unsubscribeIncoming = onSnapshot(collection(db, 'users', user.uid, 'blockedBy'), (snap) => {
      incomingBlocks = snap.docs.map((item) => item.id);
      updateHiddenMembers();
    }, (err) => console.error('Load incoming block list:', err));
    return () => {
      unsubscribeOwn();
      unsubscribeIncoming();
    };
  }, [user.uid]);

  useEffect(() => {
    let active = true;
    async function loadPeople() {
      try {
        const directory = collection(db, 'publicProfiles');
        const directoryQuery = blockedUserIds.length > 0 && blockedUserIds.length <= 30
          ? query(directory, where(documentId(), 'not-in', blockedUserIds))
          : directory;
        const snap = await getDocs(directoryQuery);
        if (!active) return;
        setPeople(snap.docs
          .filter((item) => item.id !== user.uid)
          .map((item) => ({ uid: item.id, ...item.data() })));
      } catch (err) {
        console.error('Load message directory:', err);
        if (active) setError('Unable to load members. Check your Firestore rules.');
      } finally {
        if (active) setLoadingPeople(false);
      }
    }
    loadPeople();
    return () => { active = false; };
  }, [user.uid, blockedUserIds]);

  useEffect(() => {
    if (selectedPerson && blockedUserIds.includes(selectedPerson.uid)) {
      setSelectedPerson(null);
      setMessages([]);
      setError('This member is blocked. You can manage blocked members in Find Friends.');
    }
  }, [blockedUserIds, selectedPerson]);

  // The inbox query is scoped to the signed-in member's own path. Firestore
  // can authorize this query without trying to filter cross-user block records.
  useEffect(() => {
    const inboxQuery = query(
      collection(db, 'users', user.uid, 'inbox'),
      orderBy('updatedAt', 'desc')
    );
    return onSnapshot(inboxQuery, (snap) => {
      setConversations(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => {
      console.error('Load inbox:', err);
      setError(`Inbox error (${err.code || 'unknown'}): ${err.message || 'Unable to load your inbox.'}`);
    });
  }, [user.uid]);

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    const availablePeople = people.filter((person) => !blockedUserIds.includes(person.uid));
    if (!term) return availablePeople;
    return availablePeople.filter((person) =>
      `${person.fullName || ''} ${person.username || ''} ${person.country || ''}`
        .toLowerCase().includes(term)
    );
  }, [people, search, blockedUserIds]);

  const visibleConversations = conversations.filter(
    (conversation) => conversation.otherUid && !blockedUserIds.includes(conversation.otherUid)
  );

  const selectedConversation = selectedPerson
    ? conversations.find((item) => item.id === conversationIdFor(user.uid, selectedPerson.uid))
    : null;

  async function openPerson(person) {
    if (!person || blockedUserIds.includes(person.uid)) return;
    setSelectedPerson(person);
    setMessages([]);
    setError('');

    // Lazy migration: when a member opens an older conversation, create the
    // two owner-scoped inbox summaries so it appears in both inboxes.
    try {
      const conversationId = conversationIdFor(user.uid, person.uid);
      const conversationRef = doc(db, 'conversations', conversationId);
      const existing = await getDoc(conversationRef);
      if (existing.exists()) {
        const data = existing.data();
        const batch = writeBatch(db);
        batch.set(
          doc(db, 'users', user.uid, 'inbox', conversationId),
          inboxSummary(user.uid, person.uid, conversationId, data)
        );
        batch.set(
          doc(db, 'users', person.uid, 'inbox', conversationId),
          inboxSummary(person.uid, user.uid, conversationId, data)
        );
        await batch.commit();
      }
    } catch (err) {
      // Opening a new chat has no conversation to migrate. A blocked or
      // inaccessible old conversation will show a clear message on send.
      console.info('Inbox migration skipped:', err.code || err.message);
    }
  }

  useEffect(() => {
    if (!selectedPerson || !selectedConversation) {
      setMessages([]);
      return undefined;
    }
    const messagesQuery = query(
      collection(db, 'conversations', selectedConversation.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(messagesQuery, (snap) => {
      setMessages(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => {
      console.error('Load messages:', err);
      setError('Unable to load this conversation. It may be blocked or unavailable.');
    });
  }, [selectedPerson, selectedConversation?.id]);

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedPerson || sending) return;
    if (text.length > 4000) {
      setError('Messages must be 4,000 characters or fewer.');
      return;
    }
    if (blockedUserIds.includes(selectedPerson.uid)) {
      setError('You cannot message a member you have blocked.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const otherUid = selectedPerson.uid;
      const conversationId = conversationIdFor(user.uid, otherUid);
      const conversationRef = doc(db, 'conversations', conversationId);
      const existing = await getDoc(conversationRef);
      const participants = [user.uid, otherUid].sort();
      const batch = writeBatch(db);

      if (!existing.exists()) {
        batch.set(conversationRef, {
          participants,
          createdBy: user.uid,
          lastMessage: text,
          lastSenderId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        batch.update(conversationRef, {
          lastMessage: text,
          lastSenderId: user.uid,
          updatedAt: serverTimestamp()
        });
      }

      const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
      batch.set(messageRef, {
        text,
        senderId: user.uid,
        senderName: profile.fullName || user.email || 'FACEBOOM Member',
        createdAt: serverTimestamp()
      });

      const summary = {
        conversationId,
        participants,
        lastMessage: text,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp()
      };
      batch.set(doc(db, 'users', user.uid, 'inbox', conversationId), {
        ...summary,
        otherUid
      });
      batch.set(doc(db, 'users', otherUid, 'inbox', conversationId), {
        ...summary,
        otherUid: user.uid
      });
      const notificationRef = doc(collection(db, 'users', otherUid, 'notifications'));
      batch.set(notificationRef, {
        type: 'new_message',
        actorUid: user.uid,
        recipientUid: otherUid,
        actorName: profile.fullName || user.email || 'FACEBOOM Member',
        actorUsername: profile.username || '',
        conversationId,
        messageId: messageRef.id,
        createdAt: serverTimestamp(),
        readAt: null
      });

      await batch.commit();
      setDraft('');
    } catch (err) {
      console.error('Send message:', err);
      setError(err.message || 'Unable to send your message. Check your Firestore rules.');
    } finally {
      setSending(false);
    }
  }

  function openConversation(conversation) {
    const person = people.find((item) => item.uid === conversation.otherUid);
    openPerson(person || {
      uid: conversation.otherUid,
      fullName: 'FACEBOOM Member',
      username: ''
    });
  }

  const panelStyle = { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 };
  const buttonStyle = { border: '1px solid #d0d7de', background: '#f6f8fa', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
  const activeStyle = { ...buttonStyle, background: '#e7f1ff', borderColor: '#1877f2' };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: '#1877f2', margin: '4px 0 14px' }}>Private Messages</h2>
        <button type="button" style={buttonStyle} onClick={onBack}>Back to Home</button>
      </div>
      {error && <p style={{ color: '#b42318' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 0.85fr) minmax(280px, 1.5fr)', gap: 14 }}>
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Your Inbox</h3>
          {visibleConversations.length === 0 && <p style={{ color: '#666' }}>No conversations yet. Search for a member below to send the first message.</p>}
          {visibleConversations.map((conversation) => {
            const person = people.find((item) => item.uid === conversation.otherUid);
            const active = selectedPerson?.uid === conversation.otherUid;
            return (
              <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} style={{ ...(active ? activeStyle : buttonStyle), display: 'block', width: '100%', textAlign: 'left', marginBottom: 8 }}>
                <strong>{person?.fullName || 'FACEBOOM Member'}</strong>
                <span style={{ display: 'block', color: '#666', fontSize: 13, overflowWrap: 'anywhere' }}>{conversation.lastMessage || 'Open conversation'}</span>
              </button>
            );
          })}
          <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '16px 0' }} />
          <h3>Message anyone</h3>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username or country" style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #ccc', borderRadius: 8, marginBottom: 10 }} />
          {loadingPeople ? <p>Loading members...</p> : filteredPeople.length === 0 ? <p style={{ color: '#666' }}>No matching members found.</p> : filteredPeople.slice(0, 50).map((person) => (
            <button key={person.uid} type="button" onClick={() => openPerson(person)} style={{ ...(selectedPerson?.uid === person.uid ? activeStyle : buttonStyle), display: 'block', width: '100%', textAlign: 'left', marginBottom: 7 }}>
              <strong>{person.fullName || 'FACEBOOM Member'}</strong>
              <span style={{ display: 'block', color: '#666', fontSize: 12 }}>@{person.username || 'member'} {person.country ? `· ${person.country}` : ''}</span>
            </button>
          ))}
        </div>

        <div style={{ ...panelStyle, minHeight: 440, display: 'flex', flexDirection: 'column' }}>
          {!selectedPerson ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#666' }}>
              <h3>Select a member</h3>
              <p>Choose someone from the list to start a private conversation.</p>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 12 }}>
                <strong>{selectedPerson.fullName || 'FACEBOOM Member'}</strong>
                <div style={{ color: '#666', fontSize: 13 }}>Private conversation</div>
                <SafetyActions user={user} targetUid={selectedPerson.uid} targetName={selectedPerson.fullName} contentType="account" contentId={selectedPerson.uid} />
              </div>
              <div style={{ flex: 1, minHeight: 280, maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, padding: '4px 2px' }}>
                {!selectedConversation && <p style={{ color: '#666', textAlign: 'center' }}>This is the start of your conversation. Send a message when you're ready.</p>}
                {messages.map((message) => {
                  const mine = message.senderId === user.uid;
                  return <div key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? '#e7f1ff' : '#f1f3f5', padding: '9px 12px', borderRadius: 12, overflowWrap: 'anywhere' }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{mine ? 'You' : (message.senderName || selectedPerson.fullName)}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
                    {!mine && <SafetyActions user={user} targetUid={message.senderId} targetName={message.senderName || selectedPerson.fullName} contentType="message" contentId={message.id} />}
                  </div>;
                })}
              </div>
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Write a private message..." style={{ flex: 1, minWidth: 0, padding: 11, border: '1px solid #ccc', borderRadius: 8 }} />
                <button type="submit" disabled={sending || !draft.trim()} style={{ ...buttonStyle, background: '#1877f2', color: '#fff', borderColor: '#1877f2', opacity: sending || !draft.trim() ? 0.6 : 1 }}>{sending ? 'Sending...' : 'Send'}</button>
              </form>
            </>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 680px) { section > div:nth-of-type(2) { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
