# FACEBOOM moderator access and enforcement

The Moderation page is available only to a signed-in account whose Firebase Authentication ID token contains the trusted custom claim `moderator: true`.

## Granting moderator access

- Do not store a moderator flag in a user-editable Firestore profile.
- Never put a Firebase Admin SDK service-account key in the React app, browser, public repository, or client-side environment variables.
- A project owner or authorized administrator must grant the claim from a trusted private environment.
- Preserve any other approved custom claims when changing claims.
- The moderator must refresh their ID token or sign out and sign in again.

Example using the Firebase Admin SDK in a trusted environment:

```js
const user = await getAuth().getUser(firebaseUid);
await getAuth().setCustomUserClaims(firebaseUid, {
  ...(user.customClaims || {}),
  moderator: true
});
```

Firestore Security Rules remain the authority. Showing the moderator screen does not itself grant access.

## Available moderator actions

The moderation panel supports:

- Issue a warning with a required reason.
- Suspend an account for 24 hours, 7 days, or 30 days.
- Permanently ban an account.
- Reinstate a suspended or banned account.
- Review reports and mark them open, reviewing, resolved, or dismissed.
- Review member appeals, mark them reviewing, accept and reinstate, or reject them.
- View the append-only moderation action history.

A reason is required for each warning, suspension, ban, or reinstatement. Actions record the target UID, moderator UID, action, reason, duration when applicable, and server timestamp.

## Enforcement and expiry

- Account status is stored in the private user record and mirrored in `moderationAccounts`.
- Members cannot change their own account status or moderation history.
- Firestore Security Rules check account status for profile updates, posts, likes, comments, friends, friend requests, inbox, conversations, messages, public profile access and report submission.
- A suspended member cannot use those features but can read their own private profile and submit an appeal.
- Temporary suspensions expire automatically according to the stored timestamp. No scheduled function is required.
- The signed-in app listens for status changes so a new suspension or reinstatement is reflected without waiting for a new login.
- Moderation history is append-only; clients cannot edit or delete recorded actions.

## Important limits

- A ban blocks FACEBOOM data access, but does not delete the Firebase Authentication identity.
- Existing posts and uploaded Cloudinary media are not automatically removed by a suspension or ban.
- The panel does not currently provide post/comment takedown, media deletion, email notifications, case assignment, or a staffed response workflow.
- Reports about private messages do not grant moderators general access to private conversation contents. Message evidence needs a separately designed privacy-reviewed process.
- Appeals are stored privately for the member and moderators. A moderator accepting an appeal reinstates the account.
- Account deletion and complete removal of associated Cloudinary files remain separate unfinished work.

Moderators should follow the published Community Guidelines, use proportionate actions, record clear reasons, and review reports and appeals promptly.
