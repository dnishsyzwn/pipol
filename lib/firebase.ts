import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

const getMetaEnv = (): Record<string, string | undefined> => {
  try {
    return (import.meta as any).env || {};
  } catch {
    return {};
  }
};

const metaEnv = getMetaEnv();

const apiKey = 
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 
  process.env.VITE_FIREBASE_API_KEY ||
  metaEnv.VITE_FIREBASE_API_KEY || 
  metaEnv.NEXT_PUBLIC_FIREBASE_API_KEY ||
  'AIzaSyD241_1iJilWbdTGdvBObNr61YkPhKVkwA';

const authDomain = 
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 
  process.env.VITE_FIREBASE_AUTH_DOMAIN ||
  metaEnv.VITE_FIREBASE_AUTH_DOMAIN || 
  metaEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  'hackathon-mmu-2026.firebaseapp.com';

const projectId = 
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 
  process.env.VITE_FIREBASE_PROJECT_ID ||
  metaEnv.VITE_FIREBASE_PROJECT_ID || 
  metaEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  'hackathon-mmu-2026';

const storageBucket = 
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  metaEnv.VITE_FIREBASE_STORAGE_BUCKET || 
  metaEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  'hackathon-mmu-2026.firebasestorage.app';

const messagingSenderId = 
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 
  process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
  metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || 
  metaEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
  '958647332';

const appId = 
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 
  process.env.VITE_FIREBASE_APP_ID ||
  metaEnv.VITE_FIREBASE_APP_ID || 
  metaEnv.NEXT_PUBLIC_FIREBASE_APP_ID ||
  '1:958647332:web:2cd1ca96368df413855cb1';

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

function getOrInitApp(): FirebaseApp {
  if (getApps().length > 0) {
    const currentApp = getApp();
    if (currentApp.options.apiKey === apiKey && currentApp.options.apiKey !== 'your_api_key_here') {
      return currentApp;
    }
    deleteApp(currentApp).catch(() => {});
  }
  return initializeApp(firebaseConfig);
}

let app: FirebaseApp;
let auth: Auth;
let googleProvider: GoogleAuthProvider;

if (typeof window !== 'undefined') {
  app = getOrInitApp();
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
} else {
  // Safe dummy fallbacks for Server Side Rendering (SSR) environment
  app = {} as FirebaseApp;
  auth = {} as Auth;
  googleProvider = {} as GoogleAuthProvider;
}

// Lazy loaded Firestore instance for browser runtime
export const getDb = async () => {
  if (typeof window === 'undefined') return null;
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(app);
};

export { app, auth, googleProvider };
