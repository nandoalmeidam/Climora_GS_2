import { countryName } from './countries'

export type Locality = { uf: string; city: string; cityId: number; district: string; country?: string }
export type Coordinates = { latitude: number; longitude: number }
export type Municipality = { id: number; nome: string }
export const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').sort()
export const stateNames: Record<string, string> = Object.fromEntries('AC:Acre|AL:Alagoas|AP:Amapá|AM:Amazonas|BA:Bahia|CE:Ceará|DF:Distrito Federal|ES:Espírito Santo|GO:Goiás|MA:Maranhão|MT:Mato Grosso|MS:Mato Grosso do Sul|MG:Minas Gerais|PA:Pará|PB:Paraíba|PR:Paraná|PE:Pernambuco|PI:Piauí|RJ:Rio de Janeiro|RN:Rio Grande do Norte|RS:Rio Grande do Sul|RO:Rondônia|RR:Roraima|SC:Santa Catarina|SP:São Paulo|SE:Sergipe|TO:Tocantins'.split('|').map(value => value.split(':')))
export const initialPlace: Locality = { uf: 'SP', city: 'São Paulo', cityId: 3550308, district: '' }
export const initialCoordinates = { latitude: -23.5505, longitude: -46.6333 }
export const kinds = ['Alagamento', 'Deslizamento', 'Árvore caída', 'Falta de energia', 'Via bloqueada'] as const
export type Kind = typeof kinds[number]
export const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
  if (!response.ok) throw new Error('Serviço de dados indisponível.')
  return response.json() as Promise<T>
}

export function municipalities(uf: string, signal: AbortSignal) {
  return get<Municipality[]>(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, signal)
}

export function districts(cityId: number, signal: AbortSignal) {
  return get<Municipality[]>(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cityId}/subdistritos?orderBy=nome`, signal)
}

export function knownDistrictPoint(place: Locality): Coordinates | undefined {
  // OpenStreetMap node 904629799 represents Sumaré, the neighborhood in São Paulo.
  if ((place.country ?? 'BR') === 'BR' && place.cityId === initialPlace.cityId && normalize(place.district) === 'sumare') {
    return { latitude: -23.54538, longitude: -46.68117 }
  }
}

export async function locateDistrict(place: Locality): Promise<Coordinates> {
  const known = knownDistrictPoint(place)
  if (known) return known

  const country = place.country ?? 'BR'
  const state = country === 'BR' ? stateNames[place.uf] ?? place.uf : place.uf
  const params = new URLSearchParams({
    q: [place.district, place.city, state].filter(Boolean).join(', '),
    countrycode: country, limit: '15',
  })
  params.append('layer', 'district')
  params.append('layer', 'locality')
  type Feature = {
    geometry?: { type: string; coordinates: number[] }
    properties?: { name?: string; city?: string; state?: string; countrycode?: string; type?: string }
  }
  const signal = AbortSignal.timeout(8000)
  const response = await get<{ features: Feature[] }>(`https://photon.komoot.io/api/?${params}`, signal)
    .catch(() => { throw new Error('A consulta de bairros está indisponível. Tente novamente em instantes.') })
  const match = response.features.find(({ properties, geometry }) => {
    const [longitude, latitude] = geometry?.coordinates ?? []
    return geometry?.type === 'Point' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
      && Number.isFinite(longitude) && Math.abs(longitude) <= 180
      && (properties?.type === 'district' || properties?.type === 'locality')
      && properties.countrycode?.toUpperCase() === country
      && normalize(properties.name ?? '') === normalize(place.district)
      && normalize(properties.city ?? '') === normalize(place.city)
      && (!state || [state, place.uf].some(name => normalize(name) === normalize(properties.state ?? '')))
  })
  if (!match?.geometry) throw new Error('Bairro não localizado nesta cidade. Confira o nome e tente novamente.')
  const [longitude, latitude] = match.geometry.coordinates
  return { latitude, longitude }
}

export async function locate(place: Locality, signal: AbortSignal): Promise<Coordinates> {
  if (place.cityId === initialPlace.cityId) return initialCoordinates
  const params = new URLSearchParams({
    name: `${place.city}, ${stateNames[place.uf]}`, countryCode: 'BR', language: 'pt', count: '20',
  })
  type Candidate = Coordinates & { name: string; feature_code: string }
  const response = await get<{ results?: Candidate[] }>(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal)
  const matching = response.results?.filter(item => normalize(item.name) === normalize(place.city) && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
  const match = matching?.find(item => item.feature_code.startsWith('PPL')) ?? matching?.[0]
  if (!match) throw new Error('Coordenadas do município não encontradas.')
  return { latitude: match.latitude, longitude: match.longitude }
}

export type Forecast = {
  current: { time: string; temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number }
  hourly?: { time: string[]; precipitation_probability: (number | null)[] }
  daily: { time: string[]; precipitation_sum: (number | null)[]; weather_code?: (number | null)[]; precipitation_probability_max?: (number | null)[]; wind_gusts_10m_max?: (number | null)[]; temperature_2m_max: number[]; temperature_2m_min: number[] }
}

export function weather(point: Coordinates, signal: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(point.latitude), longitude: String(point.longitude), timezone: 'auto',
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    hourly: 'precipitation_probability',
    daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_gusts_10m_max', past_days: '7', forecast_days: '7',
  })
  return get<Forecast>(`https://api.open-meteo.com/v1/forecast?${params}`, signal)
}

export function weatherLabel(code: number) {
  if (code === 0) return 'Céu limpo'
  if (code <= 3) return 'Parcialmente nublado'
  if (code <= 48) return 'Neblina'
  if (code >= 95) return 'Trovoada'
  if (code >= 71 && code <= 77 || code >= 85 && code <= 86) return 'Neve'
  return 'Precipitação'
}





export type InternationalCity = Coordinates & {
  id: number; name: string; country_code: string; admin1?: string; admin2?: string; feature_code?: string
}

export async function searchCities(term: string, country: string, signal: AbortSignal) {
  const params = new URLSearchParams({ name: term, countryCode: country, language: 'pt', count: '30' })
  const response = await get<{ results?: InternationalCity[] }>(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal)
  return (response.results ?? []).filter(city =>
    city.country_code === country && city.feature_code?.startsWith('PPL') &&
    Number.isSafeInteger(city.id) && city.id > 0 && Number.isFinite(city.latitude) && Number.isFinite(city.longitude))
}

export function internationalPlace(city: InternationalCity, district: string): Locality {
  // GeoNames IDs use the negative range to keep existing positive IBGE IDs and subscriptions intact.
  return { country: city.country_code, city: city.name.slice(0, 100), cityId: -city.id, uf: (city.admin1 ?? '').slice(0, 100), district }
}

export function locationLabel(place: Locality) {
  return [place.city, place.uf, place.country && place.country !== 'BR' ? countryName(place.country) : '', place.district].filter(Boolean).join(' · ')
}
