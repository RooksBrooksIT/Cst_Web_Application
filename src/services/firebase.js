import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyDepFdbXqygkk_E7wsF-9fUoNH-4k-_xno',
  appId: '1:307172937314:web:ea979720b6a1b637f3cb3b',
  messagingSenderId: '307172937314',
  authDomain: 'cst-whitelabel-app.firebaseapp.com',
  projectId: 'cst-whitelabel-app',
  storageBucket: 'cst-whitelabel-app.firebasestorage.app',
  measurementId: 'G-5SDBLR04XR',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)
const functions = getFunctions(app, 'us-central1')
const persistenceReady = setPersistence(auth, browserLocalPersistence)

export { app, auth, db, functions, storage, persistenceReady }

