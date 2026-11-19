import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { createUserWithEmailAndPassword, onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth, blazeEnabled, db, firebase, storage, type Incident, type Subscription } from './firebase'
import { publishedIncidentScope } from './incidentScope'
import { normalize, type Coordinates, type Kind, type Locality } from './climate'

export function useAccount() {
  const [user, setUser] = useState<User | null>(null)
  const [claimAdmin, setClaimAdmin] = useState(false)
  const [moderatorUid, setModeratorUid] = useState<string>()
  const uid = user?.uid

  useEffect(() => {
    if (!db || !uid || blazeEnabled) return
    return onSnapshot(doc(db, 'moderators', uid), snapshot => {
      setModeratorUid(snapshot.data()?.enabled === true ? uid : undefined)
    }, () => setModeratorUid(undefined))
  }, [uid])
  useEffect(() => {
    let generation = 0
    const unsubscribe = auth && onIdTokenChanged(auth, current => {
      const request = ++generation
      setUser(current)
      setClaimAdmin(false)
      void current?.getIdTokenResult().then(result => {
        if (request === generation) setClaimAdmin(result.claims.admin === true)
      }).catch(() => undefined)
    })
    return () => { generation++; unsubscribe?.() }
  }, [])
  return { user, admin: claimAdmin || Boolean(uid && uid === moderatorUid) }
}

export function useIncidents(place: Locality, user: User | null, admin: boolean) {
  const [publicReports, setPublicReports] = useState<Incident[]>([])
  const [ownReports, setOwnReports] = useState<Incident[]>([])
  const [queue, setQueue] = useState<Incident[]>([])
  const [error, setError] = useState('')
  const { cityId, district, country = 'BR' } = place
  const uid = user?.uid
  useEffect(() => {
    if (!db) return
    return onSnapshot(query(collection(db, 'publishedIncidents'), ...publishedIncidentScope(cityId, country)),
      snapshot => setPublicReports(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Incident)),
      () => setError('Não foi possível carregar as ocorrências públicas.'))
  }, [cityId, country])
  useEffect(() => {
    if (!db || !uid) return
    return onSnapshot(query(collection(db, 'incidents'), where('author', '==', uid)),
      snapshot => setOwnReports(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Incident)),
      () => setError('Não foi possível carregar seus registros.'))
  }, [uid])
  useEffect(() => {
    if (!db || !admin) return
    return onSnapshot(query(collection(db, 'incidents'), where('status', '==', 'pending')),
      snapshot => setQueue(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Incident)),
      () => setError('Não foi possível carregar a fila de moderação.'))
  }, [admin])
  return {
    reports: publicReports.filter(item => item.cityId === cityId && (item.country ?? 'BR') === country && (!district || normalize(item.district) === normalize(district))),
    ownReports: ownReports.filter(item => item.author === uid),
    queue: admin ? queue : [], error,
  }
}

export function useSubscriptions(user: User | null) {
  const [state, setState] = useState<{ uid: string; items: Subscription[] }>({ uid: '', items: [] })
  const uid = user?.uid
  useEffect(() => {
    if (!db || !uid) return
    return onSnapshot(collection(db, 'users', uid, 'subscriptions'),
      snapshot => setState({ uid, items: snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Subscription) }))
  }, [uid])
  return state.uid === uid ? state.items : []
}

export function subscriptionId(place: Locality) {
  const prefix = place.country && place.country !== 'BR' ? place.country + '-' : ''
  return `${prefix}${place.cityId}-${encodeURIComponent(normalize(place.district))}`
}

export async function toggleSubscription(user: User, place: Locality, followed: boolean) {
  if (!db) throw new Error('Firebase indisponível.')
  const record = doc(db, 'users', user.uid, 'subscriptions', subscriptionId(place))
  if (followed) await deleteDoc(record)
  else await setDoc(record, place)
}

export async function authenticate(email: string, password: string, register: boolean) {
  if (!auth) throw new Error('Firebase indisponível.')
  if (register) await createUserWithEmailAndPassword(auth, email, password)
  else await signInWithEmailAndPassword(auth, email, password)
}
export async function logout() { if (auth) await signOut(auth) }

export async function reportIncident(user: User, place: Locality, point: Coordinates, kind: Kind, description: string, photo: File | null) {
  if (!db) throw new Error('Firebase indisponível.')
  let photoPath = ''
  if (photo) {
    if (!storage) throw new Error('O envio de fotos está indisponível neste plano.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
      throw new Error('Use uma foto JPG, PNG ou WebP de até 5 MB.')
    }
    photoPath = `incidents/${user.uid}/${crypto.randomUUID()}`
    await uploadBytes(ref(storage, photoPath), photo, { contentType: photo.type })
  }
  try {
    await addDoc(collection(db, 'incidents'), {
      ...place, ...point, author: user.uid, kind, description, photoPath, status: 'pending', createdAt: serverTimestamp(),
    })
  } catch (error) {
    if (photoPath && storage) await deleteObject(ref(storage, photoPath)).catch(() => undefined)
    throw error
  }
}

export async function readPhoto(path: string) {
  if (!storage) throw new Error('Firebase indisponível.')
  return getBlob(ref(storage, path), 5 * 1024 * 1024)
}

export async function moderate(id: string, status: 'approved' | 'rejected') {
  if (!firebase || !db) throw new Error('Firebase indisponível.')
  if (blazeEnabled) {
    await httpsCallable(getFunctions(firebase, 'southamerica-east1'), 'moderateIncident')({ id, status })
    return
  }

  const incident = doc(db, 'incidents', id)
  const publication = doc(db, 'publishedIncidents', id)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(incident)
    if (!snapshot.exists()) throw new Error('Ocorrência não encontrada.')
    const report = snapshot.data() as Omit<Incident, 'id'>
    if (report.status === status) return
    if (report.status !== 'pending') throw new Error('Ocorrência já revisada.')

    const reviewedAt = serverTimestamp()
    transaction.update(incident, { status, reviewedAt })
    if (status === 'approved') {
      const { uf, city, cityId, district, country = 'BR', latitude, longitude, kind, description } = report
      transaction.set(publication, {
        uf, city, cityId, district, country, latitude, longitude, kind, description,
        districtKey: normalize(district), status, reviewedAt,
      })
    }
  })
}
