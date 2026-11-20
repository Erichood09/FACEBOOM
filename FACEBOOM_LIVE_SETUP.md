# FACEBOOM Live setup

This feature uses LiveKit Cloud for WebRTC media and a Cloudflare Worker for short-lived room tokens. Firebase remains the account and live-chat database. The app does not contain LiveKit API secrets.

## Required free-tier accounts

1. Create a LiveKit Cloud project and copy its WebSocket URL, API key, and API secret.
2. Create a Cloudflare account and install Node.js on a trusted computer.
3. In `workers/livekit-token`, run `npm install`.
4. Set Worker secrets (do not put these values in GitHub files):
   - `npx wrangler secret put LIVEKIT_API_KEY`
   - `npx wrangler secret put LIVEKIT_API_SECRET`
5. Deploy the Worker with `npx wrangler deploy`. Its public URL becomes `VITE_LIVEKIT_TOKEN_URL`.
6. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and add the two public build variables shown in `.env.live.example`:
   - `VITE_LIVEKIT_TOKEN_URL`: deployed Worker URL
   - `VITE_LIVEKIT_WS_URL`: LiveKit WebSocket URL (starts with `wss://`)
7. Rebuild and deploy FACEBOOM.

## Security notes

- Worker validates Firebase ID tokens, checks the user's Firestore account status, and issues room-scoped tokens. Only the owner can publish; viewers can subscribe only.
- LiveKit API credentials must remain Worker secrets. Never place them in React, Vite variables, Firestore, or GitHub.
- The Firestore rules allow active signed-in members to discover active broadcasts and write append-only comments. Hosts can only end their own stream.
- LiveKit free usage has limits and may incur charges if the account is upgraded or usage exceeds the free allowance. Keep billing disabled unless the owner explicitly approves a paid plan.
- This is an initial live-video feature, not a full production trust-and-safety system. Moderators should be able to review reports about live streams before broad public launch; recording, replay, stream moderation and automated abuse detection are not included.

## Current status

The code is feature-gated by the two Vite settings. Until both settings are configured and the Worker is deployed, the Live screen displays a clear setup message rather than pretending a broadcast is connected.
