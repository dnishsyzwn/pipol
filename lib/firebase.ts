import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyD241_1iJilWbdTGdvBObNr61YkPhKVkwA',
  authDomain: 'hackathon-mmu-2026.firebaseapp.com',
  projectId: 'hackathon-mmu-2026',
  storageBucket: 'hackathon-mmu-2026.firebasestorage.app',
  messagingSenderId: '958647332',
  appId: '1:958647332:web:2cd1ca96368df413855cb1',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const appCheckState = globalThis as typeof globalThis & {
  __slearnAppCheckInitialization?: Promise<void>;
};

export function initializeSlearnAppCheck() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!appCheckState.__slearnAppCheckInitialization) {
    appCheckState.__slearnAppCheckInitialization = (async () => {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } =
        await import('firebase/app-check');
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(
          '6LflkaotAAAAAJFaERXPuNYUxITDUce8EhmYgqri',
        ),
        isTokenAutoRefreshEnabled: true,
      });
    })();
  }
  return appCheckState.__slearnAppCheckInitialization;
}

export const auth = getAuth(app);

let firestoreInstance;
try {
  firestoreInstance =
    typeof window !== 'undefined'
      ? initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        })
      : getFirestore(app);
} catch {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;
export const functions = getFunctions(app, 'asia-southeast1');
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const getDb = async () => db;
