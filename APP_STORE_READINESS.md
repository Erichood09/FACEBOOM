# FACEBOOM App Store Readiness

Status date: 2026-11-19  
Branch reviewed: `store-readiness`

This is an engineering readiness record, not a statement that FACEBOOM is approved for either store. The current product is a React/Vite web application hosted on Firebase Hosting.

## Confirmed in the repository

- Firebase Authentication and Cloud Firestore.
- Cloudinary image/video uploads.
- Feed posts, images/videos, likes and comments.
- Member profiles, profile/cover photos, friend discovery, friend requests and friends.
- One-to-one in-app messaging.
- Share links for posts and profiles, plus invitation links and external share targets.
- Report submission controls for posts, accounts and comments in the feed, and for accounts/messages in the messaging UI.
- A moderator report queue guarded by the Firebase Auth custom claim `moderator == true`.
- Per-member block lists and client-side filtering of blocked members from friend discovery, message discovery/inbox, and the current member's feed.
- A GitHub Actions build and Firebase Hosting deployment workflow.

A successful web build or Hosting deployment does not establish store readiness or prove live Firestore behavior.

## Important limitations in the current safety implementation

1. **Blocking is improved but still incomplete.** Firestore rules now deny direct reads of a blocked member's public profile and direct reads of that member's individual post; deny new likes/comments on a post when either party has blocked the other; deny message-history reads when either conversation participant has blocked the other; and continue to prevent blocked pairs from creating/updating friendships, sending messages, or creating conversations. The UI filters the current member's own blocked list from selected discovery, inbox and feed views. Feed, directory, likes and comments collection queries still need careful query-compatible reciprocal enforcement and end-to-end testing; do not claim that every route is hidden or denied.
2. **Moderation is a starter workflow, not a full operations system.** Reports can be submitted and moderators with a trusted custom claim can review status. The app does not yet provide case assignment, appeals, evidence-retention controls, response-time monitoring, content takedown tools, account suspension, or a documented staffed escalation process. No moderator claim has been provisioned.
3. **Report coverage must be verified.** Current visible controls cover feed posts, comments, member profiles through messaging/account controls, and received messages. Profile pages, shared-profile pages, and every possible content entry point need a complete review. Test report creation and moderator-only access against the deployed rules.
4. **Account deletion is not implemented.** There is no trusted server-side cascade for Firebase Authentication, Firestore relationships/messages/reports, and Cloudinary assets. The account-deletion plan is documented separately. Do not display a delete-account control that implies full deletion.
5. **Terms acceptance is not implemented.** A clear affirmative acceptance flow for Terms and Community Guidelines must be added before users create user-generated content, with version and acceptance timestamp recorded appropriately.
6. **Privacy and legal pages are drafts only.** The policy, terms and community guidelines still contain owner decisions and placeholders. They must be verified, completed, legally reviewed where appropriate, published at stable public URLs, and linked inside the app.
7. **Mobile app packaging is not present.** This repository is a web app, not a signed Android App Bundle or iOS app archive. A mobile strategy, real-device testing, store assets and release pipelines remain necessary.
8. **Security and abuse controls need review.** Verify Cloudinary unsigned preset restrictions, permitted formats, upload limits, moderation and cleanup. Never put Cloudinary API secrets or Firebase Admin credentials in browser code.
9. **Automated security tests are not confirmed.** Add Firebase Emulator tests for Firestore rules and tests for account lifecycle, reports, blocking, messaging, invitations and authorization boundaries. A green Vite build is not a substitute.
10. **Operational and store details remain open.** Confirm support contact, publisher/legal name, age rating, target audience, data-safety disclosures, privacy URL, reviewer instructions, retention schedule and moderation response commitments.

## Required work before submission

- Finish and test reciprocal blocking across feed, profiles, friend requests, messaging, and all content access paths. In particular, design query-compatible filtering for feed/directory/subcollection listeners, then validate both block directions in the Firebase Emulator before publishing rules.
- Complete report entry points and moderator procedures; test that ordinary members cannot list or modify other people's reports and cannot grant themselves moderator access.
- Implement full account deletion in a trusted backend. Require recent authentication, safely process related records and shared data, remove owned Cloudinary assets using server-side credentials, handle legally required report retention, and delete the Firebase Authentication account only after cleanup is safely coordinated.
- Add explicit, versioned Terms and Community Guidelines acceptance before user-generated content.
- Finalize and publish accurate Privacy Policy, Terms, Community Guidelines and support/contact pages.
- Review Cloudinary preset security and media abuse controls.
- Add automated Firestore rules and application tests; test on real devices.
- Create and verify Android/iOS builds, store listing assets, disclosures, age ratings and reviewer instructions.

## Owner decisions and information still required

Do not guess these details:
- Public support and moderation email.
- Legal publisher name.
- Public policy/support website URL or approved hosting location.
- Minimum supported age and intended audience.
- Retention periods and moderation response commitments.
- Final store account identity and verification details.

## Cost and release constraints

The project owner has confirmed Firebase Spark (free) and has not approved a billing upgrade or paid service. Keep this work on Spark unless the owner explicitly authorizes a cost change. Firebase Cloud Functions deployment requires the Blaze billing plan; do not enable it or attach billing as part of this work.

The safety pull request must remain a draft until the owner reviews it and the remaining release blockers are resolved. Do not merge or deploy this branch as a production release without explicit approval.

## Current release decision

**NOT READY FOR GOOGLE PLAY OR THE APPLE APP STORE.** The current branch contains useful safety foundations and documentation, but blocking enforcement, full moderation operations, account deletion, legal pages, Terms acceptance, automated security tests and native mobile packaging remain incomplete.
