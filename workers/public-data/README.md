# FACEBOOM public-data Worker

This Worker is a read-only public-data API for the FACEBOOM website. It must only be deployed after the isolated public-data Firebase project has been created, populated, and permissioned.

## Security boundary

- Firebase ID tokens are verified against `FIREBASE_AUTH_PROJECT_ID` (the source authentication project, currently `faceboom-46273`).
- Every Firestore read is made against `FIREBASE_PUBLIC_DATA_PROJECT_ID`.
- Those project IDs must be different. The Worker returns HTTP 503 if the mirror project is missing or matches the authentication project.
- The Worker service-account identity must have read access only in the isolated mirror project. Never grant it any role in `faceboom-46273`.
- Configure the service-account JSON as the Cloudflare secret `FIREBASE_SERVICE_ACCOUNT_JSON`. It must belong to an identity created in the isolated mirror project. Never commit it, put it in a Vite variable, or paste it into chat.
- The mirror project must contain only the allowlisted public collections and the minimum private access metadata required by the Worker. Firestore client rules in that project must deny all client access to `viewerAccess` and `blockEdges`.
- The service-account key is a Cloudflare Worker secret, not a browser credential. Rotate it if it is ever exposed.

Google Firestore's standard data-viewer IAM role is project-scoped, not collection-scoped. This is why the Worker must never have a credential in the production source project. Keep the isolated mirror project limited to the approved mirror collections.

## Endpoints

All endpoints except the health check require an Authorization Bearer Firebase ID token and an allowed browser Origin.

- `GET /v1/health`: reports whether the isolated project IDs are configured; it does not verify Firestore connectivity.
- `GET /v1/feed`: returns public posts, excluding the viewer's own blocked users and users who blocked the viewer.
- `GET /v1/directory`: returns up to 100 public profiles, with the same block filtering.
- `GET /v1/profile/{uid}`: returns one public profile unless it is the viewer's own profile or a blocked relationship exists.

Responses use `Cache-Control: no-store`. The feed includes an opaque `nextCursor`; the current website does not yet request subsequent pages.

## Required Worker configuration

Set these non-secret variables in Cloudflare:

- `FIREBASE_AUTH_PROJECT_ID=faceboom-46273`
- `FIREBASE_PUBLIC_DATA_PROJECT_ID=<the separate mirror project ID>`
- `FACEBOOM_ORIGINS=https://faceboom-46273.web.app` (add the approved production domain only when ready)

Set `FIREBASE_SERVICE_ACCOUNT_JSON` as a Cloudflare secret using the mirror-project-only read identity.

Do not deploy with the blank mirror project ID in `wrangler.toml`.

## Deployment gate

Do not deploy this Worker until:
1. The separate mirror project exists and Firestore is enabled.
2. The source-project synchronizer is deployed with a runtime identity authorized to write to the mirror.
3. A controlled backfill has populated profiles, posts, viewer access, and block relationships.
4. The Worker identity exists only in the mirror project and has the required read access.
5. The website and Worker have been tested against non-production data.

No production Worker, website, or Firestore rules deployment is authorized by this repository preparation work.
