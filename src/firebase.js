// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore"; // Add necessary Firestore functions

const firebaseConfig = {
  apiKey: "AIzaSyBomU7SAX8RqWWjlXCQONs4TbdNcmI24a8",
  authDomain: "newguidance-versantpractice.firebaseapp.com",
  projectId: "newguidance-versantpractice",
  storageBucket: "newguidance-versantpractice.appspot.com",
  messagingSenderId: "755867104697",
  appId: "1:755867104697:web:7765744a2f30e3a4ce3268",
  measurementId: "G-SK1XK243DQ",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error(error);
    return null;
  }
};

// Function to fetch results sorted by timestamp
const fetchResults = async (userId) => {
  try {
    const resultsRef = collection(db, "results");
    const q = query(resultsRef, orderBy("timestamp", "asc")); // Sort by timestamp in ascending order
    const querySnapshot = await getDocs(q);

    const results = [];
    querySnapshot.forEach((doc) => {
      if (!userId || doc.data().userId === userId) {
        results.push({ id: doc.id, ...doc.data() });
      }
    });

    return results; // Always returns an array
  } catch (error) {
    console.error("Error fetching results:", error);
    return []; // Return an empty array in case of error
  }
};

export {
  auth,
  db,
  signInWithGoogle,
  collection,
  addDoc,
  fetchResults, // Export the new function
};