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
  apiKey: 'AIzaSyBbiJqy4ACAQV-Cl1dl7r3TJWXrUvDS_9s',
  authDomain: 'fsuwebpage.firebaseapp.com',
  projectId: 'fsuwebpage',
  storageBucket: 'fsuwebpage.firebasestorage.app',
  messagingSenderId: '8778114756',
  appId: '1:8778114756:web:fb4d6f91d4af909df50b91',
  measurementId: 'G-RLZLE2VNG2',
};

const requiredConfig = {
  apiKey: firebaseConfig.apiKey.trim(),
  authDomain: firebaseConfig.authDomain.trim(),
  projectId: firebaseConfig.projectId.trim(),
  appId: firebaseConfig.appId.trim(),
};

export const firebaseConfigurationMissing = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
export const isFirebaseConfigured = firebaseConfigurationMissing.length === 0;
export const firebaseProjectId = requiredConfig.projectId;
export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket)
  .trim()
  .replace(/^gs:\/\//, '')
  .replace(/\/+$/, '');
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