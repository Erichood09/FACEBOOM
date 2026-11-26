# FACEBOOM isolated public-data architecture

## Decision

Use a separate Google Cloud/Firebase project as a public-data mirror. Do not give the Cloudflare Worker a Firestore credential for the production FACEBOOM project.

This is a website-only architecture. It does not introduce app-store packaging or releases.

## Data flow

1. Members continue to authenticate against the existing Firebase project, `faceboom-46273`.
2. The public-data Worker verifies the Firebase ID token against that authentication project.
3. A trusted server-side synchronizer receives source Firestore change events and copies only approved public fields into a separate public-data project.
4. The synchronizer also maintains a per-member `viewerAccess/{uid}` mirror containing account access status and the two block-ID lists needed for filtering. It must not copy email addresses, private messages, inboxes, reports, moderation notes, or private account fields.
5. The Worker reads feed posts, public profiles, and the signed-in member's `viewerAccess` record only from the isolated public-data project.
6. The browser continues to use Firebase directly for private, participant-scoped features such as inboxes, messages, friend requests, notifications, likes, comments, and moderator-only tools.

## Public mirror schema

### `publicProfiles/{uid}`
Allowlisted fields only: `uid`, `fullName`, `username`, `country`, `bio`, `photoURL`, `coverPhotoURL`, `updatedAt`.

### `posts/{postId}`
Copy only the fields required to render a public feed post. Preserve the source document ID. Do not copy private moderation or internal-only metadata. The synchronizer must reject records without a valid `authorId`.

### `viewerAccess/{uid}`
Allowlisted fields only: `accountStatus`, `suspensionUntil`, `ownBlockedIds`, `blockedByIds`, `updatedAt`. This document is private to the backend: deny all direct client reads and writes in the mirror project's Firestore rules.

## Required source event handlers

Deploy trusted Firestore event handlers in the source project for:
- `publicProfiles/{uid}`: upsert/delete the allowlisted profile mirror.
- `posts/{postId}`: upsert/delete the allowlisted post mirror.
- `users/{uid}`: update account status and suspension information in `viewerAccess/{uid}`.
- `users/{uid}/blocked/{blockedUid}`: maintain `ownBlockedIds`.
- `users/{uid}/blockedBy/{blockerUid}`: maintain `blockedByIds`.

Handlers must be idempotent, handle delete events, preserve source document IDs, and avoid logging document contents. For block-list changes, use transactions on the public mirror document so concurrent events do not overwrite each other's arrays. Reconcile existing users, posts, profiles, and block relationships with a one-time controlled backfill before enabling the Worker.

## IAM and secret boundaries

- The Worker credential must be authorized only in the isolated public-data project. It must not have any role in `faceboom-46273`.
- The synchronizer's runtime identity needs read access to the specific source collections and write access to the isolated mirror. Google Firestore IAM does not provide collection-level resource scoping for the standard data roles; therefore the synchronizer remains trusted server-side code. Use an attached runtime identity / Application Default Credentials, not a downloadable long-lived JSON key.
- The Worker verifies source-project Firebase ID tokens using `FIREBASE_AUTH_PROJECT_ID=faceboom-46273`, but all Firestore REST reads must use `FIREBASE_PUBLIC_DATA_PROJECT_ID`.
- Do not place service credentials in Vite variables, browser code, GitHub commits, or chat messages.
- Deny all client access to `viewerAccess` in the mirror project. Public profile and post mirror read access should be granted only to the Worker identity; the Worker itself performs authentication and block filtering.

## Cutover sequence

1. Create the isolated public-data Firebase/Google Cloud project and enable Firestore.
2. Configure the synchronizer runtime identity and the Worker-only read identity in the mirror project.
3. Deploy event handlers and run a controlled initial backfill.
4. Validate mirror counts and sampled records without exposing private fields.
5. Deploy the Worker with separate auth-project and public-data-project IDs.
6. Set the production web build's `VITE_PUBLIC_DATA_API_URL`.
7. Verify feed, Find Friends, shared public profile, and Messages member picker against the Worker.
8. Only then deny browser `list` access to source `posts` and `publicProfiles`; keep required private subcollection permissions intact.
9. Keep the previous production site and rules unchanged until all checks pass and an explicit production cutover is approved.

## Current status and blockers

- The design is documented; no separate cloud project has been created by this repository change.
- No cloud resources, billing settings, secrets, production rules, or production hosting have been changed.
- A project owner must create or authorize the separate project. Cloud resource creation/deployment may require enabling billing; do not enable billing or paid services without explicit approval.
- The current public-data Worker still uses the original single-project configuration and must be refactored to this two-project mirror schema before deployment.
- Do not merge the deployment PR or deploy production as part of this preparation step.
