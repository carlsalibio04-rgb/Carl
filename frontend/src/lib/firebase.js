import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB00heAQUiJiOGpTuJ_UNGeXDb5pjgSIVI",
  authDomain: "poko-72aec.firebaseapp.com",
  projectId: "poko-72aec",
  storageBucket: "poko-72aec.firebasestorage.app",
  messagingSenderId: "591704253321",
  appId: "1:591704253321:web:5650db425301e07f7e3758"
};

const app = initializeApp(firebaseConfig);

// Login (Firebase Auth) na lang ang gamit. Walang database.
export const auth = getAuth(app);
export const db = getFirestore(app);
