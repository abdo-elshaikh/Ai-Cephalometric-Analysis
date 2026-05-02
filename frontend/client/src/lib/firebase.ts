import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey    = import.meta.env.VITE_FIREBASE_API_KEY;
const appId     = import.meta.env.VITE_FIREBASE_APP_ID;

const configured = Boolean(projectId && apiKey && appId);

let auth: ReturnType<typeof getAuth> | null = null;

if (configured) {
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        apiKey,
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket: `${projectId}.firebasestorage.app`,
        appId,
      });
  auth = getAuth(app);
}

export function isFirebaseConfigured(): boolean {
  return configured;
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error("Firebase is not configured.");
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function firebaseLogout(): Promise<void> {
  if (!auth) return;
  await firebaseSignOut(auth);
}
