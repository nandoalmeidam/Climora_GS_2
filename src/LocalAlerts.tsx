import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { publishedIncidentScope } from './incidentScope'
import { normalize } from './climate'
import { db, type Incident, type Subscription } from './firebase'

export function LocalAlerts({ place }: { place: Subscription }) {
  const [items, setItems] = useState<Incident[]>()
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!db) return
    const constraints = [
      ...publishedIncidentScope(place.cityId, place.country ?? 'BR'),
      ...(place.district ? [where('districtKey', '==', normalize(place.district))] : []),
      orderBy('reviewedAt', 'desc'), limit(10),
    ]
    return onSnapshot(query(collection(db, 'publishedIncidents'), ...constraints), snapshot => {
      setError(false)
      setItems(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Incident))
    }, () => setError(true))
  }, [place.cityId, place.country, place.district])
  if (error) return <p>Avisos locais temporariamente indisponíveis.</p>
  if (!items) return <p>Consultando avisos locais…</p>
  if (!items.length) return <p>Nenhuma ocorrência validada recentemente para este local.</p>
  return <ul className="local-alerts">{items.map(item => <li key={item.id}>
    <strong>{item.kind}</strong><p>{item.description}</p><small>Origem: relato da comunidade · Validação: moderação Climora</small>
  </li>)}</ul>
}


