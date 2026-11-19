import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function SafetyActions({ user, targetUid, targetName, contentType, contentId }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function submitReport(event) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setStatus('');
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        targetUid: targetUid || '',
        contentType: contentType || 'account',
        contentId: contentId || '',
        reason,
        details: details.trim().slice(0, 1000),
        status: 'open',
        createdAt: serverTimestamp()
      });
      setDetails('');
      setReportOpen(false);
      setStatus('Report submitted. Thank you for helping keep FACEBOOM safe.');
    } catch (error) {
      console.error('Report submission failed:', error);
      setStatus('Unable to submit this report. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!user || !targetUid || targetUid === user.uid || busy) return;
    setBusy(true);
    setStatus('');
    const blockRef = doc(db, 'users', user.uid, 'blocked', targetUid);
    try {
      const existing = await getDoc(blockRef);
      if (existing.exists()) {
        await deleteDoc(blockRef);
        setStatus('This member has been unblocked.');
      } else {
        await setDoc(blockRef, {
          uid: targetUid,
          createdAt: serverTimestamp()
        });
        setStatus('This member has been blocked.');
      }
    } catch (error) {
      console.error('Block action failed:', error);
      setStatus('Unable to update your block list. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  const canBlock = targetUid && targetUid !== user.uid;

  return (
    <div className="fb-safety-actions">
      {contentType && contentId && (
        <button type="button" className="fb-safety-link" onClick={() => setReportOpen((open) => !open)}>
          Report
        </button>
      )}
      {canBlock && (
        <button type="button" className="fb-safety-link" onClick={toggleBlock} disabled={busy}>
          Block / Unblock
        </button>
      )}
      {reportOpen && (
        <form className="fb-report-form" onSubmit={submitReport}>
          <label>
            Reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="harassment">Harassment or bullying</option>
              <option value="hate">Hate or discrimination</option>
              <option value="violence">Threats or violence</option>
              <option value="sexual">Sexual or exploitative content</option>
              <option value="spam">Spam or scam</option>
              <option value="privacy">Privacy violation</option>
              <option value="other">Other concern</option>
            </select>
          </label>
          <label>
            Additional details (optional)
            <textarea value={details} maxLength={1000} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the concern..." />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit report'}</button>
          <button type="button" onClick={() => setReportOpen(false)}>Cancel</button>
        </form>
      )}
      {status && <small role="status">{status}</small>}
    </div>
  );
}
