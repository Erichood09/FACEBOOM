import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, Timestamp, updateDoc, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import MetaInboxPanel from './MetaInboxPanel';

function displayDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Not available';
}

export default function ModeratorPanel({ user, onBack }) {
  const [reports, setReports] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [actions, setActions] = useState([]);
  const [states, setStates] = useState({});
  const [reasons, setReasons] = useState({});
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    const stopReports = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), async (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReports(items);
      const ids = [...new Set(items.map((r) => r.targetUid).filter(Boolean))];
      const pairs = await Promise.all(ids.map(async (uid) => {
        try {
          const s = await getDoc(doc(db, 'moderationAccounts', uid));
          return [uid, s.exists() ? s.data() : { uid, accountStatus: 'active', warningCount: 0 }];
        } catch {
          return [uid, { uid, accountStatus: 'unknown', warningCount: 0 }];
        }
      }));
      if (alive) {
        setStates((current) => ({ ...current, ...Object.fromEntries(pairs) }));
        setLoading(false);
        setError('');
      }
    }, (err) => {
      console.error(err);
      if (alive) { setError('Unable to load moderation reports.'); setLoading(false); }
    });
    const stopActions = onSnapshot(query(collection(db, 'moderationActions'), orderBy('createdAt', 'desc')), (snap) => {
      if (alive) setActions(snap.docs.slice(0, 30).map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Moderation history:', err));
    const stopAppeals = onSnapshot(query(collection(db, 'moderationAppeals'), orderBy('createdAt', 'desc')), (snap) => {
      if (alive) setAppeals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Appeals:', err));
    return () => { alive = false; stopReports(); stopActions(); stopAppeals(); };
  }, []);

  async function updateReport(report, status) {
    if (busy) return;
    setBusy(report.id);
    setError('');
    try {
      const changes = { status };
      if (status === 'resolved' || status === 'dismissed') changes.resolvedAt = serverTimestamp();
      await updateDoc(doc(db, 'reports', report.id), changes);
    } catch (err) {
      console.error(err);
      setError('Unable to update the report.');
    } finally { setBusy(''); }
  }

  async function applyAction(report, action, durationHours = null) {
    const uid = report.targetUid;
    const reason = (reasons[report.id] || '').trim();
    if (!uid || uid === user.uid || !reason || busy) {
      setError(uid === user.uid ? 'You cannot moderate your own account.' : 'Enter a reason before applying an action.');
      return;
    }
    setBusy(report.id);
    setError('');
    try {
      const current = states[uid] || { accountStatus: 'active', warningCount: 0, latestWarning: '', warningAt: null };
      const status = action === 'suspend' ? 'suspended' : action === 'ban' ? 'banned' : action === 'reinstate' ? 'active' : (current.accountStatus || 'active');
      const until = action === 'suspend'
        ? Timestamp.fromDate(new Date(Date.now() + durationHours * 3600000))
        : action === 'ban' || action === 'reinstate' ? null : current.suspensionUntil || null;
      const warningCount = action === 'warning' ? (current.warningCount || 0) + 1 : (current.warningCount || 0);
      const latestWarning = action === 'warning' ? reason : (current.latestWarning || '');
      const warningAt = action === 'warning' ? serverTimestamp() : current.warningAt || null;
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', uid), {
        accountStatus: status, suspensionUntil: until,
        moderationReason: reason, moderationUpdatedAt: serverTimestamp()
      });
      batch.set(doc(db, 'moderationAccounts', uid), {
        uid, accountStatus: status, suspensionUntil: until, reason,
        warningCount, latestWarning, warningAt, updatedAt: serverTimestamp()
      });
      batch.set(doc(collection(db, 'moderationActions')), {
        targetUid: uid, moderatorUid: user.uid, action, reason,
        durationHours, createdAt: serverTimestamp()
      });
      await batch.commit();
      setStates((all) => ({ ...all, [uid]: { uid, accountStatus: status, suspensionUntil: until, reason, warningCount, latestWarning, warningAt } }));
      setReasons((all) => ({ ...all, [report.id]: '' }));
    } catch (err) {
      console.error('Moderation action failed:', err);
      setError('The action was not saved. Check the account and try again.');
    } finally { setBusy(''); }
  }

  async function reviewAppeal(appeal, status) {
    if (busy) return;
    setBusy(appeal.id);
    setError('');
    try {
      const note = (notes[appeal.id] || '').trim();
      const batch = writeBatch(db);
      if (status === 'accepted') {
        const current = states[appeal.uid] || {};
        batch.update(doc(db, 'users', appeal.uid), {
          accountStatus: 'active', suspensionUntil: null,
          moderationReason: 'Appeal accepted', moderationUpdatedAt: serverTimestamp()
        });
        batch.set(doc(db, 'moderationAccounts', appeal.uid), {
          uid: appeal.uid, accountStatus: 'active', suspensionUntil: null,
          reason: 'Appeal accepted', warningCount: current.warningCount || 0,
          latestWarning: current.latestWarning || '', warningAt: current.warningAt || null,
          updatedAt: serverTimestamp()
        });
        batch.set(doc(collection(db, 'moderationActions')), {
          targetUid: appeal.uid, moderatorUid: user.uid, action: 'reinstate',
          reason: 'Appeal accepted: ' + (note || 'Account reinstated after review.'),
          durationHours: null, createdAt: serverTimestamp()
        });
      }
      batch.update(doc(db, 'moderationAppeals', appeal.id), {
        status, moderatorNote: note, reviewedAt: serverTimestamp()
      });
      await batch.commit();
      if (status === 'accepted') setStates((all) => ({
        ...all, [appeal.uid]: { ...(all[appeal.uid] || {}), uid: appeal.uid, accountStatus: 'active', suspensionUntil: null }
      }));
    } catch (err) {
      console.error('Appeal review failed:', err);
      setError('Unable to save the appeal decision.');
    } finally { setBusy(''); }
  }

  const panel = { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 14 };
  const button = { border: '1px solid #d0d7de', background: '#f6f8fa', borderRadius: 8, padding: '8px 11px', cursor: 'pointer' };
  const danger = { ...button, color: '#b42318', borderColor: '#e3a3a3' };
  const field = { width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #ccc', borderRadius: 7, margin: '8px 0' };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: '#1877f2', margin: '4px 0 14px' }}>Safety & Moderation</h2>
        <button type="button" style={button} onClick={onBack}>Back to Home</button>
      </div>
      <p style={{ color: '#555' }}>Review reports, apply account actions, handle appeals and retain a moderation history.</p>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}

      <h3>Member reports</h3>
      {loading ? <p>Loading reports...</p> : reports.length === 0 ? <div style={panel}>There are no reports to review.</div> : reports.map((report) => {
        const account = states[report.targetUid] || { accountStatus: 'active', warningCount: 0 };
        const until = account.suspensionUntil;
        const restricted = account.accountStatus === 'banned' || (account.accountStatus === 'suspended' && (!until || (until.toDate ? until.toDate().getTime() : new Date(until).getTime()) > Date.now()));
        return (
          <article key={report.id} style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong>{String(report.reason || 'Other concern').replaceAll('_', ' ')}</strong>
              <span style={{ fontSize: 13, color: '#555' }}>Report status: {report.status || 'open'}</span>
            </div>
            <p><strong>Content:</strong> {report.contentType || 'account'} {report.contentId ? `· ${report.contentId}` : ''}</p>
            {report.targetUid && <p><strong>Reported member:</strong> {report.targetUid}</p>}
            <p><strong>Reported by:</strong> {report.reporterId || 'Unknown'}</p>
            {report.details && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.details}</p>}
            {report.targetUid && <div style={{ background: '#f7f9fc', padding: 12, borderRadius: 8, margin: '12px 0' }}>
              <strong>Account status: {account.accountStatus || 'active'}</strong>
              <p style={{ margin: '5px 0', fontSize: 13 }}>Warnings recorded: {account.warningCount || 0}{restricted && until ? ` · Suspended until ${displayDate(until)}` : ''}</p>
              <label>Moderator reason (required)
                <textarea style={{ ...field, minHeight: 65 }} maxLength={500} value={reasons[report.id] || ''} onChange={(e) => setReasons((all) => ({ ...all, [report.id]: e.target.value }))} placeholder="Explain the rule violation and why this action is appropriate." />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={button} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid} onClick={() => applyAction(report, 'warning')}>Issue warning</button>
                <button type="button" style={button} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid} onClick={() => applyAction(report, 'suspend', 24)}>Suspend 24 hours</button>
                <button type="button" style={button} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid} onClick={() => applyAction(report, 'suspend', 168)}>Suspend 7 days</button>
                <button type="button" style={button} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid} onClick={() => applyAction(report, 'suspend', 720)}>Suspend 30 days</button>
                <button type="button" style={danger} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid} onClick={() => applyAction(report, 'ban')}>Permanent ban</button>
                <button type="button" style={button} disabled={!!busy || !reasons[report.id]?.trim() || report.targetUid === user.uid || account.accountStatus === 'active'} onClick={() => applyAction(report, 'reinstate')}>Reinstate</button>
              </div>
            </div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={button} disabled={!!busy || report.status === 'reviewing'} onClick={() => updateReport(report, 'reviewing')}>Mark reviewing</button>
              <button type="button" style={button} disabled={!!busy || report.status === 'resolved'} onClick={() => updateReport(report, 'resolved')}>Resolve report</button>
              <button type="button" style={button} disabled={!!busy || report.status === 'dismissed'} onClick={() => updateReport(report, 'dismissed')}>Dismiss report</button>
              <button type="button" style={button} disabled={!!busy || report.status === 'open'} onClick={() => updateReport(report, 'open')}>Reopen report</button>
            </div>
          </article>
        );
      })}

      <h3>Member appeals</h3>
      {appeals.length === 0 ? <div style={panel}>There are no appeals awaiting review.</div> : appeals.map((appeal) => (
        <article key={appeal.id} style={panel}>
          <p><strong>Member:</strong> {appeal.uid}</p>
          <p><strong>Status:</strong> {appeal.status}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{appeal.reason}</p>
          <textarea style={{ ...field, minHeight: 60 }} maxLength={1000} placeholder="Moderator decision notes (optional)" value={notes[appeal.id] || ''} onChange={(e) => setNotes((all) => ({ ...all, [appeal.id]: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={button} disabled={!!busy || appeal.status === 'reviewing'} onClick={() => reviewAppeal(appeal, 'reviewing')}>Mark reviewing</button>
            <button type="button" style={button} disabled={!!busy || appeal.status === 'accepted'} onClick={() => reviewAppeal(appeal, 'accepted')}>Accept & reinstate</button>
            <button type="button" style={danger} disabled={!!busy || appeal.status === 'rejected'} onClick={() => reviewAppeal(appeal, 'rejected')}>Reject appeal</button>
          </div>
        </article>
      ))}

      <h3>Moderation history</h3>
      {actions.length === 0 ? <div style={panel}>No moderation actions have been recorded yet.</div> : actions.map((item) => (
        <article key={item.id} style={{ ...panel, padding: 12 }}>
          <strong>{String(item.action || 'action').toUpperCase()}</strong>
          <p style={{ margin: '5px 0' }}>Member: {item.targetUid} · Moderator: {item.moderatorUid}</p>
          <p style={{ margin: '5px 0' }}>{item.reason}</p>
          <small style={{ color: '#666' }}>{displayDate(item.createdAt)}{item.durationHours ? ` · ${item.durationHours} hours` : ''}</small>
        </article>
      ))}

      <MetaInboxPanel user={user} />
    </section>
  );
}
