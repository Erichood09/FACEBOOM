# Source-to-mirror synchronizer

The functions in this folder run in the existing FACEBOOM source Firebase project and write allowlisted data to a different Firebase project.

## Required project configuration

- Source project: `faceboom-46273`.
- Mirror project: a new, separate Google Cloud/Firebase project with Firestore enabled.
- Functions parameter: `PUBLIC_DATA_PROJECT_ID`, set to the mirror project ID.
- Source Functions runtime identity: grant it write access in the mirror project (for example, the Firestore Datastore User role) and the normal permissions needed to run Firestore event-triggered functions in the source project.
- Do not grant the Cloudflare Worker identity any role in the source project.

The Functions handlers use their attached runtime identity / Application Default Credentials to access the mirror. They do not use a downloaded service-account key. Their source data is taken from Firestore event payloads; they do not query the source database.

## Safe initial cutover order

Do not deploy the triggers and run the backfill concurrently. For the initial migration, schedule a short maintenance window and temporarily pause writes to profiles, posts, account status, and block relationships. Keep writes paused until the backfill is complete and the triggers are deployed. This avoids a backfill snapshot overwriting a newer event or a write falling into the gap between the initial copy and trigger activation.

1. Configure the empty mirror project, IAM, and mirror Firestore rules.
2. Run the one-time backfill while source writes are paused.
3. Deploy the synchronizer triggers below.
4. Confirm deployment succeeded, then resume source writes.

The profile, post, and account triggers also maintain per-document version records in the mirror so delayed/retried events cannot overwrite a newer version or resurrect a deleted document.

## Deploying the synchronizer

After the mirror project and IAM are configured and the backfill is complete, deploy only these Functions from the repository root:

```powershell
firebase deploy --only functions --project faceboom-46273
```

The Firebase CLI will request the `PUBLIC_DATA_PROJECT_ID` parameter on first deployment. Enter the mirror project ID. This deployment may require a billing-enabled Firebase plan. Do not enable billing unless the project owner explicitly approves it.

## Initial backfill

The one-time backfill copies existing profiles, posts, account status, and block relationships before event handlers are deployed.

Use a trusted operator account with read access to the source project and write access to the mirror. Authenticate with Google Application Default Credentials (no downloaded key):

```powershell
gcloud auth application-default login
$env:FIREBASE_SOURCE_PROJECT_ID = "faceboom-46273"
$env:PUBLIC_DATA_PROJECT_ID = "YOUR-NEW-MIRROR-PROJECT-ID"
npm.cmd --prefix functions install
npm.cmd --prefix functions run backfill
```

Run this only against a newly created, empty mirror project before the Worker is connected and while source writes are paused. It reports counts only and does not print member data. Re-run after reviewing the plan if the mirror already contains data; this script does not remove stale mirror documents.

## Mirror client rules

Deploy `mirror-firestore.rules` to the mirror project's Firestore database. These rules deny every Firebase client read and write. Server identities use IAM and the Admin SDK / REST API and are not governed by client security rules.

## Important limitation

Google Firestore's standard data IAM roles are project-scoped. The Worker identity can technically read every document in the mirror project. Keep the mirror project limited to the approved public mirror collections and access metadata. Never copy private messages, email addresses, reports, moderation notes, wallet/payment data, or other private application data into it.
