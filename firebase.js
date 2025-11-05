// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD6M5SgzgV0I4Z3MICqycv8bke8A-51xKU",
  authDomain: "sarthakdigi-6071a.firebaseapp.com",
  projectId: "sarthakdigi-6071a",
  storageBucket: "sarthakdigi-6071a.firebasestorage.app",
  messagingSenderId: "35108607121",
  appId: "1:35108607121:web:a7b71f05e00cf3fd165b30"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firestore
import { getFirestore } from "firebase/firestore";
export const db = getFirestore(app);
// Auth
import { getAuth } from "firebase/auth";
export const auth = getAuth(app);