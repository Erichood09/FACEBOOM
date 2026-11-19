import { useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
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
    let blockSaved = false;
    try {
      const existing = await getDoc(blockRef);
      const blockedByRef = doc(db, 'users', targetUid, 'blockedBy', user.uid);
      if (existing.exists()) {
        const unblockBatch = writeBatch(db);
        unblockBatch.delete(blockRef);
        unblockBatch.delete(blockedByRef);
        await unblockBatch.commit();
        setStatus('This member has been unblocked. The old conversation will stay out of the inbox until a new message is sent.');
      } else {
        // Persist both directions atomically so both members' interfaces can
        // hide each other from discovery, feed and messaging views.
        const blockBatch = writeBatch(db);
        blockBatch.set(blockRef, {
          uid: targetUid,
          createdAt: serverTimestamp()
        });
        blockBatch.set(blockedByRef, {
          uid: user.uid,
          createdAt: serverTimestamp()
        });
        await blockBatch.commit();
        blockSaved = true;

        const inboxQuery = query(
          collection(db, 'users', user.uid, 'inbox'),
          where('otherUid', '==', targetUid)
        );
        const inboxSnap = await getDocs(inboxQuery);
        const conversations = inboxSnap.docs;

        // Firestore batches allow at most 500 writes. Delete two inbox
        // summaries per conversation in smaller sequential batches.
        for (let offset = 0; offset < conversations.length; offset += 200) {
          const batch = writeBatch(db);
          const chunk = conversations.slice(offset, offset + 200);
          chunk.forEach((item) => {
            const conversationId = item.id;
            batch.delete(doc(db, 'users', user.uid, 'inbox', conversationId));
            batch.delete(doc(db, 'users', targetUid, 'inbox', conversationId));
          });
          await batch.commit();
        }

        setStatus('This member has been blocked and the conversation removed from both inboxes.');
      }
    } catch (error) {
      console.error('Block action failed:', error);
      setStatus(blockSaved
        ? 'The member is blocked, but some inbox entries could not be cleared. Messaging and conversation access remain blocked.'
        : 'Unable to update your block list. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  const canBlock = targetUid && targetUid !== user.uid;

  return (
    <div className="fb-safety-actions">
      {contentType && contentId && (
        <button type="button" className="fb-safety-link" onClick={() => setReportOpen((open) => !open)}>Report</button>
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
