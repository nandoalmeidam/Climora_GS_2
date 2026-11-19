import referenceData from './countryReferenceData.json'
import { internationalPlace, type Coordinates, type InternationalCity, type Locality } from './climate'


const references: Record<string, (number | string)[] | undefined> = referenceData
const brasilia: Locality = { uf: 'DF', city: 'Brasília', cityId: 5300108, district: '' }

export function countryReference(country: string): { place: Locality; point: Coordinates; city: InternationalCity | null } | null {
  const entry = references[country]
  if (!entry) return null
  const [id, name, latitude, longitude] = entry
  if (typeof id !== 'number' || typeof name !== 'string' || typeof latitude !== 'number' || typeof longitude !== 'number') return null
  const point = { latitude, longitude }
  if (country === 'BR') return { place: brasilia, point, city: null }

  const city = { ...point, id, name, country_code: country }
  return { place: internationalPlace(city, ''), point, city }
}

