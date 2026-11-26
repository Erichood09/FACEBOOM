# Block-aware privacy remediation

**Status: design and verification required — no production rules changed.**

## Confirmed current limitation

The current Firestore rules allow authenticated active members to list `publicProfiles` and `posts`. Individual document reads check `blockedEither`, but collection-list authorization does not currently apply the same per-document block check. The React client filters known blocked UIDs after fetching. Client-side filtering is not a security boundary: data already returned to the browser can be inspected.

The existing client also uses a bounded Firestore `not-in` strategy. A rules-only change would likely cause legitimate feed/directory queries to fail when blocked members are present, rather than safely filtering those documents.

## Required security outcome

- A member must not receive another member's profile or posts when either side has blocked the other.
- This must hold for feed, profile directory, direct links, pagination, search, and any future media surfaces.
- No client-side filter may be treated as the authorization boundary.
- Existing friendships, messaging, Live, reporting, moderation, and posting behavior must remain intact.
- No Firebase Blaze upgrade, paid deployment, or production rollout is authorized by this plan.

## Recommended implementation investigation

1. Map every query and read path for `posts`, `publicProfiles`, nested `comments` and `likes`, search, and shared-post links.
2. Identify a query-compatible visibility architecture. Firestore Security Rules are not result filters; a query must prove that every possible result is authorized.
3. Prefer a trusted server-maintained per-member feed/visibility index if a secure, affordable backend can be operated without exposing privileged credentials. Do not let browser clients write authoritative visibility records.
4. If no trusted backend can be used on the current free setup, choose a conservative data model and UX that can be enforced by Firestore queries/rules, and document its limits. Do not claim arbitrary block-list privacy until it is actually enforced.
5. Add emulator tests for both block directions, direct document reads, collection queries, pagination, shared links, nested comments/likes, and block/unblock transitions.
6. Update the app queries and rules together, run the full Firestore emulator suite and production build, then review the diff before requesting merge.

## Explicit non-goals

- Do not replace all Firestore rules with a permissive rule.
- Do not rely on hiding items in React after fetching them.
- Do not put Firebase Admin credentials, service-account keys, Cloudinary secrets, or payment secrets in browser code or Git.
- Do not alter the production Firebase project, Cloudflare production Worker, live site, or merge an existing pull request as part of this investigation.

## Release gate

Mark this issue complete only after tests demonstrate that blocked content is not returned by any supported query path, with existing app features still passing. Until then, describe block privacy as partially implemented.
