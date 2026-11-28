import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  documentId,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import SafetyActions from './SafetyActions';
import ShareActions from './ShareActions';

const publicProfile = (data, uid) => ({
  uid,
  fullName: data.fullName || 'FACEBOOM User',
  username: data.username || '',
  country: data.country || '',
  bio: data.bio || '',
  photoURL: data.photoURL || '',
  coverPhotoURL: data.coverPhotoURL || ''
});

export default function FriendsPanel({ user, profile, onBack }) {
  const [activeTab, setActiveTab] = useState('discover');
  const [searchText, setSearchText] = useState('');
  const [people, setPeople] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [blockedByUserIds, setBlockedByUserIds] = useState([]);
  const [blockedPeople, setBlockedPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribeOwn = onSnapshot(collection(db, 'users', user.uid, 'blocked'), (snapshot) => {
      setBlockedUserIds(snapshot.docs.map((item) => item.id));
    }, (err) => setError(err.message || 'Unable to load your block list.'));
    const unsubscribeIncoming = onSnapshot(collection(db, 'users', user.uid, 'blockedBy'), (snapshot) => {
      setBlockedByUserIds(snapshot.docs.map((item) => item.id));
    }, (err) => setError(err.message || 'Unable to load incoming block relationships.'));
    return () => {
      unsubscribeOwn();
      unsubscribeIncoming();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const incomingQuery = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid)
    );
    const outgoingQuery = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', user.uid)
    );
    const friendsRef = collection(db, 'users', user.uid, 'friends');

    const unsubIncoming = onSnapshot(incomingQuery, (snapshot) => {
      setIncoming(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending'));
    }, (err) => setError(err.message || 'Unable to load friend requests.'));

    const unsubOutgoing = onSnapshot(outgoingQuery, (snapshot) => {
      setOutgoing(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending'));
    }, (err) => setError(err.message || 'Unable to load sent requests.'));

    const unsubFriends = onSnapshot(friendsRef, (snapshot) => {
      setFriends(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => setError(err.message || 'Unable to load your friends.'));

    return () => {
      unsubIncoming();
      unsubOutgoing();
      unsubFriends();
    };
  }, [user]);

  async function loadPeople() {
    setLoadingPeople(true);
    setError('');
    try {
      const directory = collection(db, 'publicProfiles');
      const hiddenIds = [...new Set([...blockedUserIds, ...blockedByUserIds])];
      const directoryQuery = hiddenIds.length > 0 && hiddenIds.length <= 30
        ? query(directory, where(documentId(), 'not-in', hiddenIds))
        : directory;
      const snapshot = await getDocs(directoryQuery);
      setPeople(snapshot.docs
        .filter((item) => item.id !== user.uid)
        .map((item) => publicProfile(item.data(), item.id)));
    } catch (err) {
      console.error('Find friends error:', err);
      setError('Unable to search for people. Your Firestore access rules may need updating.');
    } finally {
      setLoadingPeople(false);
    }
  }

  useEffect(() => {
    loadPeople();
    // Refresh directory results when either side of a block relationship changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, blockedUserIds, blockedByUserIds]);

  const filteredPeople = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const hiddenIds = new Set([...blockedUserIds, ...blockedByUserIds]);
    const availablePeople = people.filter((person) => !hiddenIds.has(person.uid));
    if (!term) return availablePeople;
    return availablePeople.filter((person) =>
      `${person.fullName} ${person.username} ${person.country}`.toLowerCase().includes(term)
    );
  }, [people, searchText, blockedUserIds, blockedByUserIds]);

  useEffect(() => {
    let active = true;

    async function loadBlockedPeople() {
      if (blockedUserIds.length === 0) {
        setBlockedPeople([]);
        return;
      }

      try {
        // A blocked member's public profile is intentionally unreadable under
        // the security rules. Use the private block record for a safe label.
        const profiles = await Promise.all(blockedUserIds.map(async (uid) => {
          const snapshot = await getDoc(doc(db, 'users', user.uid, 'blocked', uid));
          const data = snapshot.exists() ? snapshot.data() : {};
          return {
            uid,
            fullName: data.fullName || 'FACEBOOM Member',
            username: '',
            country: '',
            bio: '',
            photoURL: '',
            coverPhotoURL: ''
          };
        }));
        if (active) setBlockedPeople(profiles);
      } catch (err) {
        console.error('Load blocked member records:', err);
        if (active) setError('Unable to load your block list. Please refresh the page.');
      }
    }

    loadBlockedPeople();
    return () => { active = false; };
  }, [blockedUserIds]);

  const visibleFriends = friends.filter((friend) =>
    !blockedUserIds.includes(friend.uid || friend.id)
    && !blockedByUserIds.includes(friend.uid || friend.id)
  );

  function isFriend(uid) {
    return friends.some((friend) => friend.uid === uid || friend.id === uid);
  }

  function incomingRequest(uid) {
    return incoming.find((request) => request.fromUid === uid);
  }

  function outgoingRequest(uid) {
    return outgoing.find((request) => request.toUid === uid);
  }

  async function sendRequest(person) {
    setBusyId(person.uid);
    setError('');
    setMessage('');
    try {
      const requestId = `${user.uid}_${person.uid}`;
      const requestRef = doc(db, 'friendRequests', requestId);
      const batch = writeBatch(db);
      batch.set(requestRef, {
        fromUid: user.uid,
        toUid: person.uid,
        fromName: profile.fullName || 'FACEBOOM User',
        fromUsername: profile.username || '',
        fromPhotoURL: profile.photoURL || '',
        fromCountry: profile.country || '',
        toName: person.fullName,
        toUsername: person.username,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      batch.set(doc(collection(db, 'users', person.uid, 'notifications')), {
        type: 'friend_request',
        actorUid: user.uid,
        recipientUid: person.uid,
        requestId,
        actorName: profile.fullName || 'FACEBOOM User',
        actorUsername: profile.username || '',
        createdAt: serverTimestamp(),
        readAt: null
      });
      await batch.commit();
      setMessage(`Friend request sent to ${person.fullName}.`);
    } catch (err) {
      console.error('Send request error:', err);
      setError(err.message || 'Unable to send this friend request.');
    } finally {
      setBusyId('');
    }
  }

  async function acceptRequest(request) {
    setBusyId(request.id);
    setError('');
    setMessage('');
    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, 'friendRequests', request.id);
      const myFriendRef = doc(db, 'users', user.uid, 'friends', request.fromUid);
      const theirFriendRef = doc(db, 'users', request.fromUid, 'friends', user.uid);

      const [myProfileSnapshot, otherProfileSnapshot] = await Promise.all([
        getDoc(doc(db, 'publicProfiles', user.uid)),
        getDoc(doc(db, 'publicProfiles', request.fromUid))
      ]);
      const myProfile = myProfileSnapshot.exists() ? myProfileSnapshot.data() : profile;
      const otherProfileData = otherProfileSnapshot.exists()
        ? otherProfileSnapshot.data()
        : {
            fullName: request.fromName,
            username: request.fromUsername,
            photoURL: request.fromPhotoURL,
            country: request.fromCountry
          };
      const otherProfile = publicProfile(otherProfileData, request.fromUid);
      const myFriendData = publicProfile(myProfile, user.uid);
      const theirFriendData = publicProfile(myProfile, user.uid);

      batch.update(requestRef, { status: 'accepted', respondedAt: serverTimestamp() });
      batch.set(doc(collection(db, 'users', request.fromUid, 'notifications')), {
        type: 'friend_accept',
        actorUid: user.uid,
        recipientUid: request.fromUid,
        actorName: profile.fullName || 'FACEBOOM Member',
        actorUsername: profile.username || '',
        requestId: request.id,
        createdAt: serverTimestamp(),
        readAt: null
      });
      batch.set(myFriendRef, { ...otherProfile, uid: request.fromUid, friendSince: serverTimestamp() });
      batch.set(theirFriendRef, { ...theirFriendData, uid: user.uid, friendSince: serverTimestamp() });
      batch.set(doc(db, 'publicProfiles', user.uid), myFriendData, { merge: true });
      await batch.commit();
      setMessage('Friend request accepted. You are now friends!');
    } catch (err) {
      console.error('Accept request error:', err);
      setError(err.message || 'Unable to accept this request. Check your Firestore rules.');
    } finally {
      setBusyId('');
    }
  }

  async function removeRequest(request) {
    setBusyId(request.id);
    setError('');
    setMessage('');
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      setMessage('Friend request removed.');
    } catch (err) {
      console.error('Remove request error:', err);
      setError(err.message || 'Unable to remove this request.');
    } finally {
      setBusyId('');
    }
  }

  async function removeFriend(friend) {
    const confirmed = window.confirm(`Remove ${friend.fullName || 'this person'} from your friends?`);
    if (!confirmed) return;
    setBusyId(friend.uid || friend.id);
    setError('');
    try {
      const otherUid = friend.uid || friend.id;

      // Remove the accepted request as well as both friendship records.
      // Query only documents where the signed-in user is a participant; this
      // avoids direct reads of possibly-missing request IDs under the current
      // participant-only Firestore read rule.
      const [outgoingRequestsSnapshot, incomingRequestsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'friendRequests'),
          where('fromUid', '==', user.uid)
        )),
        getDocs(query(
          collection(db, 'friendRequests'),
          where('toUid', '==', user.uid)
        ))
      ]);
      const acceptedRequests = [
        ...outgoingRequestsSnapshot.docs,
        ...incomingRequestsSnapshot.docs
      ].filter((requestDoc) => {
        const requestData = requestDoc.data();
        return requestData.status === 'accepted' && (
          (requestData.fromUid === user.uid && requestData.toUid === otherUid) ||
          (requestData.fromUid === otherUid && requestData.toUid === user.uid)
        );
      });

      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', user.uid, 'friends', otherUid));
      batch.delete(doc(db, 'users', otherUid, 'friends', user.uid));
      acceptedRequests.forEach((requestDoc) => batch.delete(requestDoc.ref));
      await batch.commit();
      setMessage('Friend removed. You can send or receive a new friend request later.');
    } catch (err) {
      console.error('Remove friend error:', err);
      setError(err.message || 'Unable to remove this friend.');
    } finally {
      setBusyId('');
    }
  }

  function personCard(person, mode = 'discover') {
    if (mode !== 'blocked' && (blockedUserIds.includes(person.uid) || blockedByUserIds.includes(person.uid))) return null;
    const friend = isFriend(person.uid);
    const incomingItem = incomingRequest(person.uid);
    const outgoingItem = outgoingRequest(person.uid);

    return (
      <div className="fb-person-card" key={person.uid}>
        {person.photoURL ? (
          <img className="fb-person-avatar" src={person.photoURL} alt="" />
        ) : (
          <div className="fb-person-avatar fb-person-avatar-placeholder">
            {(person.fullName || 'F').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="fb-person-info">
          <strong>{person.fullName || 'FACEBOOM User'}</strong>
          {person.username && <span>@{person.username}</span>}
          {person.country && <small>{person.country}</small>}
          {person.bio && <p>{person.bio}</p>}
        </div>
        <div style={{ width: '100%', paddingLeft: 67 }}>
          <ShareActions
            title={`${person.fullName || 'FACEBOOM Member'} on FACEBOOM`}
            text={`Connect with ${person.fullName || 'this member'} on FACEBOOM.`}
            url={`${window.location.origin}${window.location.pathname}?profile=${person.uid}`}
          />
        </div>
        <div className="fb-person-actions">
          <SafetyActions
            user={user}
            targetUid={person.uid}
            targetName={person.fullName}
            contentType="account"
            contentId={person.uid}
          />
          {friend ? (
            <button className="fb-button fb-button-muted" disabled>Friends</button>
          ) : incomingItem ? (
            <>
              <button className="fb-button" onClick={() => acceptRequest(incomingItem)} disabled={busyId === incomingItem.id}>
                {busyId === incomingItem.id ? 'Working...' : 'Accept'}
              </button>
              <button className="fb-button fb-button-muted" onClick={() => removeRequest(incomingItem)} disabled={busyId === incomingItem.id}>Decline</button>
            </>
          ) : outgoingItem ? (
            <button className="fb-button fb-button-muted" onClick={() => removeRequest(outgoingItem)} disabled={busyId === outgoingItem.id}>
              {busyId === outgoingItem.id ? 'Working...' : 'Cancel Request'}
            </button>
          ) : mode === 'discover' ? (
            <button className="fb-button" onClick={() => sendRequest(person)} disabled={busyId === person.uid}>
              {busyId === person.uid ? 'Sending...' : 'Add Friend'}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="fb-friends-panel">
      <div className="fb-friends-heading">
        <div>
          <h2>Friends</h2>
          <p>Find people and connect on FACEBOOM.</p>
        </div>
        <button className="fb-button fb-button-muted" onClick={onBack}>Back to Home</button>
      </div>

      <div className="fb-friends-tabs">
        <button className={activeTab === 'discover' ? 'active' : ''} onClick={() => setActiveTab('discover')}>
          Find Friends
        </button>
        <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>
          Requests {incoming.length > 0 && <span className="fb-count">{incoming.length}</span>}
        </button>
        <button className={activeTab === 'friends' ? 'active' : ''} onClick={() => setActiveTab('friends')}>
          My Friends ({visibleFriends.length})
        </button>
        <button className={activeTab === 'blocked' ? 'active' : ''} onClick={() => setActiveTab('blocked')}>
          Blocked ({blockedUserIds.length})
        </button>
        <button className={activeTab === 'invite' ? 'active' : ''} onClick={() => setActiveTab('invite')}>
          Invite Friends
        </button>
      </div>

      {message && <p className="fb-status-message">{message}</p>}
      {error && <p className="fb-error-message">{error}</p>}

      {activeTab === 'invite' && (
        <div className="fb-people-list">
          <h3>Invite people to FACEBOOM</h3>
          <p className="fb-empty-state">
            Share your personal invitation link with friends on Facebook, WhatsApp, Telegram,
            or any other app. When someone opens the link, FACEBOOM will show them the
            invitation and take them to account registration.
          </p>
          <ShareActions
            title="Join me on FACEBOOM"
            text={`Join me on FACEBOOM and connect with friends. Sign up using my invitation link.`}
            url={`${window.location.origin}${window.location.pathname}?invite=${user.uid}`}
          />
        </div>
      )}

      {activeTab === 'discover' && (
        <>
          <input
            className="fb-search-input"
            type="search"
            placeholder="Search by name, username or country..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <button className="fb-refresh-button" onClick={loadPeople} disabled={loadingPeople}>
            {loadingPeople ? 'Loading people...' : 'Refresh people'}
          </button>
          {loadingPeople ? <p className="fb-empty-state">Loading people...</p> : (
            <div className="fb-people-list">
              {filteredPeople.map((person) => personCard(person))}
              {filteredPeople.length === 0 && (
                <p className="fb-empty-state">
                  {people.length === 0
                    ? 'No discoverable profiles yet. Other members will appear after they sign in to the updated app.'
                    : 'No people match your search.'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'requests' && (
        <div className="fb-people-list">
          <h3>Received Requests ({incoming.length})</h3>
          {incoming.map((request) => personCard({
            uid: request.fromUid,
            fullName: request.fromName,
            username: request.fromUsername,
            photoURL: request.fromPhotoURL,
            country: request.fromCountry
          }, 'request'))}
          {incoming.length === 0 && <p className="fb-empty-state">You have no new friend requests.</p>}
          <h3 className="fb-subheading">Sent Requests ({outgoing.length})</h3>
          {outgoing.map((request) => personCard({
            uid: request.toUid,
            fullName: request.toName,
            username: request.toUsername
          }, 'sent'))}
          {outgoing.length === 0 && <p className="fb-empty-state">You have no pending sent requests.</p>}
        </div>
      )}

      {activeTab === 'blocked' && (
        <div className="fb-people-list">
          <h3>Blocked Members</h3>
          {blockedPeople.map((person) => personCard(person, 'blocked'))}
          {blockedPeople.length === 0 && (
            <p className="fb-empty-state">You have not blocked anyone.</p>
          )}
        </div>
      )}

      {activeTab === 'friends' && (
        <div className="fb-people-list">
          {visibleFriends.map((friend) => (
            <div className="fb-person-card" key={friend.uid || friend.id}>
              {friend.photoURL ? (
                <img className="fb-person-avatar" src={friend.photoURL} alt="" />
              ) : (
                <div className="fb-person-avatar fb-person-avatar-placeholder">
                  {(friend.fullName || 'F').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="fb-person-info">
                <strong>{friend.fullName || 'FACEBOOM User'}</strong>
                {friend.username && <span>@{friend.username}</span>}
                {friend.country && <small>{friend.country}</small>}
              </div>
              <div className="fb-person-actions">
                <SafetyActions
                  user={user}
                  targetUid={friend.uid || friend.id}
                  targetName={friend.fullName}
                  contentType="account"
                  contentId={friend.uid || friend.id}
                />
                <button className="fb-button fb-button-muted" onClick={() => removeFriend(friend)} disabled={busyId === (friend.uid || friend.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {friends.length === 0 && <p className="fb-empty-state">Your accepted friends will appear here.</p>}
        </div>
      )}
    </section>
  );
}
