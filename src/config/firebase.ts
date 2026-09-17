import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfigJson) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configuração robusta com suporte a cache local persistente e multi-tab
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfigJson.firestoreDatabaseId || undefined);

export default app;
