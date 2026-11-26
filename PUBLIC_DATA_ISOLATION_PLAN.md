# FACEBOOM isolated public-data architecture

## Decision

Use a separate Google Cloud/Firebase project as a public-data mirror. Do not give the Cloudflare Worker a Firestore credential for the production FACEBOOM project.

This is a website-only architecture. It does not introduce app-store packaging or releases.

## Data flow

1. Members continue to authenticate against the existing Firebase project, `faceboom-46273`.
2. The public-data Worker verifies the Firebase ID token against that authentication project.
3. Trusted Firebase Functions v2 Firestore event handlers receive source document changes and copy only approved fields into a separate public-data project.
4. The synchronizer also maintains `viewerAccess/{uid}` in the mirror, containing account access status and the two block-ID lists needed for filtering. It does not copy email addresses, private messages, inboxes, reports, moderation notes, or private account fields.
5. The Worker reads feed posts, public profiles, and only the signed-in member's `viewerAccess` record from the isolated project.
6. The browser continues to use Firebase directly for private, participant-scoped features such as inboxes, messages, friend requests, notifications, likes, comments, and moderator-only tools.

## Mirror schema

### `publicProfiles/{uid}`

Allowlisted fields: `uid`, `fullName`, `username`, `country`, `bio`, `photoURL`, `coverPhotoURL`, `updatedAt`.

### `posts/{postId}`

Allowlisted fields: `authorId`, `authorName`, `authorUsername`, `text`, `mediaUrl`, `mediaType`, `createdAt`. The source media public ID and moderation/internal metadata are not copied. Records without a valid `authorId` are rejected.

### `viewerAccess/{uid}`

Allowlisted fields: `accountStatus`, `suspensionUntil`, `ownBlockedIds`, `blockedByIds`, `updatedAt`. This collection is backend-only; client Firestore rules must deny all access.

### `blockEdges/{blockerUid}__{blockedUid}`

Backend-only synchronization metadata. It tracks the latest source event time and whether the canonical block relationship exists. Client access must be denied.

## Synchronizer implementation

The repository now contains Firebase Functions v2 handlers in `functions/index.js`:

- `publicProfiles/{uid}`: allowlisted profile upsert/delete.
- `posts/{postId}`: allowlisted post upsert/delete.
- `users/{uid}`: account status and suspension mirror.
- `users/{uid}/blocked/{blockedUid}`: transactionally updates both affected members' block arrays and an idempotency/version record.

The canonical `blocked` subcollection is the sole block trigger. The source `blockedBy` mirror is not separately triggered, avoiding duplicate/conflicting updates. Event handlers use the event payload and do not query source Firestore. The destination project is configured by the `PUBLIC_DATA_PROJECT_ID` Functions parameter. The runtime identity must use Application Default Credentials / its attached service identity; do not create a downloadable long-lived key for the synchronizer.

The pure allowlist and block-state helpers have Node tests in `functions/test/mirror.test.js`.

## IAM and secret boundaries

- The Worker credential must be authorized only in the isolated public-data project. It must not have any role in `faceboom-46273`.
- The synchronizer runtime identity needs source event delivery plus write access to the isolated mirror. Its source trigger payloads are the only source data input; no source Firestore reads are performed by the handler code.
- The Worker verifies source-project Firebase ID tokens using `FIREBASE_AUTH_PROJECT_ID=faceboom-46273`, but all Firestore REST reads use `FIREBASE_PUBLIC_DATA_PROJECT_ID`.
- Firestore's standard data-viewer IAM role is project-scoped. Therefore the Worker identity can technically read all documents in the mirror project. Keep that project restricted to the allowlisted public mirror plus the minimum access metadata; never place other private application data there.
- Do not place service credentials in Vite variables, browser code, GitHub commits, or chat messages.
- Deny all client access to `viewerAccess` and `blockEdges` in the mirror project's Firestore rules.

## Cutover sequence

1. Create the isolated public-data Firebase/Google Cloud project and enable Firestore.
2. Configure the source synchronizer runtime identity with permission to write to the mirror; configure the Worker-only read identity in the mirror project.
3. Deploy the source event handlers with `PUBLIC_DATA_PROJECT_ID` set to the mirror project ID.
4. Run a controlled one-time backfill for existing public profiles, posts, account statuses, and block relationships. Event handlers alone only synchronize changes after deployment.
5. Validate mirror counts and sampled records without exposing private fields.
6. Deploy the Worker with separate auth-project and public-data-project IDs.
7. Set the production web build's `VITE_PUBLIC_DATA_API_URL`.
8. Verify feed, Find Friends, shared public profile, and Messages member picker against the Worker.
9. Only then deny browser `list` access to source `posts` and `publicProfiles`; keep required private subcollection permissions intact.
10. Keep the existing production site and rules unchanged until all checks pass and an explicit production cutover is approved.

## Current status and blockers

- Synchronizer source code, allowlist helpers, tests, Worker mirror-only reads, and shared-profile API routing are committed on the preparation branch.
- Separate public-data project created: `faceboom-public-data`. Firestore database location and setup are still pending. No event handler or Worker has been deployed, no backfill has run, and no production site or rules have changed.
- Project creation and deployment may require enabling billing. Do not enable billing or paid services without explicit approval.
- Do not merge the deployment PR or deploy production as part of this preparation step.
