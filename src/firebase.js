
import { initializeApp } from "firebase/app";

import { getAuth } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:  "AIzaSyAJ2rDrjqQpjvYVIo4QnizDKfVsu-eRFDM",
  authDomain: "faceboom-46273.firebaseapp.com",
  projectId: "faceboom-46273",
  storageBucket: "faceboom-46273.firebasestorage.app",
  messagingSenderId: "903448823623",
  appId: "1:903448823623:web:092e8d70394234918c6e62"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);
