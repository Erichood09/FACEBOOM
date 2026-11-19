# FACEBOOM account deletion — implementation plan and release gate

**Status: NOT IMPLEMENTED.** This document records the verified data inventory and the safe implementation boundary. It is not a deletion feature and must not be presented to members as one.

## Data that must be considered

A FACEBOOM member can have data in several places:

- Firebase Authentication: the login account.
- Firestore `users/{uid}`: private profile and account metadata.
- Firestore `publicProfiles/{uid}`: searchable profile directory entry.
- Firestore `posts`: posts authored by the member, including Cloudinary media identifiers and URLs.
- Firestore subcollections: comments and likes under posts; comments authored by the member may be on other members' posts.
- Friend data: `users/{uid}/friends`, other members' reciprocal friend documents, and `friendRequests` where the member is sender or recipient.
- Blocking data: `users/{uid}/blocked` and other members' block documents targeting this member.
- Messaging: `conversations` and their `messages` subcollections. A conversation contains two participants and shared message history.
- Reports: `reports` may contain the member as reporter or reported target. Reports may need restricted retention for safety, abuse investigation, and legal obligations rather than unconditional deletion.
- Cloudinary: profile photos, cover photos, and post media. Existing upload records store public IDs for post media; the current profile schema stores URLs, and not all profile media deletion identifiers are guaranteed to exist.

## Why a client-only delete button is unsafe/incomplete

Firebase Authentication's web `deleteUser` operation requires recent sign-in. It deletes the Auth account, not the member's complete Firestore graph or Cloudinary media. Deleting the Auth account first can also remove the member's ability to authenticate to clean up remaining records.

Firestore client-side cleanup is not sufficient for this app: it spans documents owned by other users, reciprocal friend records, nested subcollections, and shared conversations. A browser must not receive Firebase Admin credentials or Cloudinary API secrets. Cloudinary's Admin API deletion requires server-side credentials/signatures; never put the API secret in the React app.

## Recommended implementation

Build a trusted server-side deletion workflow with these stages:

1. Require the signed-in member to request deletion, confirm the consequences, and re-authenticate where required.
2. Create a deletion job bound to the authenticated UID. The backend must verify the Firebase ID token and must never accept a caller-supplied UID as authority.
3. Mark the account as pending deletion and block new posts, comments, friend requests, and messages while cleanup runs.
4. Use Firebase Admin SDK in a trusted backend to enumerate and delete the member's private/public profile data, authored posts and their likes/comments, the member's comments on other posts, friend/request/block records, and their message data according to a documented shared-conversation retention policy.
5. Delete Cloudinary media using server-side credentials and the stored public IDs/asset IDs. Before launch, update uploads to persist the necessary asset identifiers for profile and cover images too.
6. Delete the Firebase Authentication user only after the data cleanup steps succeed. Make the job retryable and idempotent; record failures without exposing private data.
7. Preserve only narrowly justified safety/report records where retention is required, with access restricted to authorized moderators and a published retention period. Do not silently retain all user content.
8. Show the member a clear completion or failure status and provide a support contact for unresolved deletion requests.

## Cost and deployment constraint

The Firebase project is currently on Spark. Firebase documents that deploying Cloud Functions requires the Blaze plan and a linked billing account. Cloud Functions has no-cost usage quotas on Blaze, but Blaze is still pay-as-you-go and deployment can incur charges. Do not upgrade the project, attach a payment method, or deploy a paid backend without the owner's explicit approval.

A different trusted backend could be evaluated if it can securely hold Admin SDK and Cloudinary secrets, verify Firebase ID tokens, perform the required cleanup, and provide reliable job retries. It must be reviewed for cost, privacy, and operational reliability before adoption. A browser-only workaround is not an acceptable substitute.

## Release gates

- [ ] Owner approves a backend option and any billing implications.
- [ ] Data inventory and retention policy are finalized, especially shared conversations and reports.
- [ ] Upload flow persists Cloudinary identifiers for profile and cover media.
- [ ] Backend cleanup is implemented, authenticated, idempotent, retryable, and audited.
- [ ] Firestore rules prevent a pending-deletion account from creating new content.
- [ ] Tests cover partial failures, re-authentication, retries, and cross-user records.
- [ ] In-app deletion request and completion states are tested end to end.
- [ ] Privacy policy and store disclosures accurately describe deletion and retention.

Until all gates pass, account deletion remains an outstanding release blocker. Do not add a button that claims to delete the complete account.
