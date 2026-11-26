
import { initializeApp } from "firebase/app";

import { getAuth } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAJ2rDrjqQpjvYVIo4QnizDKfVsu-eRFDM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "faceboom-46273.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "faceboom-46273",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "faceboom-46273.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "903448823623",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:903448823623:web:092e8d70394234918c6e62"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);
