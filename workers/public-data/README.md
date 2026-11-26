# FACEBOOM public-data Worker

This Worker is intended to serve the authenticated news feed and public member directory without allowing browser clients to enumerate the production Firestore collections.

## Security architecture

**Do not deploy the current Worker implementation.** Its current code reads the production project's user documents, block subcollections, posts, and publicProfiles using one Google service credential. Even if the code requests only those paths, the credential's Firestore IAM permissions are not collection-scoped.

The approved direction is an isolated public-data mirror project. See [PUBLIC_DATA_ISOLATION_PLAN.md](../../PUBLIC_DATA_ISOLATION_PLAN.md) for the complete schema, event-sync requirements, IAM boundaries, and cutover sequence.

The target Worker must:
- Verify Firebase ID tokens against the authentication project `faceboom-46273`.
- Read all Firestore data exclusively from the separate public-data project.
- Read only `posts`, `publicProfiles`, and the requesting member's `viewerAccess/{uid}` record in that isolated project.
- Never possess a credential or IAM role in the production source project.
- Fail closed when authentication, viewer access, or block filtering cannot be verified.

## Existing endpoints

- `GET /v1/health` — non-sensitive health check.
- `GET /v1/feed` — newest 100 posts, excluding the viewer and either direction of blocked relationships; returns an opaque cursor when another page exists.
- `GET /v1/directory` — up to 100 public profiles with the same block filtering.

Data endpoints require a Firebase ID token in the Authorization header. Only exact origins in `FACEBOOM_ORIGINS` are accepted. Responses use `Cache-Control: no-store`.

## Deployment status

- The present code is retained for test coverage and migration work only.
- It is **not approved for deployment** and must be refactored to the isolated mirror schema before any cloud deployment.
- Do not create or upload a service-account JSON key. Prefer attached runtime identities / Application Default Credentials for the synchronizer and a narrowly scoped identity in the mirror project for the Worker.
- No cloud project, billing setting, secret, production Firestore rule, or production Hosting configuration is changed by this repository preparation.
- Do not deny source-project browser list access to `posts` or `publicProfiles` until the isolated mirror, synchronizer, Worker, web configuration, and end-to-end verification are complete.
