import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { publishedIncidentScope } from './incidentScope'
import { normalize } from './climate'
import { db, type Incident, type Subscription } from './firebase'

type PublishedAlert = Incident & { reviewedAt?: Timestamp }

const reviewDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'medium',
})

export function LocalAlerts({ place }: { place: Subscription }) {
  const [items, setItems] = useState<PublishedAlert[]>()
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
      setItems(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as PublishedAlert))
    }, () => setError(true))
  }, [place.cityId, place.country, place.district])
  if (error) return <p>Avisos locais temporariamente indisponíveis.</p>
  if (!items) return <p>Consultando avisos locais…</p>
  if (!items.length) return <p>Nenhuma ocorrência validada recentemente para este local.</p>
  return <ul className="local-alerts">{items.map(item => <li key={item.id}>
    <strong>{item.kind}</strong>
    <p>{item.description}</p>
    <p className="local-alert-details">
      {item.district?.trim() && <span>Bairro: {item.district}</span>}
      {Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && (
        <a href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`} target="_blank" rel="noopener noreferrer">
          Ver ponto no mapa ({item.latitude.toFixed(5)}, {item.longitude.toFixed(5)})
        </a>
      )}
      {item.reviewedAt instanceof Timestamp && (
        <time dateTime={item.reviewedAt.toDate().toISOString()}>
          Validado em {reviewDate.format(item.reviewedAt.toDate())}
        </time>
      )}
    </p>
    <small>Origem: relato da comunidade · Validação: moderação Climora</small>
  </li>)}</ul>
}


