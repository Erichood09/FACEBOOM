# FACEBOOM deployment

This repository contains the Vite + React application and Firebase configuration.

## Build and deploy from the project folder

The folder must contain package.json and firebase.json.

1. Install dependencies if needed:
   npm.cmd install

2. Build the website:
   npm.cmd run build

3. Deploy the website:
   firebase.cmd deploy --only hosting

Firestore rules are stored in firestore.rules and are configured in firebase.json.
They can be deployed separately with:
   firebase.cmd deploy --only firestore:rules

The Firebase project alias is configured in .firebaserc as faceboom-46273.

Important:
- Never upload Firebase service-account keys, private keys, or .env secrets to GitHub.
- Cloudinary's unsigned upload configuration is in src/cloudinary.js.
- Firebase web configuration in src/firebase.js is client configuration, not a service-account secret.
