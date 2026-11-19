import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

const projectId = 'demo-climora'
const emulator = process.env.FIRESTORE_EMULATOR_HOST
assert.ok(emulator, 'Execute com firebase emulators:exec.')
const [host, port] = emulator.split(':')
const apps = []

function database(uid) {
  const app = initializeApp({ projectId }, uid ?? 'public')
  apps.push(app)
  const db = getFirestore(app)
  const options = uid ? { mockUserToken: { sub: uid, user_id: uid } } : {}
  connectFirestoreEmulator(db, host, Number(port), options)
  return db
}

const isDenied = error => error.code === 'permission-denied'
const author = database('citizen')
const moderator = database('reviewer')
const publicDb = database()
const fields = {
  uf: 'SP', city: 'São Paulo', cityId: 3550308, district: 'Sé', latitude: -23.55, longitude: -46.63,
  kind: 'Alagamento', description: 'Água acumulada na via principal.',
}
const pending = { ...fields, author: 'citizen', photoPath: '', status: 'pending', createdAt: serverTimestamp() }
const approved = { ...fields, country: 'BR', districtKey: 'se', status: 'approved', reviewedAt: serverTimestamp() }

function approve(db, id, extra = {}) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'incidents', id), { status: 'approved', reviewedAt: serverTimestamp() })
  batch.set(doc(db, 'publishedIncidents', id), { ...approved, ...extra })
  return batch.commit()
}

try {
  const roleUrl = `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents/moderators/reviewer`
  const role = await fetch(roleUrl, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { enabled: { booleanValue: true } } }),
  })
  assert.ok(role.ok, await role.text())

  await assert.rejects(setDoc(doc(author, 'moderators', 'citizen'), { enabled: true }), isDenied)
  assert.equal((await getDoc(doc(moderator, 'moderators', 'reviewer'))).data()?.enabled, true)
  await setDoc(doc(author, 'incidents', 'approve-me'), pending)
  await setDoc(doc(author, 'incidents', 'reject-me'), pending)
  assert.equal((await getDocs(query(collection(moderator, 'incidents'), where('status', '==', 'pending')))).size, 2)

  await assert.rejects(getDoc(doc(publicDb, 'incidents', 'approve-me')), isDenied)
  await assert.rejects(approve(author, 'approve-me'), isDenied)
  await assert.rejects(updateDoc(doc(moderator, 'incidents', 'approve-me'), { status: 'approved', reviewedAt: serverTimestamp() }), isDenied)
  await assert.rejects(setDoc(doc(moderator, 'publishedIncidents', 'approve-me'), approved), isDenied)
  await assert.rejects(approve(moderator, 'approve-me', { author: 'citizen' }), isDenied)
  await assert.rejects(approve(moderator, 'approve-me', { description: 'Texto alterado.' }), isDenied)
  await approve(moderator, 'approve-me')
  assert.equal((await getDoc(doc(publicDb, 'publishedIncidents', 'approve-me'))).data()?.description, fields.description)
  assert.equal((await getDoc(doc(author, 'incidents', 'approve-me'))).data()?.status, 'approved')
  await assert.rejects(updateDoc(doc(moderator, 'incidents', 'approve-me'), { status: 'rejected', reviewedAt: serverTimestamp() }), isDenied)
  await updateDoc(doc(moderator, 'incidents', 'reject-me'), { status: 'rejected', reviewedAt: serverTimestamp() })
  assert.equal((await getDoc(doc(publicDb, 'publishedIncidents', 'reject-me'))).exists(), false)

  console.log('Regras verificadas: envio, isolamento, aprovação atômica, rejeição e restrição de dados publicados.')
} finally {
  await Promise.all(apps.map(deleteApp))
}
