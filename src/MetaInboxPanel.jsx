import { useCallback, useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_META_BRIDGE_URL || '').replace(/\/$/, '');

export default function MetaInboxPanel({ user }) {
  const [tab, setTab] = useState('messages');
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (path, options = {}) => {
    if (!API_BASE) throw new Error('The Meta bridge URL has not been configured yet.');
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Facebook connection request failed.');
    return result;
  }, [user]);

  const loadInbox = useCallback(async (kind = tab) => {
    if (!API_BASE) return;
    setLoading(true);
    setError('');
    try {
      const result = await request(`/v1/meta/inbox?type=${kind}&limit=50`);
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request, tab]);

  useEffect(() => {
    let active = true;
    if (!API_BASE) return undefined;
    request('/v1/meta/status').then((result) => {
      if (active) setStatus(result);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    loadInbox(tab);
  }, [loadInbox, tab]);

  async function openConversation(item) {
    setSelected(item);
    setNotice('');
    setError('');
    try {
      const result = await request(`/v1/meta/conversation?psid=${encodeURIComponent(item.psid)}`);
      setMessages(result.messages || []);
    } catch (err) {
      setMessages([]);
      setError(err.message);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selected || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('/v1/meta/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: selected.psid, text })
      });
      setDraft('');
      await openConversation(selected);
      await loadInbox('messages');
      setNotice('Reply sent through Facebook Messenger.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function replyToComment(item) {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('/v1/meta/comments', {
        method: 'POST',
        body: JSON.stringify({ commentId: item.comment_id, text })
      });
      setDraft('');
      setNotice('Reply published on the Facebook Page comment.');
      await loadInbox('comments');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const panel = { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 14, marginBottom: 12 };
  const button = { border: '1px solid #d0d7de', background: '#f6f8fa', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
  const field = { width: '100%', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: 8, padding: 10, margin: '8px 0' };

  return (
    <section style={{ marginTop: 24 }}>
      <h3>Facebook Page Inbox</h3>
      <p style={{ color: '#555' }}>Manage messages sent to the FACEBOOM Facebook Page and reply to eligible Page comments. This does not access personal Facebook inboxes.</p>
      {!API_BASE ? (
        <div style={panel}>The secure Meta bridge is prepared in the project, but it has not been deployed or connected yet. Add the Worker URL after the Meta app and Page setup is complete.</div>
      ) : (
        <>
          {status && <p style={{ color: status.configured ? '#187a45' : '#8a5b00' }}>{status.configured ? 'Server credentials are configured.' : 'Meta credentials are not complete yet.'}</p>}
          {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
          {notice && <p role="status" style={{ color: '#187a45' }}>{notice}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" style={tab === 'messages' ? { ...button, background: '#e7f1ff', borderColor: '#1877f2' } : button} onClick={() => { setTab('messages'); setSelected(null); setMessages([]); }}>Messenger messages</button>
            <button type="button" style={tab === 'comments' ? { ...button, background: '#e7f1ff', borderColor: '#1877f2' } : button} onClick={() => { setTab('comments'); setSelected(null); setMessages([]); }}>Facebook comments</button>
            <button type="button" style={button} onClick={() => loadInbox(tab)}>Refresh</button>
          </div>
          {loading ? <p>Loading Facebook activity...</p> : items.length === 0 ? <div style={panel}>No Facebook {tab === 'messages' ? 'messages' : 'comments'} have arrived yet.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(0, 1.2fr)', gap: 12 }}>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                {items.map((item) => {
                  const key = tab === 'messages' ? item.psid : item.comment_id;
                  const active = tab === 'messages' ? selected?.psid === item.psid : selected?.comment_id === item.comment_id;
                  return (
                    <button key={key} type="button" style={{ ...button, textAlign: 'left', background: active ? '#e7f1ff' : '#fff', overflowWrap: 'anywhere' }} onClick={() => tab === 'messages' ? openConversation(item) : setSelected(item)}>
                      <strong>{tab === 'messages' ? (item.sender_name || 'Messenger user') : (item.sender_name || 'Facebook user')}</strong>
                      <span style={{ display: 'block', color: '#555', fontSize: 13, marginTop: 5 }}>{item.last_message || item.message_text}</span>
                    </button>
                  );
                })}
              </div>
              <div style={panel}>
                {!selected ? <p>Select a message or comment to review it.</p> : tab === 'messages' ? (
                  <>
                    <strong>Messenger conversation</strong>
                    <div style={{ maxHeight: 340, overflowY: 'auto', margin: '12px 0' }}>
                      {messages.map((message) => (
                        <div key={message.message_id} style={{ textAlign: message.direction === 'outbound' ? 'right' : 'left', margin: '8px 0' }}>
                          <span style={{ display: 'inline-block', background: message.direction === 'outbound' ? '#e7f1ff' : '#f1f2f4', padding: 9, borderRadius: 9, maxWidth: '90%', overflowWrap: 'anywhere' }}>{message.message_text}</span>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={sendReply}>
                      <textarea style={field} rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a Messenger reply..." />
                      <button type="submit" style={button} disabled={busy || !draft.trim()}>{busy ? 'Sending...' : 'Send Messenger reply'}</button>
                    </form>
                    <small style={{ display: 'block', color: '#666', marginTop: 8 }}>Meta messaging windows and recipient opt-in rules apply. Meta may reject replies outside the allowed window.</small>
                  </>
                ) : (
                  <>
                    <strong>{selected.sender_name || 'Facebook user'} · Page comment</strong>
                    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selected.message_text}</p>
                    {selected.reply_text && <p><strong>Previous reply:</strong> {selected.reply_text}</p>}
                    <form onSubmit={(event) => { event.preventDefault(); replyToComment(selected); }}>
                      <textarea style={field} rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a public Page comment reply..." />
                      <button type="submit" style={button} disabled={busy || !draft.trim()}>{busy ? 'Publishing...' : 'Reply to Facebook comment'}</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
