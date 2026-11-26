import { useCallback, useEffect, useRef, useState } from 'react';

const apiBase = (import.meta.env.VITE_FLUTTERWAVE_API_URL || '').replace(/\/$/, '');

const cardStyle = {
  background: '#fff',
  border: '1px solid #e4e8ed',
  borderRadius: 14,
  padding: 18,
  marginBottom: 14
};
const primaryButton = {
  border: 0,
  borderRadius: 9,
  padding: '10px 15px',
  background: '#1877f2',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer'
};
const mutedText = { color: '#667085', fontSize: 13 };

export default function WalletPanel({ user, onBack }) {
  const [packages, setPackages] = useState([]);
  const [balance, setBalance] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const returnAttempt = useRef('');

  const apiRequest = useCallback(async (path, options = {}) => {
    if (!apiBase) throw new Error('Wallet service has not been connected to FACEBOOM yet.');
    const token = await user.getIdToken();
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Wallet request failed.');
    return payload;
  }, [user]);

  const refreshWallet = useCallback(async () => {
    if (!apiBase) {
      setConfigured(false);
      setLoading(false);
      return;
    }
    const [catalog, wallet] = await Promise.all([
      apiRequest('/v1/catalog'),
      apiRequest('/v1/wallet')
    ]);
    setPackages(Array.isArray(catalog.packages) ? catalog.packages : []);
    setBalance(Number(wallet.balance || 0));
    setConfigured(Boolean(catalog.configured && wallet.configured));
  }, [apiRequest]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      const params = new URLSearchParams(window.location.search);
      const transactionId = params.get('transaction_id') || '';
      const txRef = params.get('tx_ref') || '';
      const attemptKey = transactionId && txRef ? `${transactionId}:${txRef}` : '';
      try {
        if (attemptKey && returnAttempt.current !== attemptKey) {
          const result = await apiRequest('/v1/verify-return', {
            method: 'POST',
            body: JSON.stringify({ transactionId, txRef })
          });
          returnAttempt.current = attemptKey;
          if (active) setMessage(`Payment verified. ${result.coinsAdded} coins were added to your wallet.`);
          params.delete('wallet');
          params.delete('status');
          params.delete('tx_ref');
          params.delete('transaction_id');
          const query = params.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
        }
        await refreshWallet();
      } catch (err) {
        if (active) setError(err.message || 'Could not load your wallet.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [apiRequest, refreshWallet]);

  async function buyPackage(packageId) {
    if (purchasing) return;
    setPurchasing(packageId);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/v1/checkout', {
        method: 'POST',
        body: JSON.stringify({ packageId })
      });
      const checkout = new URL(result.checkoutUrl);
      if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.flutterwave.com') {
        throw new Error('The payment provider returned an unsafe checkout address.');
      }
      window.location.assign(checkout.toString());
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
      setPurchasing('');
    }
  }

  return (
    <section className="fb-wallet-panel" style={{ maxWidth: 760, margin: '0 auto' }}>
      <button type="button" onClick={onBack} style={{ ...primaryButton, background: '#667085', marginBottom: 14 }}>
        Back
      </button>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#1877f2' }}>FACEBOOM Wallet</h2>
        <p style={{ ...mutedText, marginTop: -5 }}>Wallet preview for future gift credits. Paid gifts and creator payouts are not enabled yet.</p>
        <div style={{ background: '#f3f7ff', borderRadius: 12, padding: 16 }}>
          <div style={mutedText}>Your coin balance</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#172b4d' }}>{balance.toLocaleString()} coins</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Buy gift credits</h3>
        <p style={mutedText}>Checkout is hosted securely by Flutterwave. The available payment methods depend on the approved merchant account, country and currency.</p>
        <div role="status" style={{ background: '#fff8e7', border: '1px solid #f2d58b', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
          Test mode only. No real money is collected by this FACEBOOM integration.
        </div>
        {loading ? <p>Loading wallet...</p> : (
          <>
            {!apiBase && <p style={mutedText}>The secure wallet service has not been connected yet.</p>}
            {apiBase && !configured && <p style={mutedText}>Flutterwave test credentials and the secure wallet database still need to be configured.</p>}
            {configured && packages.length === 0 && <p style={mutedText}>No coin packages have been activated yet. Package amounts and coin values must be set before purchases can begin.</p>}
            {packages.map((item) => (
              <div key={item.packageId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #edf0f2', padding: '13px 0' }}>
                <div>
                  <strong>{item.label}</strong>
                  <div style={mutedText}>{Number(item.coins).toLocaleString()} coins · {item.currency} {Number(item.amount).toLocaleString()}</div>
                </div>
                <button type="button" style={primaryButton} disabled={!configured || Boolean(purchasing)} onClick={() => buyPackage(item.packageId)}>
                  {purchasing === item.packageId ? 'Opening checkout...' : 'Buy coins'}
                </button>
              </div>
            ))}
          </>
        )}
        {message && <p role="status" style={{ color: '#18794e', fontWeight: 600 }}>{message}</p>}
        {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      </div>
    </section>
  );
}
