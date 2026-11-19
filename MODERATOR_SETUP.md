# FACEBOOM moderator access setup

The moderation screen is available only to a signed-in account whose Firebase Authentication token contains the trusted custom claim `moderator: true`.

## Important security boundary

- Do not add a moderator flag to a Firestore user profile. A member must never be able to grant themselves moderator access.
- Do not place a Firebase Admin SDK service-account key in the React app, public repository, browser, or a normal client-side environment variable.
- Only the project owner or an authorized administrator should grant or revoke the claim from a trusted server or secured administrative environment.
- The moderator screen does not itself grant permissions. Firestore Security Rules remain the authority.

## Granting access

Use the Firebase Admin SDK from a trusted, private environment after verifying the moderator's identity. The administrator must look up the person's Firebase Authentication UID and set the custom claim using the Admin SDK:

```js
await getAuth().setCustomUserClaims(firebaseUid, { moderator: true });
```

If the account already has other custom claims, preserve them when changing claims rather than overwriting them accidentally. After the claim is changed, the moderator must sign out and sign in again (or refresh their ID token) before the app displays the Moderation button.

## Revoking access

From the same trusted environment, remove the `moderator` claim while preserving any other approved claims. The person must refresh their ID token or sign in again. Firestore rules check the token claim, so revocation takes effect when the refreshed token is used.

## Current implementation limits

- The moderation screen lists reports and lets an authorized moderator mark them open, reviewing, resolved, or dismissed.
- The screen is not a complete case-management system. It does not automatically suspend accounts, remove posts, contact reporters, or delete media.
- Reports involving private messages do not grant moderators general access to private conversations. Any future review process for reported message content must be deliberately designed with privacy safeguards.
- A moderator must review reports promptly and follow the published community guidelines.
- Test the claim and rules with a dedicated test account before using moderator access on the live service.
