import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD241_1iJilWbdTGdvBObNr61YkPhKVkwA',
  authDomain: 'hackathon-mmu-2026.firebaseapp.com',
  projectId: 'hackathon-mmu-2026',
  storageBucket: 'hackathon-mmu-2026.firebasestorage.app',
  messagingSenderId: '958647332',
  appId: '1:958647332:web:2cd1ca96368df413855cb1',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const getDb = async () => db;
