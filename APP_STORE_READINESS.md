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
- Per-member block lists plus reciprocal `blockedBy` mirrors; blocked pairs are hidden from friend discovery, messaging, feed, shared profiles, and comments. Feed and directory queries exclude blocked IDs at the query level when the list is within Firestore's 30-value `not-in` limit, with client-side filtering retained as a fallback.
- A GitHub Actions workflow that runs Firestore Emulator security tests and builds the web app; push-to-main events are configured to deploy Firebase Hosting.

A successful web build or Hosting deployment does not establish store readiness or prove live Firestore behavior.

## Important limitations in the current safety implementation

1. **Blocking is improved but still incomplete.** Firestore rules now deny direct reads of a blocked member's public profile and direct reads of that member's individual post; deny new likes/comments on a post when either party has blocked the other; deny message-history reads when either conversation participant has blocked the other; and continue to prevent blocked pairs from creating/updating friendships, sending messages, or creating conversations. The UI filters the current member's own blocked list from selected discovery, inbox and feed views. Feed, directory, likes and comments collection queries still need careful query-compatible reciprocal enforcement and end-to-end testing; do not claim that every route is hidden or denied.
2. **Moderation is a starter workflow, not a full operations system.** Reports can be submitted and moderators with a trusted custom claim can review status. The app does not yet provide case assignment, appeals, evidence-retention controls, response-time monitoring, content takedown tools, account suspension, or a documented staffed escalation process. No moderator claim has been provisioned.
3. **Report coverage must be verified.** Visible report controls now cover feed posts, comments, member profiles including shared-profile pages, and received messages. Every possible content entry point and the live deployed behavior still need a complete review.
4. **Account deletion is not implemented.** There is no trusted server-side cascade for Firebase Authentication, Firestore relationships/messages/reports, and Cloudinary assets. The account-deletion plan is documented separately. Do not display a delete-account control that implies full deletion.
5. **Terms acceptance is not implemented.** A clear affirmative acceptance flow for Terms and Community Guidelines must be added before users create user-generated content, with version and acceptance timestamp recorded appropriately.
6. **Privacy and legal pages are drafts only.** The policy, terms and community guidelines still contain owner decisions and placeholders. They must be verified, completed, legally reviewed where appropriate, published at stable public URLs, and linked inside the app.
7. **Mobile app packaging is not present.** This repository is a web app, not a signed Android App Bundle or iOS app archive. A mobile strategy, real-device testing, store assets and release pipelines remain necessary.
8. **Security and abuse controls need review.** Verify Cloudinary unsigned preset restrictions, permitted formats, upload limits, moderation and cleanup. Never put Cloudinary API secrets or Firebase Admin credentials in browser code.
9. **Automated security tests have limited confirmed coverage.** GitHub Actions completed all thirteen Firestore Emulator regression tests and the application production build successfully on 2026-11-19. The tests cover private-profile creation identity and authenticated-email matching, profile-field authorization and authentication-email immutability, public-profile access, direct-post access, owner-only inbox queries, conversation/message-history denial after blocking, blocked like/comment creation, blocked friend-request/message creation, atomic inbox cleanup, cleanup after a persisted block, report privacy and moderator-only updates, and atomic first-message plus inbox creation. These tests do not cover account lifecycle, invitations, every query path, UI behavior, or production data. A green build is not a substitute for end-to-end testing.
10. **Operational and store details remain open.** Confirm support contact, publisher/legal name, age rating, target audience, data-safety disclosures, privacy URL, reviewer instructions, retention schedule and moderation response commitments.

## Required work before submission

- Complete server-enforced block privacy for feed, directory, likes and comments collection queries, including cases with more than 30 blocked UIDs; test all paths and both block directions before publishing rules.
- Complete report entry points and moderator procedures; test that ordinary members cannot list or modify other people's reports and cannot grant themselves moderator access.
- Implement full account deletion in a trusted backend. Require recent authentication, safely process related records and shared data, remove owned Cloudinary assets using server-side credentials, handle legally required report retention, and delete the Firebase Authentication account only after cleanup is safely coordinated.
- Add explicit, versioned Terms and Community Guidelines acceptance before user-generated content.
- Finalize and publish accurate Privacy Policy, Terms, Community Guidelines and support/contact pages.
- Review Cloudinary preset security and media abuse controls.
- Expand automated Firestore rules and application tests to cover account lifecycle, reports, invitations, query compatibility and authorization boundaries; test on real devices.
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

## Firestore rules test automation (draft branch)

A Firestore Emulator test harness is now included on this review branch:
- `npm run test:rules` starts the Firestore Emulator and runs Node's built-in test runner.
- The thirteen automated cases check private-profile creation identity and authenticated-email matching, profile and post access, owner-only inbox queries, reciprocal block enforcement for conversation history and social actions, inbox cleanup, authorization of reciprocal block mirrors, atomic first-message creation, and report privacy and moderator-only report updates. All thirteen passed in completed GitHub Actions run 44498997280.
- The pull-request workflow runs these rules tests before the production build step.
- These tests run against the draft `firestore.rules` file only. They do not publish rules to the live Firebase project. The app also repairs missing private profile documents for authenticated legacy accounts using a transaction.

The latest completed draft-branch CI run with the thirteen-test suite (2026-11-19; run 44498997280) passed all thirteen Firestore Emulator regression tests and the production build. The report test verifies report privacy, rejects forged reporter identity and reporter-side edits, and permits status updates only for a trusted moderator claim. The profile tests verify that members can update permitted profile fields but cannot change the stored authentication email, and that profile creation is limited to the authenticated UID and Firebase Auth token email. Hosting deployment was skipped because this was a pull-request validation run; no production release or Firestore rules publication occurred. The suite remains an initial security regression baseline, not complete coverage of every collection, query, friendship transition, moderator action, or client workflow. Expand it and test query compatibility before publishing any revised rules.

