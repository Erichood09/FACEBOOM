import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from './firebase';

const conversationIdFor = (a, b) => [a, b].sort().join('_');

export default function MessagesPanel({ user, profile, onBack }) {
  const [people, setPeople] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPeople() {
      try {
        const snap = await getDocs(collection(db, 'publicProfiles'));
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
  }, [user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setConversations(rows);
    }, (err) => {
      console.error('Load conversations:', err);
      setError('Unable to load your inbox. Check your Firestore rules.');
    });
  }, [user.uid]);

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return people;
    return people.filter((person) =>
      `${person.fullName || ''} ${person.username || ''} ${person.country || ''}`
        .toLowerCase().includes(term)
    );
  }, [people, search]);

  const selectedConversation = selectedPerson
    ? conversations.find((item) => item.id === conversationIdFor(user.uid, selectedPerson.uid))
    : null;

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
      setError('Unable to load this conversation.');
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

    setSending(true);
    setError('');
    try {
      const conversationId = conversationIdFor(user.uid, selectedPerson.uid);
      const conversationRef = doc(db, 'conversations', conversationId);
      const participants = [user.uid, selectedPerson.uid].sort();

      // Merge creates a new conversation or updates the existing one without
      // requiring a read of a conversation that may not exist yet.
      await setDoc(conversationRef, {
        participants,
        createdBy: user.uid,
        lastMessage: text,
        lastSenderId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: profile.fullName || user.email || 'FACEBOOM Member',
        createdAt: serverTimestamp()
      });
      setDraft('');
    } catch (err) {
      console.error('Send message:', err);
      setError(err.message || 'Unable to send your message. Check your Firestore rules.');
    } finally {
      setSending(false);
    }
  }

  function openConversation(conversation) {
    const otherUid = conversation.participants.find((uid) => uid !== user.uid);
    const person = people.find((item) => item.uid === otherUid);
    setSelectedPerson(person || { uid: otherUid, fullName: 'FACEBOOM Member', username: '' });
    setError('');
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
          {conversations.length === 0 && <p style={{ color: '#666' }}>No conversations yet. Search for a member below to send the first message.</p>}
          {conversations.map((conversation) => {
            const otherUid = conversation.participants.find((uid) => uid !== user.uid);
            const person = people.find((item) => item.uid === otherUid);
            const active = selectedPerson?.uid === otherUid;
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
            <button key={person.uid} type="button" onClick={() => { setSelectedPerson(person); setError(''); }} style={{ ...(selectedPerson?.uid === person.uid ? activeStyle : buttonStyle), display: 'block', width: '100%', textAlign: 'left', marginBottom: 7 }}>
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
              </div>
              <div style={{ flex: 1, minHeight: 280, maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, padding: '4px 2px' }}>
                {!selectedConversation && <p style={{ color: '#666', textAlign: 'center' }}>This is the start of your conversation. Send a message when you're ready.</p>}
                {messages.map((message) => {
                  const mine = message.senderId === user.uid;
                  return <div key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? '#e7f1ff' : '#f1f3f5', padding: '9px 12px', borderRadius: 12, overflowWrap: 'anywhere' }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{mine ? 'You' : (message.senderName || selectedPerson.fullName)}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
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
