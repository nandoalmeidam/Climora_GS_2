import { where } from 'firebase/firestore'

export function publishedIncidentScope(cityId: number, country: string) {
  return [
    where('cityId', '==', cityId),
    where('status', '==', 'approved'),
    // Legacy Brazilian documents have no country field.
    ...(country === 'BR' ? [] : [where('country', '==', country)]),
  ]
}
