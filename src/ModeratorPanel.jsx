import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export default function ModeratorPanel({ onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    const reportsQuery = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    return onSnapshot(reportsQuery, (snapshot) => {
      setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, (err) => {
      console.error('Moderator reports:', err);
      setError('Unable to load reports. Confirm this account has the moderator permission.');
      setLoading(false);
    });
  }, []);

  async function updateReport(report, status) {
    if (savingId) return;
    setSavingId(report.id);
    setError('');
    try {
      const changes = { status };
      if (status === 'resolved' || status === 'dismissed') {
        changes.resolvedAt = serverTimestamp();
      }
      await updateDoc(doc(db, 'reports', report.id), changes);
    } catch (err) {
      console.error('Update report:', err);
      setError('Unable to update this report. Please try again.');
    } finally {
      setSavingId('');
    }
  }

  const panel = { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 14 };
  const button = { border: '1px solid #d0d7de', background: '#f6f8fa', borderRadius: 8, padding: '8px 11px', cursor: 'pointer' };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: '#1877f2', margin: '4px 0 14px' }}>Safety & Moderation</h2>
        <button type="button" style={button} onClick={onBack}>Back to Home</button>
      </div>
      <p style={{ color: '#555' }}>Review member reports and record the moderation outcome. Handle reports promptly and consistently.</p>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      {loading ? <p>Loading reports...</p> : reports.length === 0 ? (
        <div style={panel}>There are no reports to review.</div>
      ) : reports.map((report) => (
        <article key={report.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong>{String(report.reason || 'Other concern').replaceAll('_', ' ')}</strong>
            <span style={{ fontSize: 13, color: '#555' }}>Status: {report.status || 'open'}</span>
          </div>
          <p><strong>Content:</strong> {report.contentType || 'account'} {report.contentId ? `· ${report.contentId}` : ''}</p>
          {report.targetUid && <p><strong>Reported member:</strong> {report.targetUid}</p>}
          <p><strong>Reported by:</strong> {report.reporterId || 'Unknown'}</p>
          {report.details && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.details}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={button} disabled={Boolean(savingId) || report.status === 'reviewing'} onClick={() => updateReport(report, 'reviewing')}>{savingId === report.id ? 'Saving...' : 'Mark reviewing'}</button>
            <button type="button" style={button} disabled={Boolean(savingId) || report.status === 'resolved'} onClick={() => updateReport(report, 'resolved')}>Resolve</button>
            <button type="button" style={button} disabled={Boolean(savingId) || report.status === 'dismissed'} onClick={() => updateReport(report, 'dismissed')}>Dismiss</button>
            <button type="button" style={button} disabled={Boolean(savingId) || report.status === 'open'} onClick={() => updateReport(report, 'open')}>Reopen</button>
          </div>
        </article>
      ))}
    </section>
  );
}
