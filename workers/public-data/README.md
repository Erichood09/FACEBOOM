# FACEBOOM public data security Worker

This read-only Cloudflare Worker is designed to become the trusted read path for the public post feed and Find Friends directory.

## Why it exists

Firestore Security Rules cannot filter a collection query result by dynamically checking every author's block relationship. The browser must not be trusted to filter blocked members after downloading their posts or profiles. This Worker authenticates the Firebase ID token, reads the viewer's account and both directions of their block relationships with a narrowly permissioned Google service account, then removes hidden members before returning public data.

## Endpoints

- `GET /v1/health` — non-sensitive service health.
- `GET /v1/feed` — newest 100 posts after excluding the viewer, members they blocked, and members who blocked them. An opaque cursor is returned when another page exists.
- `GET /v1/directory` — up to 100 public profiles after the same exclusion rules.

All data responses require a Firebase ID token in the Authorization header. Only exact origins in `FACEBOOM_ORIGINS` are accepted. Responses are marked `no-store`.

## Required configuration (not deployed by this change)

1. Create a dedicated Google Cloud service account for this Worker.
2. Grant it only the Firestore read-only role needed to read the FACEBOOM database (for example, `roles/datastore.viewer`). Do not grant project Owner or Editor.
3. Store the service-account JSON as the Cloudflare Worker secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit it, place it in Vite variables, or send it in chat.
4. Set `FIREBASE_PROJECT_ID=faceboom-46273` and `FACEBOOM_ORIGINS` to the exact production and approved preview origins.
5. Deploy the Worker and configure its URL as `VITE_PUBLIC_DATA_API_URL` in the web build.
6. Only after the Worker is deployed and verified should Firestore `list` access for `posts` and `publicProfiles` be denied to browser clients.

The service-account key is a sensitive credential. Prefer a dedicated account, minimal IAM permissions, key rotation, and Cloudflare secrets. Do not deploy or create a key until the project owner is ready to configure it.

## Safety boundaries

- This Worker is read-only; it does not create, update, or delete Firestore documents.
- It never returns the viewer's private profile, block records, or account details.
- It fails closed if authentication, account-state, or block-list checks fail.
- The first version intentionally limits directory output to 100 profiles and feed reads to 100 posts per page. Search and full pagination can be added after the secure path is live and measured.
- Do not close the existing Firestore list rules until the client has been switched to this Worker and its production endpoint is confirmed. Otherwise the feed and directory would stop loading.
