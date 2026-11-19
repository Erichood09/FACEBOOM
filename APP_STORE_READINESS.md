# FACEBOOM App Store Readiness

Status date: 2026-11-19

This document tracks the work required before FACEBOOM can be submitted to Google Play and the Apple App Store. A successful website build or Firebase Hosting deployment does not mean the app is store-ready.

## Confirmed in the current repository

- React + Vite web application.
- Firebase Authentication and Cloud Firestore.
- Cloudinary unsigned media uploads.
- Feed posts, images/videos, likes and comments.
- Profiles, friends, friend requests and private messages.
- Firebase Hosting deployment workflow.

## Release blockers identified in the current source

1. **User reporting and moderation:** no complete in-app flow for reporting a post, profile, comment or private message; no secured moderation queue or documented response process.
2. **User blocking:** no complete block/unblock feature, and no enforcement across discovery, feed, friend requests and private messaging.
3. **Account deletion:** current Firestore rules deny user-document deletion. There is no trusted backend cascade that removes or anonymizes the user's records and Cloudinary media, and then deletes the Firebase Authentication account.
4. **Privacy and legal documents:** publishable privacy policy, terms of service, community standards and a real support contact have not been finalized.
5. **Mobile application:** the current repository is a web app. It does not yet contain an Android or iOS native project or store build pipeline.
6. **Security review:** unsigned Cloudinary uploads need restrictive preset settings and abuse controls. Do not place a Cloudinary API secret in browser code.
7. **Automated testing:** no confirmed automated tests for Firestore rules, account lifecycle, moderation, blocking or end-to-end app flows.
8. **Store listing:** app icon, screenshots, accurate data-safety/privacy disclosures, age rating, support URL and reviewer instructions must be prepared.

## Required implementation before submission

- Add report flows for posts, profiles, comments and messages.
- Store reports in a restricted collection. Only trusted moderators should read or resolve reports; ordinary users must not be able to edit or delete submitted reports.
- Add blocking with server-enforced rules and ensure blocked accounts cannot contact each other or appear in relevant discovery/feed results.
- Implement account deletion through a trusted server environment (Firebase Admin SDK / Cloud Functions or equivalent). The workflow must require recent authentication, remove or anonymize related Firestore data, delete owned media using server-side Cloudinary credentials, and delete the Authentication account. Never expose service credentials in the client.
- Add explicit acceptance of Terms and Community Guidelines before a user first creates user-generated content.
- Publish complete privacy, terms, community-guideline and support pages with verified owner/contact details.
- Add a native mobile wrapper or native implementation, then test on real Android and iPhone devices.
- Add Firebase Emulator tests for Firestore rules and automated UI tests.
- Review Cloudinary upload restrictions, file type validation, size limits, abuse controls and retention/deletion.
- Complete Google Play and Apple store disclosures accurately.

## Owner inputs required

These must be supplied by the app owner and must not be guessed:
- Public support/moderation email address.
- Legal publisher name to display in policies and store accounts.
- Public support/privacy-policy website URL (or approval to publish the pages on a chosen domain).
- Minimum supported age and the intended age group.
- Data retention and moderation response commitments.
- Store account identity and verification information.

## Current release decision

**NOT READY FOR STORE SUBMISSION.** Do not submit the current website or describe it as a completed native app. Close every blocker above, run the tests, and review the store-specific requirements before submission.
