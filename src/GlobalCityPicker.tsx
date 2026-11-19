import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { searchCities, type InternationalCity } from './climate'
import { loadCountryCities } from './cityCatalog'
import { Button } from './components/ui/button'

function cityLabel(city: InternationalCity) {
  return [city.name, city.admin2, city.admin1].filter(Boolean).join(' · ')
}

export function GlobalCityPicker({ country, selected, onSelect, disabled }: {
  country: string; selected: InternationalCity | null; onSelect: (city: InternationalCity | null) => void; disabled: boolean
}) {
  const [catalog, setCatalog] = useState<InternationalCity[]>()
  const [catalogError, setCatalogError] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<InternationalCity[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    void loadCountryCities(country, controller.signal).then(cities => {
      if (!controller.signal.aborted) setCatalog(cities)
    }).catch(() => {
      if (!controller.signal.aborted) setCatalogError(true)
    })
    return () => controller.abort()
  }, [country])

  const choices = selected && !catalog?.some(city => city.id === selected.id)
    ? [selected, ...(catalog ?? [])]
    : catalog ?? []

  function toggleSearch() {
    if (searchOpen) {
      active.current?.abort()
      setLoading(false)
      setStatus('')
      setResults([])
      setTerm('')
    }
    setSearchOpen(!searchOpen)
  }

  async function search() {
    if (term.trim().length < 2 || loading || disabled) return
    const controller = new AbortController()
    active.current = controller
    setLoading(true)
    setStatus('')
    setResults([])
    try {
      const matches = await searchCities(term.trim(), country, controller.signal)
      if (controller.signal.aborted) return
      setResults(matches)
      if (matches.length === 1) onSelect(matches[0])
      else setStatus(matches.length ? 'Selecione um dos resultados.' : 'Cidade não encontrada. Confira o nome ou tente a grafia local.')
    } catch {
      if (!controller.signal.aborted) setStatus('Busca temporariamente indisponível. Tente novamente.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return <>
    <div className="global-city city-search">
      <label>Cidade<span className="select-wrap">
        <select aria-label="Cidade" value={selected?.id ?? 0} disabled={disabled || !choices.length} onChange={event => {
          onSelect(choices.find(city => city.id === Number(event.target.value)) ?? null)
        }}>
          <option value={0}>{catalogError ? 'Lista indisponível' : catalog ? 'Selecione uma cidade' : 'Carregando cidades…'}</option>
          {choices.map(city => <option key={city.id} value={city.id}>{cityLabel(city)}</option>)}
        </select><ChevronDown size={15} />
      </span></label>
      <Button variant="outline" type="button" aria-expanded={searchOpen} aria-controls="city-search-details" onClick={toggleSearch} disabled={disabled}>
        <Search size={16} />{searchOpen ? 'Fechar busca' : 'Buscar outra'}
      </Button>
    </div>
    <div id="city-search-details" className="city-search-details" hidden={!searchOpen}>
      <div className="city-search city-search-input">
        <label>Nome da cidade<input value={term} maxLength={100} disabled={loading || disabled}
          onChange={event => { setTerm(event.target.value); setResults([]); setStatus('') }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} /></label>
        <Button variant="outline" type="button" onClick={() => void search()} disabled={term.trim().length < 2 || loading || disabled}>
          {loading ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>
      {results.length > 1 && <label>Resultados<span className="select-wrap">
        <select aria-label="Resultados" value={results.some(city => city.id === selected?.id) ? selected?.id : 0} disabled={disabled}
          onChange={event => {
            const match = results.find(city => city.id === Number(event.target.value))
            if (match) onSelect(match)
          }}>
          <option value={0}>Selecione uma cidade</option>
          {results.map(city => <option key={city.id} value={city.id}>{cityLabel(city)}</option>)}
        </select><ChevronDown size={15} /></span></label>}
      {status && <small className="city-match" role="status">{status}</small>}
    </div>
  </>
}
