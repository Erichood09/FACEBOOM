# FACEBOOM Facebook Login setup

This enables people to use Facebook Login to create or access a FACEBOOM account. It does not connect to a person's private Messenger inbox or grant access to personal Facebook posts.

## What has been prepared in the website

- A **Continue with Facebook** button on the FACEBOOM sign-in and registration screen.
- Firebase Authentication's Facebook OAuth provider.
- Automatic creation of the normal FACEBOOM profile and public directory entry for a first-time Facebook sign-in.
- The existing Facebook share-link action remains available on shared FACEBOOM content.

## Required owner setup (not yet completed)

No Meta app credentials are stored in this repository. Do not put the Meta App Secret in Vite environment variables, source code, GitHub files, or chat messages.

1. Open the Firebase project **faceboom-46273** in Firebase Console.
2. Go to **Authentication → Sign-in method** (or **Sign-in providers**) and enable **Facebook**.
3. Firebase will show an OAuth redirect URI. Copy that exact URI.
4. Open Meta for Developers and create or select the FACEBOOM app. Add the **Facebook Login** product and configure the website platform.
5. In the Meta app's Facebook Login settings, add the exact Firebase OAuth redirect URI from step 3 to **Valid OAuth Redirect URIs**. Add the production website domain `faceboom-46273.web.app` to the app's allowed website/domain settings where requested.
6. Copy the Meta **App ID** and **App Secret** into the Facebook provider configuration in Firebase Console. Save there only; never put the App Secret in this repository.
7. In Firebase Authentication settings, confirm these authorised domains are present:
   - `faceboom-46273.web.app`
   - `faceboom-46273.firebaseapp.com`
8. In the Meta app dashboard, set the app's contact details, privacy policy URL, data deletion instructions and other required app settings. Keep the app in Development mode for initial testing with an app administrator/developer/tester. Before allowing ordinary public users to sign in, complete Meta's applicable review and access requirements and switch the app to Live only when ready.

## Facebook sharing

The existing **Facebook** share action opens Facebook's official share dialog for a FACEBOOM post URL. The person reviews and confirms the share in Facebook. FACEBOOM does not silently publish to a personal timeline or request permission to publish personal posts.

## Important boundaries

- Facebook Login authenticates a person; it is not permission to read their private Facebook inbox, friends list, or all personal posts.
- The Facebook share dialog is user-initiated and does not require FACEBOOM to publish on the user's behalf.
- Messenger inbox and Page comment management remain a separate Page-based integration and require Page access, Meta permissions and applicable App Review.
- The website code change is on the review branch only. It has not been merged or deployed to the live website.
