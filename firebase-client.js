import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getFirestore,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
   apiKey: "AIzaSyBbiJqy4ACAQV-Cl1dl7r3TJWXrUvDS_9s",
  authDomain: "fsuwebpage.firebaseapp.com",
  projectId: "fsuwebpage",
  appId: "1:8778114756:web:fb4d6f91d4af909df50b91",
  ...(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
    ? { storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET }
    : {}),
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;

export {
  addDoc,
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  sendEmailVerification,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where,
};
