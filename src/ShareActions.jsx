import { useState } from 'react';

export default function ShareActions({ title, text, url }) {
  const [copied, setCopied] = useState(false);

  function openShareWindow(target) {
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (error) {
      console.error('Copy link failed:', error);
      window.prompt('Copy this FACEBOOM link:', url);
    }
  }

  async function shareMore() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Device sharing failed:', error);
      }
    }
    await copyLink();
  }

  const message = encodeURIComponent(`${text} ${url}`);
  const encodedUrl = encodeURIComponent(url);

  const buttonStyle = {
    border: '1px solid #d0d7de',
    background: '#f6f8fa',
    color: '#1c1e21',
    borderRadius: 8,
    padding: '8px 11px',
    margin: '3px 6px 3px 0',
    cursor: 'pointer',
    fontSize: 13
  };

  return (
    <div aria-label="Share FACEBOOM content" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <button type="button" style={buttonStyle} onClick={shareMore}>Share</button>
      <button type="button" style={buttonStyle} onClick={() => openShareWindow(`https://wa.me/?text=${message}`)}>WhatsApp</button>
      <button type="button" style={buttonStyle} onClick={() => openShareWindow(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(text)}`)}>Telegram</button>
      <button type="button" style={buttonStyle} onClick={() => openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>Facebook</button>
      <button type="button" style={buttonStyle} onClick={() => openShareWindow(`https://twitter.com/intent/tweet?text=${message}`)}>X</button>
      <button type="button" style={buttonStyle} onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
    </div>
  );
}
