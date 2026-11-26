# FACEBOOM no-billing web architecture

## Current decision

For the current website release, keep FACEBOOM on its existing Firebase project, `faceboom-46273`, and use the existing Firebase Authentication and Firestore client SDK. Do not require a second Firebase project, a Cloud Run service, Firebase Functions deployment, a public-data mirror, or a Cloudflare public-data Worker for the basic website.

This is a website-only plan. No app-store packaging or releases are included.

The separate `faceboom-public-data` project created during the earlier isolation investigation is not part of the active website data path. It can remain unused. Do not populate it, deploy to it, grant additional IAM permissions, create service-account keys, or enable billing as part of this plan.

## Existing website data paths

- Authentication and private account profile: Firebase Authentication and `users/{uid}`.
- Public profile directory: `publicProfiles/{uid}`.
- Posts and feed: `posts/{postId}`.
- Comments: `posts/{postId}/comments/{commentId}`.
- Likes: `posts/{postId}/likes/{uid}`.
- Friend requests, friend lists, blocks and notifications: existing Firestore collections and user subcollections.
- Private messages: `conversations/{conversationId}`, its `messages` subcollection, and each member's own `users/{uid}/inbox/{conversationId}` summary.
- Photos and videos: existing Cloudinary uploads; media URLs remain in the corresponding public post/profile records.

The website already contains direct Firestore code paths for the feed, shared public profiles and member-directory pickers. Keep `VITE_PUBLIC_DATA_API_URL` unset/empty in the active web build so those existing direct Firestore paths are used. Do not tighten Firestore `list` permissions on `posts` or `publicProfiles` while the website uses those queries.

## Security requirements

- Keep Firestore Security Rules as the enforcement boundary; never rely on UI hiding alone.
- Require authentication and active-account checks for protected operations.
- Keep `users/{uid}` private and owner-scoped; do not expose email or private account fields in `publicProfiles`.
- Keep conversations, message documents and inbox summaries restricted to the two participants and each inbox owner.
- Keep comments and likes attached to an existing post and enforce author/sender identity, size limits and block restrictions.
- Keep moderator actions restricted to trusted Firebase Auth custom claims. Never allow a user to grant themselves moderator status.
- Keep reports, moderation records, payment/wallet data and other private records unavailable to ordinary directory/feed queries.
- Preserve the existing Firestore rules tests and expand them when a security-rule behavior changes.

## No-billing boundary

Do not start a free trial, attach a billing account, upgrade a plan, deploy Cloud Run, deploy Firebase Functions, run a mirror backfill, or deploy a public-data Worker without a separate explicit approval. Some advanced trusted backend features may remain deferred until a suitable no-billing option is verified or the owner explicitly approves a paid backend.

The public-data synchronizer and mirror Worker code from the earlier isolation experiment may remain in the repository as inactive preparation material, but they are not required by the current website build and must not be deployed as part of this no-billing plan.

## Verification and release gates

1. Run the existing Firestore rules tests and website production build in CI.
2. Confirm the web build has an empty `VITE_PUBLIC_DATA_API_URL`, so it uses the existing Firestore paths.
3. Review the rules tests for public profiles, feed posts, comments, likes, private conversations, messages and inbox access.
4. Keep the production Hosting site and production Firestore rules unchanged until the user explicitly approves a production release.
5. Keep the pull request as a draft until all review and verification gates are complete.

## Feature preservation

This architecture does not intentionally remove the existing website features. In particular, retain private one-to-one messaging, conversation history, inbox summaries, post comments, likes, profiles, friends, photo/video posts and Cloudinary media. Any feature whose secure behavior cannot be proven by the current rules/tests must be marked as pending verification, not described as complete.


## Facebook Lite-style experience and official Facebook interoperability

### FACEBOOM lightweight experience

The product direction is a lightweight, mobile-first website inspired by the simplicity and data efficiency of Facebook Lite. This means:
- Fast initial loading and small JavaScript bundles; lazy-load noncritical screens and media.
- Responsive, simple navigation and readable feed cards.
- Compressed/lazy-loaded image previews where possible; do not autoplay large videos by default.
- Clear low-data behavior and graceful loading/error states.
- Core social workflows remain first-class: profiles, friend discovery/requests, feed, likes, comments, notifications, and private one-to-one FACEBOOM messages.
- Preserve accessible controls, secure authentication and privacy rules. Do not copy Meta branding, proprietary assets, or imply FACEBOOM is an official Facebook product.

### Facebook interoperability: supported scope and limits

FACEBOOM must not claim that it can freely message any personal Facebook account or comment on every personal Facebook profile/post. Meta controls access through its official APIs, permissions, review, Page roles, tokens, messaging windows and platform policies.

Potentially supportable integration, subject to a Meta developer app, asset ownership/admin authorization, required permissions, App Review and policy compliance:
- Connect a Facebook Page that the FACEBOOM operator or an authorized customer administers.
- Read/manage eligible Page posts and comments with the approved Pages API permissions (for example, pages_read_engagement, pages_read_user_content and pages_manage_engagement, as applicable).
- Connect the Page's Messenger experience using the Messenger Platform and approved pages_messaging permissions, allowing permitted conversations with people who message that Page.
- Provide a clearly labeled Facebook Page inbox/comments integration, separate from FACEBOOM member-to-member conversations and comments.

Not promised / not to implement using scraping, browser automation, password collection or unofficial APIs:
- Access to arbitrary personal Facebook inboxes or private messages between two people.
- Sending a Messenger message from a person's personal account as if FACEBOOM were Facebook/Messenger.
- Reading or posting comments on arbitrary personal profiles, private groups or posts without the required object access and authorization.
- Importing Facebook Lite's private code, internal APIs, user data or proprietary assets.

### Product behavior

- FACEBOOM-to-FACEBOOM messaging and comments remain native features stored in FACEBOOM Firestore.
- Facebook Page conversations/comments, if later approved and configured, must be clearly identified as Facebook Page interactions and stored/processed through a secure approved integration. Never merge identities or imply a Facebook user is a FACEBOOM account.
- Keep Meta access tokens and app secrets server-side only; never put them in Vite client variables, GitHub source, or user-visible chat.
- Before implementing the Meta connection, obtain the Page owner/admin's explicit authorization, create/configure a Meta developer app, confirm the exact supported permissions and App Review requirements, and separately approve any backend/billing requirement.
- The current no-billing release does not include a live Meta API connection. This remains a separately gated future integration, not a completed feature.
