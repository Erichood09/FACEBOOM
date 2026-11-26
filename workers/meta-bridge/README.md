# FACEBOOM Meta Page Bridge

This Worker is a server-side integration for the FACEBOOM Facebook Page. It supports:

- Messenger webhook events delivered to the FACEBOOM Page.
- Moderator-only replies to Page-scoped Messenger conversations.
- Facebook Page feed comment webhook events.
- Moderator-only replies to eligible Page comments.

It does **not** access personal Facebook inboxes, private profile comments, or provide unrestricted person-to-person Facebook messaging. Messenger recipient consent and Meta's messaging window/policy are enforced by Meta.

## No-billing deployment plan

The Worker and D1 database are designed to run on Cloudflare's Workers Free plan within its published usage limits. Do not upgrade the Cloudflare account or enable billing for this setup. Free-plan limits can pause queries or requests when exceeded; they do not authorize automatic paid upgrades.

## Required setup

1. Create a Meta app in Meta for Developers and add the Messenger product and Webhooks product.
2. Connect the official FACEBOOM Facebook Page to the app.
3. Request the Page permissions required for the selected features:
   - Messenger: `pages_messaging`, `pages_manage_metadata`, and `pages_read_engagement`.
   - Page comments: `pages_manage_engagement`, plus the relevant read permissions such as `pages_read_user_content` and `pages_read_engagement`.
4. Complete Meta App Review and any business verification Meta requires before public users can use the integration. Development mode is restricted to app-role testers.
5. In Cloudflare, create a D1 database named `faceboom-meta-bridge`. Copy its database ID into `wrangler.toml`, replacing the all-zero placeholder.
6. From `workers/meta-bridge`, run:
   ```sh
   npm install
   npx wrangler d1 migrations apply faceboom-meta-bridge --remote
   npx wrangler secret put META_APP_SECRET
   npx wrangler secret put META_VERIFY_TOKEN
   npx wrangler secret put META_PAGE_ACCESS_TOKEN
   ```
   Set the non-secret `META_PAGE_ID` variable in the Worker settings. Never put app secrets or Page access tokens in browser code, Git, chat, or screenshots.
7. Deploy with `npx wrangler deploy`. The webhook URL is `https://<worker-name>.<account-subdomain>.workers.dev/webhook`.
8. In the Meta app's Webhooks configuration, set that HTTPS callback URL and the same verify token. Subscribe the Page to `messages`, `messaging_postbacks`, and `feed`, then install/subscribe the app on the Page.
9. Add the deployed Worker base URL as the Vite build variable `VITE_META_BRIDGE_URL`. Rebuild and deploy the website only after the owner approves that release.
10. Assign the Firebase `moderator: true` custom claim only to the authorized FACEBOOM administrator/moderator accounts that should manage the Page inbox.

## API routes

- `GET /webhook`: Meta webhook verification challenge.
- `POST /webhook`: validates `X-Hub-Signature-256` and stores Page events.
- `GET /v1/meta/status`: moderator-only setup status.
- `GET /v1/meta/inbox?type=messages|comments`: moderator-only inbox list.
- `GET /v1/meta/conversation?psid=<PAGE_SCOPED_ID>`: moderator-only Messenger history.
- `POST /v1/meta/messages`: sends a Page Messenger reply.
- `POST /v1/meta/comments`: publishes a reply to a Page comment.

All app API routes require a valid Firebase ID token with the `moderator: true` custom claim. The Page access token and Meta app secret remain server-side Worker secrets.
