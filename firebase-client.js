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

const env = import.meta.env;
const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET
  ?.trim()
  .replace(/^gs:\/\//, '')
  .replace(/\/+$/, '');

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY?.trim() || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() || '',
  appId: env.VITE_FIREBASE_APP_ID?.trim() || '',
  ...(storageBucket ? { storageBucket } : {}),
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.appId,
);
export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const isFirebaseStorageConfigured = Boolean(firebaseApp && storageBucket);
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = isFirebaseStorageConfigured
  ? getStorage(firebaseApp, `gs://${storageBucket}`)
  : null;

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
