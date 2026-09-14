import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBw3RIOuuze6JJddwqbOWNueQ2-L1NEitc',
  authDomain: 'cst-whitelabel-app.firebaseapp.com',
  projectId: 'cst-whitelabel-app',
  storageBucket: 'cst-whitelabel-app.firebasestorage.app',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const persistenceReady = setPersistence(auth, browserLocalPersistence)

export { app, auth, db, persistenceReady }
