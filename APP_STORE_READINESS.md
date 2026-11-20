# FACEBOOM release readiness

Last reviewed: 2026-11-19  
Production site: https://faceboom-46273.web.app  
Production deployment: https://github.com/Erichood09/FACEBOOM/actions/runs/44500521612

## Current product

FACEBOOM is a React/Vite web application hosted on Firebase Hosting. It now includes a Progressive Web App manifest and app icon so supported browsers can offer installation to a device home screen. This does not create a native Android or iOS binary.

Implemented web features:
- Firebase Authentication: email/password registration, login and password reset
- Firestore member profiles and public profile directory
- Profile and cover image uploads through Cloudinary
- Text, photo and video posts, likes and comments
- Friend discovery, friend requests and friends list
- One-to-one private messaging
- Reporting and blocking controls
- Moderator report queue guarded by the Firebase Auth custom claim `moderator == true`
- Share links and invitation links
- Responsive web layout and PWA manifest/icon

## Verified production release (2026-11-19)

The main-branch GitHub Actions deployment run completed successfully:
- 13 Firestore Emulator security tests passed.
- Vite production build passed.
- Firestore Rules API deployment passed.
- Firebase Hosting live deployment passed.

This confirms that the release pipeline completed. It is not a substitute for a complete production end-to-end test across every feature and every account state.

## Remaining safety and operational release blockers

### 1. Account deletion — NOT IMPLEMENTED

A browser-only delete button would be unsafe and incomplete. Complete deletion must coordinate Firebase Authentication, private/public profiles, authored posts and nested comments/likes, comments on other members' posts, reciprocal friendship/block records, shared conversations, report retention, and Cloudinary assets.

A trusted backend is required to verify identity, perform retryable/idempotent cleanup, remove Cloudinary assets using server-side credentials, and delete the Auth account only after cleanup. Firebase Cloud Functions deployment requires Blaze billing. The owner has not approved a billing upgrade; do not enable billing or deploy a paid backend without explicit approval. See `ACCOUNT_DELETION_PLAN.md`.

### 2. Blocking privacy — PARTIALLY IMPLEMENTED

Rules deny direct reads of blocked public profiles and individual posts, block new likes/comments on a post after either side blocks the other, deny blocked conversation/message-history reads, and prevent blocked pairs from creating new friend requests, friendships or messages. Client views also filter blocked IDs from selected feed, directory, inbox and comment views.

However, Firestore collection-list rules for posts, public profiles, likes and comments do not yet provide complete server-enforced privacy for every query. The client-side `not-in` strategy is limited to 30 values. Do not claim all blocked data is inaccessible through every collection query or for arbitrarily large block lists. A query-compatible data-model redesign and expanded emulator tests are still needed before this can be marked complete.

### 3. Moderation — CORE ACCOUNT ENFORCEMENT IMPLEMENTED; OPERATIONS STILL REQUIRED

Users can submit reports; reports are private to their reporter and trusted moderators. The moderator panel supports report status updates, reasoned warnings, 24-hour/7-day/30-day suspensions, permanent bans, reinstatement, member appeals and append-only action history. Firestore Security Rules enforce account status across the main member operations, and timed suspensions expire automatically. A trusted moderator claim has been provisioned for the project; see `MODERATOR_SETUP.md` for secure administration details.

Remaining work includes staffed moderation coverage, case assignment, response targets, content takedown and Cloudinary media removal, email/push notifications, and a privacy-reviewed process for reports involving private messages. Moderators do not receive general access to private conversation contents. A suspension or ban does not delete the Firebase Authentication identity or existing posts/media.
### 4. Legal pages and acceptance — NOT READY

Privacy Policy, Terms of Service and Community Guidelines are owner-review drafts, not publishable legal documents. Required owner-supplied details remain unknown:
- Verified legal publisher name
- Monitored public support/privacy contact email
- Effective date and public policy URL
- Minimum age and intended audience
- Accurate data retention, deletion and moderation practices
- Appeals and escalation process

Terms and Community Guidelines acceptance is not yet enforced before members create user-generated content. Do not publish placeholder legal documents or represent that users have accepted terms when the application has not recorded acceptance.

### 5. Mobile stores — NOT READY

The repository contains a web app/PWA only. It does not contain a signed Android App Bundle or iOS archive. Store submission still needs:
- A chosen and tested native packaging strategy
- Real-device testing on supported Android and iOS versions
- Store listing name, descriptions, screenshots, app icon and promotional assets
- Age rating, target-audience declarations and data-safety/privacy disclosures
- Stable public policy/support URLs
- Reviewer notes and test/demo account where required
- Registered and verified developer accounts

A PWA install option is not the same as native store packaging or store approval.

## Cost and privacy guardrails

The owner has not approved paid billing. Keep Firebase on the existing plan and do not add paid services, attach a payment method, or deploy a paid backend without explicit approval. Never commit Firebase service-account JSON or Cloudinary API secrets. Browser Firebase configuration is not a substitute for server-side credentials.

## Release decision

**The web application has a successful production deployment. FACEBOOM is NOT ready to be described as fully launch-ready for public app stores.** Account deletion, complete query-level block privacy, staffed moderation operations, finalized legal documents and acceptance, and native app packaging remain open.
