import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';

export default function NotificationsPanel({ user, onBack }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    const notificationsQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(notificationsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, (err) => {
      console.error('Load notifications:', err);
      setError('Unable to load notifications. Please refresh the page.');
      setLoading(false);
    });
  }, [user]);

  async function markRead(notification) {
    if (!notification || notification.readAt || busyId) return;
    setBusyId(notification.id);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), {
        readAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Mark notification read:', err);
      setError('Unable to update this notification.');
    } finally {
      setBusyId('');
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const notificationText = (item) => ({
    friend_request: 'sent you a friend request.',
    friend_accept: 'accepted your friend request.',
    post_like: 'liked your post.',
    post_comment: 'commented on your post.',
    message: 'sent you a message.'
  }[item.type] || 'sent you a notification.');
  return (
    <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: '#1877f2', margin: '4px 0' }}>Notifications</h2>
          <p style={{ color: '#666', margin: '4px 0 12px' }}>{unreadCount} unread</p>
        </div>
        <button type="button" onClick={onBack} style={{ padding: '9px 13px', border: '1px solid #d0d7de', borderRadius: 8, cursor: 'pointer' }}>Back</button>
      </div>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      {loading ? <p>Loading notifications...</p> : notifications.length === 0 ? (
        <p style={{ color: '#666' }}>You have no notifications yet. Friend requests will appear here.</p>
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {notifications.map((item) => (
            <article key={item.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: item.readAt ? '#fff' : '#eef5ff' }}>
              <strong>{item.actorName || 'A FACEBOOM member'}</strong>
              <p style={{ margin: '6px 0' }}>{notificationText(item)}</p>
              {!item.readAt && (
                <button type="button" onClick={() => markRead(item)} disabled={busyId === item.id} style={{ border: 0, background: 'transparent', color: '#1877f2', padding: 0, cursor: 'pointer' }}>
                  {busyId === item.id ? 'Updating...' : 'Mark as read'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
