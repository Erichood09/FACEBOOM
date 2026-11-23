import { useEffect, useRef, useState } from 'react';
import { collection, addDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, limit } from 'firebase/firestore';
import { Room, RoomEvent } from 'livekit-client';
import { db } from './firebase';

const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_URL || '';
const livekitUrl = import.meta.env.VITE_LIVEKIT_WS_URL || '';

export default function LivePanel({ user, profile, onBack }) {
  const [streams, setStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);
  const [title, setTitle] = useState('');
  const [comments, setComments] = useState([]);
  const [giftEvents, setGiftEvents] = useState([]);
  const [giftBusy, setGiftBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [room, setRoom] = useState(null);
  const videoHostRef = useRef(null);
  const [mediaTracks, setMediaTracks] = useState([]);
  const [now, setNow] = useState(Date.now());
  const liveReady = Boolean(tokenEndpoint && livekitUrl);

  useEffect(() => {
    const liveQuery = query(collection(db, 'liveStreams'), where('status', '==', 'live'));
    return onSnapshot(liveQuery, (snapshot) => {
      setStreams(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => {
      console.error('Live streams:', err);
      setError('Unable to load live broadcasts.');
    });
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!activeStream || activeStream.hostUid !== user.uid) return undefined;
    const heartbeat = () => updateDoc(doc(db, 'liveStreams', activeStream.id), { lastHeartbeat: serverTimestamp() })
      .catch((err) => console.warn('Live heartbeat:', err));
    heartbeat();
    const interval = setInterval(heartbeat, 25000);
    return () => clearInterval(interval);
  }, [activeStream?.id, activeStream?.hostUid, user.uid]);

  useEffect(() => {
    if (!activeStream) { setComments([]); return undefined; }
    const commentsQuery = query(collection(db, 'liveStreams', activeStream.id, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => {
      console.error('Live comments:', err);
      setError('Unable to load live comments.');
    });
  }, [activeStream?.id]);

  useEffect(() => {
    if (!activeStream) { setGiftEvents([]); return undefined; }
    const giftsQuery = query(
      collection(db, 'liveStreams', activeStream.id, 'giftEvents'),
      orderBy('createdAt', 'desc'),
      limit(15)
    );
    return onSnapshot(giftsQuery, (snapshot) => {
      setGiftEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (err) => {
      console.error('Live gifts:', err);
      setError('Unable to load live gifts.');
    });
  }, [activeStream?.id]);

  useEffect(() => {
    if (!videoHostRef.current) return undefined;
    const host = videoHostRef.current;
    host.replaceChildren();
    const attached = [];
    mediaTracks.forEach((track) => {
      const element = track.attach();
      if (element.tagName === 'VIDEO') {
        element.autoplay = true;
        element.playsInline = true;
        element.controls = false;
        element.style.width = '100%';
        element.style.maxHeight = '420px';
        element.style.objectFit = 'contain';
        element.style.background = '#111';
      } else {
        element.autoplay = true;
      }
      host.appendChild(element);
      attached.push(track);
    });
    return () => attached.forEach((track) => track.detach().forEach((element) => element.remove()));
  }, [mediaTracks, activeStream?.id]);

  useEffect(() => () => {
    if (room) room.disconnect();
  }, [room]);

  function updateParticipants(currentRoom) {
    setParticipantCount(1 + currentRoom.remoteParticipants.size);
  }

  async function connectToStream(stream, mode) {
    if (!tokenEndpoint || !livekitUrl) {
      throw new Error('FACEBOOM Live is not connected yet. The LiveKit and secure token service settings must be added first.');
    }
    const idToken = await user.getIdToken();
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ streamId: stream.id, mode })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Could not authorize this live session.');
    }
    const payload = await response.json();
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
    nextRoom.on(RoomEvent.TrackSubscribed, (track) => setMediaTracks((all) => [...all, track]));
    nextRoom.on(RoomEvent.TrackUnsubscribed, (track) => setMediaTracks((all) => all.filter((item) => item !== track)));
    nextRoom.on(RoomEvent.ParticipantConnected, () => updateParticipants(nextRoom));
    nextRoom.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(nextRoom));
    nextRoom.on(RoomEvent.Disconnected, () => {
      setMediaTracks([]);
      setParticipantCount(1);
      setActiveStream(null);
      setRoom(null);
    });
    try {
      await nextRoom.connect(livekitUrl, payload.token);
      if (mode === 'host') {
        await nextRoom.localParticipant.enableCameraAndMicrophone();
        nextRoom.localParticipant.videoTrackPublications.forEach((publication) => {
          if (publication.track) setMediaTracks((all) => [...all, publication.track]);
        });
      }
    } catch (connectionError) {
      nextRoom.disconnect();
      throw connectionError;
    }
    setRoom(nextRoom);
    updateParticipants(nextRoom);
  }

  async function startBroadcast(event) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError(''); setStatus('');
    let streamRef = null;
    try {
      streamRef = doc(collection(db, 'liveStreams'));
      const stream = { id: streamRef.id, hostUid: user.uid, hostName: profile.fullName || user.displayName || 'FACEBOOM member', title: title.trim(), status: 'live' };
      await setDoc(streamRef, {
        hostUid: stream.hostUid, hostName: stream.hostName, title: stream.title,
        status: 'live', createdAt: serverTimestamp(), lastHeartbeat: serverTimestamp()
      });
      await connectToStream(stream, 'host');
      setActiveStream(stream);
      setStatus('You are live. Keep this page open while broadcasting.');
    } catch (err) {
      console.error('Start broadcast:', err);
      if (streamRef) await updateDoc(streamRef, { status: 'ended', endedAt: serverTimestamp() }).catch(() => {});
      setError(err.message || 'Could not start your broadcast.');
    } finally { setBusy(false); }
  }

  async function joinBroadcast(stream) {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await connectToStream(stream, 'viewer');
      setActiveStream(stream);
      setStatus(`You are watching ${stream.hostName}'s live broadcast.`);
    } catch (err) {
      console.error('Join broadcast:', err);
      setError(err.message || 'Could not join this broadcast.');
    } finally { setBusy(false); }
  }

  async function leaveBroadcast() {
    if (room) { room.disconnect(); setRoom(null); }
    setMediaTracks([]);
    setActiveStream(null);
    setStatus('You left the live broadcast.');
  }

  async function endBroadcast() {
    if (!activeStream || activeStream.hostUid !== user.uid) return;
    setBusy(true);
    try {
      if (room) room.disconnect();
      setRoom(null); setMediaTracks([]); setActiveStream(null);
      await updateDoc(doc(db, 'liveStreams', activeStream.id), { status: 'ended', endedAt: serverTimestamp() });
      setStatus('Your broadcast has ended.');
    } catch (err) {
      setError('Could not end the broadcast cleanly. Please try again.');
    } finally { setBusy(false); }
  }

  async function sendComment(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!activeStream || !text || text.length > 500) return;
    try {
      await addDoc(collection(db, 'liveStreams', activeStream.id, 'comments'), {
        senderId: user.uid,
        senderName: profile.fullName || user.displayName || 'FACEBOOM member',
        text,
        createdAt: serverTimestamp()
      });
      setDraft('');
    } catch (err) {
      console.error('Send live comment:', err);
      setError('Your comment could not be sent.');
    }
  }

  const freeGifts = [
    { id: 'heart', name: 'Heart', emoji: '❤️' },
    { id: 'rose', name: 'Rose', emoji: '🌹' },
    { id: 'clap', name: 'Clap', emoji: '👏' },
    { id: 'star', name: 'Star', emoji: '⭐' }
  ];

  async function sendFreeGift(gift) {
    if (!activeStream || giftBusy) return;
    setGiftBusy(true);
    setError('');
    try {
      await addDoc(collection(db, 'liveStreams', activeStream.id, 'giftEvents'), {
        senderId: user.uid,
        senderName: profile.fullName || user.displayName || 'FACEBOOM member',
        giftId: gift.id,
        giftName: gift.name,
        emoji: gift.emoji,
        kind: 'free',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Send free live gift:', err);
      setError('Your gift could not be sent. Please try again.');
    } finally {
      setGiftBusy(false);
    }
  }

  const button = { border: 0, borderRadius: 8, padding: '10px 14px', background: '#1877f2', color: '#fff', fontWeight: 700, cursor: 'pointer' };
  const muted = { ...button, background: '#eef2f7', color: '#263445' };
  const card = { background: '#fff', borderRadius: 12, padding: 18, marginBottom: 14, boxShadow: '0 1px 5px rgba(0,0,0,.07)' };

  return (
    <section>
      <style>{`
        @keyframes faceboomGiftPop {
          0% { opacity: 0; transform: translateY(10px) scale(.72); }
          65% { opacity: 1; transform: translateY(-2px) scale(1.08); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div><h2 style={{ color: '#1877f2', margin: 0 }}>🔴 FACEBOOM Live</h2><p style={{ color: '#687684', margin: '5px 0 0' }}>Broadcast live and watch other members.</p></div>
        <button type="button" style={muted} onClick={onBack}>Back to Home</button>
      </div>
      {!liveReady && <p role="status" style={{ color: '#7a4b00', background: '#fff7e6', border: '1px solid #f0d28a', padding: 12, borderRadius: 8 }}>Live video is not connected yet. The LiveKit and secure token service setup must be completed before members can start or watch broadcasts.</p>}
      {error && <p role="alert" style={{ color: '#b42318', background: '#fff1f0', padding: 10, borderRadius: 8 }}>{error}</p>}
      {status && <p role="status" style={{ color: '#187a3d' }}>{status}</p>}
      {activeStream ? (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div><strong style={{ color: '#d93025' }}>● LIVE</strong><h3>{activeStream.title}</h3><p>Hosted by {activeStream.hostName}</p></div>
            <strong>👥 {participantCount} connected</strong>
          </div>
          <div ref={videoHostRef} style={{ minHeight: 220, background: '#111', borderRadius: 10, overflow: 'hidden', display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', alignItems: 'center' }} />
          {activeStream.hostUid === user.uid
            ? <button type="button" style={{ ...button, background: '#c62828', marginTop: 12 }} disabled={busy} onClick={endBroadcast}>End Live</button>
            : <button type="button" style={{ ...muted, marginTop: 12 }} onClick={leaveBroadcast}>Leave Live</button>}
          <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#fff8ed', border: '1px solid #f5dfbd' }}>
            <h3 style={{ margin: '0 0 10px' }}>Send a free gift</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {freeGifts.map((gift) => (
                <button key={gift.id} type="button" style={{ ...muted, background: '#fff', border: '1px solid #e8d7bd' }} disabled={giftBusy} onClick={() => sendFreeGift(gift)}>
                  <span style={{ fontSize: 20, marginRight: 6 }}>{gift.emoji}</span>{gift.name}
                </button>
              ))}
            </div>
            <p style={{ color: '#8a5a20', fontSize: 12, margin: '9px 0 0' }}>These gifts are free and do not use money or create creator earnings.</p>
            <div aria-live="polite" style={{ marginTop: 10, display: 'grid', gap: 5 }}>
              {giftEvents.map((gift) => (
                <div key={gift.id} style={{ fontSize: 14, color: '#59452e', animation: 'faceboomGiftPop 650ms ease-out both' }}>
                  <strong>{gift.senderName || 'A member'}</strong> sent {gift.emoji} {gift.giftName}
                </div>
              ))}
              {giftEvents.length === 0 && <span style={{ color: '#8a755d', fontSize: 13 }}>No gifts yet. Be the first to send one!</span>}
            </div>
          </div>
          <h3 style={{ marginTop: 18 }}>Live comments</h3>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 10, background: '#f7f8fa', borderRadius: 8 }}>
            {comments.map((comment) => <p key={comment.id} style={{ margin: '7px 0', overflowWrap: 'anywhere' }}><strong>{comment.senderName}: </strong>{comment.text}</p>)}
            {comments.length === 0 && <p style={{ color: '#687684' }}>No comments yet. Say hello!</p>}
          </div>
          <form onSubmit={sendComment} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Write a live comment..." style={{ flex: 1, minWidth: 0, padding: 11, border: '1px solid #ccd2d8', borderRadius: 8 }} />
            <button type="submit" style={button} disabled={!draft.trim()}>Send</button>
          </form>
        </div>
      ) : (
        <>
          <form onSubmit={startBroadcast} style={card}>
            <h3>Start your live video</h3>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Give your live broadcast a title" required style={{ width: '100%', padding: 12, margin: '12px 0', border: '1px solid #ccd2d8', borderRadius: 8 }} />
            <button type="submit" style={button} disabled={busy || !liveReady}>{busy ? 'Connecting...' : '🔴 Go Live'}</button>
            <p style={{ color: '#687684', fontSize: 13, marginTop: 10 }}>Your browser will ask for camera and microphone permission.</p>
          </form>
          <div style={card}>
            <h3>Members Live Now</h3>
            {streams.filter((stream) => stream.hostUid !== user.uid && stream.lastHeartbeat?.toMillis && now - stream.lastHeartbeat.toMillis() < 90000).length === 0 ? <p style={{ color: '#687684', marginTop: 10 }}>No members are live right now.</p> : streams.filter((stream) => stream.hostUid !== user.uid && stream.lastHeartbeat?.toMillis && now - stream.lastHeartbeat.toMillis() < 90000).map((stream) => <div key={stream.id} style={{ borderTop: '1px solid #edf0f2', padding: '13px 0', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><div><strong style={{ color: '#d93025' }}>● LIVE</strong><h4>{stream.title}</h4><p style={{ color: '#687684', fontSize: 13 }}> {stream.hostName}</p></div><button type="button" style={button} disabled={busy || !liveReady} onClick={() => joinBroadcast(stream)}>Watch Live</button></div>)}
          </div>
        </>
      )}
    </section>
  );
}
