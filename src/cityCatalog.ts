import type { InternationalCity } from './climate'

type CatalogEntry = [number, string, string, number, number]

export async function loadCountryCities(country: string, signal: AbortSignal): Promise<InternationalCity[]> {
  const response = await fetch(`/city-catalog/${country}.json`, { signal })
  if (!response.ok) throw new Error('Lista de cidades indisponível.')
  const entries: CatalogEntry[] = await response.json()
  return entries.map(([id, name, admin1, latitude, longitude]) => ({
    id, name, admin1, latitude, longitude, country_code: country,
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.admin1 ?? '').localeCompare(b.admin1 ?? '', 'pt-BR'))
}
