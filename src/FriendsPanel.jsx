import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

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
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
      const snapshot = await getDocs(collection(db, 'publicProfiles'));
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
    // Load the directory once when this panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const filteredPeople = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return people;
    return people.filter((person) =>
      `${person.fullName} ${person.username} ${person.country}`.toLowerCase().includes(term)
    );
  }, [people, searchText]);

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
      await setDoc(requestRef, {
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
        <div className="fb-person-actions">
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
          My Friends ({friends.length})
        </button>
      </div>

      {message && <p className="fb-status-message">{message}</p>}
      {error && <p className="fb-error-message">{error}</p>}

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

      {activeTab === 'friends' && (
        <div className="fb-people-list">
          {friends.map((friend) => (
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
              <button className="fb-button fb-button-muted" onClick={() => removeFriend(friend)} disabled={busyId === (friend.uid || friend.id)}>
                Remove
              </button>
            </div>
          ))}
          {friends.length === 0 && <p className="fb-empty-state">Your accepted friends will appear here.</p>}
        </div>
      )}
    </section>
  );
}
