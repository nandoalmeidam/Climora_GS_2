import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import type { Coordinates, Kind, Locality } from './climate'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
export const firebase = Object.values(config).every(Boolean) ? initializeApp({ ...config, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID }) : null
export const auth = firebase && getAuth(firebase)
export const db = firebase && getFirestore(firebase)
export const blazeEnabled = import.meta.env.VITE_FIREBASE_MODE === 'blaze'
export const storage = firebase && blazeEnabled ? getStorage(firebase) : null

export type Incident = Locality & Coordinates & {
  id: string; kind: Kind; description: string; author: string
  status: 'pending' | 'approved' | 'rejected'; photoPath?: string
}
export type Subscription = Locality & { id: string }


