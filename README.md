# FACEBOOM

FACEBOOM is a React 19 + Vite social web application using Firebase Authentication, Cloud Firestore and Cloudinary.

## Current production website

https://faceboom-46273.web.app

## Features in the current web application

- Email/password registration, login and password reset
- Member profiles with profile and cover photos
- Text, photo and video posts
- Likes and comments
- Friend discovery, requests and friend lists
- One-to-one private messaging
- Reporting and blocking controls
- Moderator report queue, reasoned warnings, temporary/permanent account restrictions, reinstatement, member appeals and append-only moderation history protected by the Firebase Auth custom claim `moderator: true`
- Share links and invitation links
- Progressive Web App manifest for supported browsers to install the website

## Local development

Requirements: Node.js 24 or newer and Java 21 for Firestore Emulator tests.

```bash
npm install
npm run dev
```

## Verification

```bash
npm run test:rules
npm run build
```

The rules tests run against the Firestore Emulator. They do not exercise every UI path or replace production end-to-end testing.

## Deployment

A push to `main` runs the GitHub Actions workflow. It runs Firestore rules tests and a production build, publishes the Firestore rules through the Firebase Rules API, and deploys Firebase Hosting.

Required GitHub repository secret:
- `FIREBASE_SERVICE_ACCOUNT_FACEBOOM_46273`

The service account must be authorized to publish Firestore Rules and Firebase Hosting. Never commit service-account JSON or Cloudinary API secrets.

## Important launch limitations

FACEBOOM is currently a web app/PWA, not a signed Android App Bundle or iOS application.

- Complete account deletion is not implemented. A safe implementation needs a trusted backend to coordinate Firebase Authentication, Firestore relationships/messages and Cloudinary asset deletion.
- Blocking has meaningful protections, but collection-query privacy is not yet complete for every data path or for arbitrarily large block lists.
- Moderator access must be provisioned by a trusted administrator using Firebase Admin SDK; a normal user cannot self-assign the moderator claim.
- Legal documents are owner-review drafts. They contain owner-specific decisions and must not be published until the legal publisher name, contact details, age policy, retention practices and effective date are verified.
- Terms and Community Guidelines acceptance is not yet enforced in the application.
- Native store packaging, store listing assets, age rating, data-safety disclosures and real-device release testing remain outstanding.

Do not represent the project as ready for Google Play or the Apple App Store until the release gates in `APP_STORE_READINESS.md` are complete.
