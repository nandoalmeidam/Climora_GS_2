import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, Bell, Cloud, CloudRain, CloudSun, CloudLightning, Droplets, LayoutDashboard, MapPin, Map, Plus, ShieldCheck, Sun, Thermometer, Wind, X, UserRound, CalendarDays, ChevronDown, Radar, Clock3, ExternalLink } from 'lucide-react'
import { Area, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { districts, initialCoordinates, initialPlace, internationalPlace, kinds, locate, locateDistrict, locationLabel, municipalities, states, stateNames, weather, weatherLabel, type Coordinates, type Forecast, type InternationalCity, type Kind, type Locality, type Municipality } from './climate'
import { WeatherAssistant } from './WeatherAssistant'
import { TerritorialAnalysis } from './TerritorialAnalysis'
import { countries, countryName } from './countries'
import { countryReference } from './countryReference'
import { GlobalCityPicker } from './GlobalCityPicker'
import { blazeEnabled, firebase, type Incident } from './firebase'
import { authenticate, logout, moderate, readPhoto, reportIncident, subscriptionId, toggleSubscription, useAccount, useIncidents, useSubscriptions } from './records'
import { LocalAlerts } from './LocalAlerts'
import { IncidentMap } from './IncidentMap'
import { Administration } from './Administration'
import { Button } from './components/ui/button'
import './App.css'

const navigation = [
  { id: 'overview', label: 'Visão geral', compact: 'Clima', icon: LayoutDashboard },
  { id: 'map', label: 'Mapa de ocorrências', compact: 'Ocorrências', icon: Map },
  { id: 'alerts', label: 'Meus alertas', compact: 'Alertas', icon: Bell },
  { id: 'risk', label: 'Análise de risco', compact: 'Risco', icon: Activity },
] as const
type Page = typeof navigation[number]['id'] | 'admin'
const statusLabels = { pending: 'Em análise', approved: 'Validada', rejected: 'Rejeitada' }

function shortDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(date.slice(0, 10) + 'T12:00:00Z')).replace(' de ', ' ').replace('.', '')
}

function PhotoButton({ path }: { path: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url ? <img className="incident-photo" src={url} alt="Foto da ocorrência" /> : <span>
    <Button variant="outline" disabled={loading} onClick={async () => {
      setLoading(true)
      try { setUrl(URL.createObjectURL(await readPhoto(path))); setError('') }
      catch { setError('Foto indisponível.') }
      finally { setLoading(false) }
    }}>{loading ? 'Carregando…' : 'Ver foto'}</Button> {error}
  </span>
}

function IncidentList({ items, children, emptyMessage = 'Nenhuma ocorrência para exibir.' }: { items: Incident[]; children?: (item: Incident) => ReactNode; emptyMessage?: string }) {
  return items.length ? <ul className="reports">{items.map(item => <li key={item.id}>
    <div><strong>{item.kind}</strong><span className="badge">{statusLabels[item.status]}</span></div>
    <p>{locationLabel({ ...item, district: '' })} · {item.district || 'Bairro não informado'}</p><p>{item.description}</p>
    {blazeEnabled && item.photoPath && children && <PhotoButton path={item.photoPath} />}
    {children?.(item)}
  </li>)}</ul> : <div className="empty"><MapPin size={22} /><p>{emptyMessage}</p></div>
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [place, setPlace] = useState(initialPlace)
  const [point, setPoint] = useState<Coordinates | null>(initialCoordinates)
  const [country, setCountry] = useState('BR')
  const [showReference, setShowReference] = useState(false)
  const [globalCity, setGlobalCity] = useState<InternationalCity | null>(null)
  const [uf, setUf] = useState(initialPlace.uf)
  const [city, setCity] = useState(initialPlace.cityId)
  const [district, setDistrict] = useState(initialPlace.district)
  const [cities, setCities] = useState<Municipality[]>([{ id: initialPlace.cityId, nome: initialPlace.city }])
  const [districtList, setDistrictList] = useState<Municipality[]>([])
  const [locationError, setLocationError] = useState('')
  const [loadingCities, setLoadingCities] = useState(false)
  const [locating, setLocating] = useState(false)
  const [forecast, setForecast] = useState<Forecast>()
  const [weatherStatus, setWeatherStatus] = useState('Consultando previsão…')
  const [history, setHistory] = useState(false)
  const [chartMode, setChartMode] = useState<'rain' | 'temperature'>('rain')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState<'account' | 'report' | null>(null)
  const [register, setRegister] = useState(false)
  const [reportDistricts, setReportDistricts] = useState<Municipality[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const { user, admin } = useAccount()
  const { reports, ownReports, queue, error } = useIncidents(place, user, admin)
  const subscriptions = useSubscriptions(user)
  const followed = subscriptions.some(item => item.id === subscriptionId(place))

  useEffect(() => {
    const controller = new AbortController()
    if (country !== 'BR' || !uf) return
    municipalities(uf, controller.signal).then(setCities).catch(() => {
      if (!controller.signal.aborted) setLocationError('O catálogo de municípios do IBGE está indisponível.')
    }).finally(() => { if (!controller.signal.aborted) setLoadingCities(false) })
    return () => controller.abort()
  }, [country, uf])

  useEffect(() => {
    const controller = new AbortController()
    if (country === 'BR' && city) districts(city, controller.signal).then(setDistrictList).catch(() => undefined)
    return () => controller.abort()
  }, [country, city])

  useEffect(() => {
    if (modal !== 'report' || (place.country ?? 'BR') !== 'BR') return
    const controller = new AbortController()
    districts(place.cityId, controller.signal).then(items => {
      if (!controller.signal.aborted) setReportDistricts(items)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [modal, place.cityId, place.country])

  useEffect(() => {
    const controller = new AbortController()
    if (!point) return
    weather(point, controller.signal).then(data => {
      if (!controller.signal.aborted) { setForecast(data); setWeatherStatus('') }
    }).catch(() => {
      if (!controller.signal.aborted) setWeatherStatus('Previsão temporariamente indisponível.')
    })
    return () => controller.abort()
  }, [point])

  const filtered = reports.filter(item => filter === 'all' || item.kind === filter)
  const today = forecast?.current.time.slice(0, 10) ?? ''
  const rows = forecast?.daily.time.map((date, index) => ({
    date, label: shortDate(date), rain: forecast.daily.precipitation_sum[index],
    max: forecast.daily.temperature_2m_max[index], min: forecast.daily.temperature_2m_min[index],
    code: forecast.daily.weather_code?.[index], chance: forecast.daily.precipitation_probability_max?.[index], gust: forecast.daily.wind_gusts_10m_max?.[index],
  })) ?? []
  const upcoming = rows.filter(row => row.date >= today)
  const rain = upcoming.length >= 3 && upcoming.slice(0, 3).every(row => Number.isFinite(row.rain)) ? upcoming.slice(0, 3).reduce((total, row) => total + (row.rain ?? 0), 0) : null
  const temperature = forecast ? Math.round(forecast.current.temperature_2m) + '°' : '—'
  const selectedLocation = locationLabel(place)
  const canShowLocation = country === (place.country ?? 'BR')
  const officialPortal = !place.country || place.country === 'BR'
    ? { name: 'INMET', url: 'https://avisos.inmet.gov.br/' }
    : { name: 'OMM', url: 'https://severeweather.wmo.int/' }
  const currentPage = page === 'admin' && !admin ? 'overview' : page

  function selectCountry(code: string, reset = false) {
    const reference = reset ? { place: initialPlace, point: initialCoordinates, city: null } : countryReference(code)
    const nextUf = code === 'BR' ? reference?.place.uf ?? '' : ''
    const nextCity = code === 'BR' ? reference?.place.cityId ?? 0 : 0
    const keepCatalog = code === 'BR' && country === code && uf === nextUf
    setCountry(code)
    setGlobalCity(reference?.city ?? null)
    setUf(nextUf)
    setCity(nextCity)
    if (!keepCatalog) {
      setCities(nextCity && reference ? [{ id: nextCity, nome: reference.place.city }] : [])
      setLoadingCities(Boolean(nextUf))
    } else if (reference && !cities.some(item => item.id === nextCity)) {
      setCities([{ id: nextCity, nome: reference.place.city }, ...cities])
    }
    setDistrict('')
    if (country !== code || city !== nextCity) setDistrictList([])
    setLocationError('')
    setForecast(undefined)
    setShowReference(!reset && Boolean(reference))
    if (!reference) {
      setPoint(null)
      setWeatherStatus('')
      return
    }
    setWeatherStatus('Consultando previsão…')
    setPlace(reference.place)
    setPoint({ ...reference.point })
  }

  function clearFilters() {
    selectCountry('BR', true)
    setFilter('all')
    setMessage('')
  }

  async function applyPlace(event: FormEvent) {
    event.preventDefault()
    const selected = cities.find(item => item.id === city)
    const neighborhood = district.trim()
    const next: Locality | null = country === 'BR'
      ? selected ? { uf, city: selected.nome, cityId: selected.id, district: neighborhood } : null
      : globalCity ? internationalPlace(globalCity, neighborhood) : null
    if (!next) return
    setShowReference(false)
    setLocating(true)
    setLocationError('')
    try {
      if (next.cityId !== place.cityId || (!forecast && weatherStatus !== 'Consultando previsão…')) {
        const coordinates = country !== 'BR' && globalCity ? globalCity : await locate(next, AbortSignal.timeout(12000))
        setForecast(undefined)
        setWeatherStatus('Consultando previsão…')
        setPoint({ latitude: coordinates.latitude, longitude: coordinates.longitude })
      }
      setPlace(next)
    } catch {
      setPlace(next)
      setPoint(null)
      setForecast(undefined)
      setWeatherStatus('Coordenadas indisponíveis para a previsão deste município.')
    }
    finally { setLocating(false) }
  }

  function openModal(next: 'account' | 'report') {
    setMessage('')
    setRegister(false)
    setReportDistricts([])
    setModal(next)
  }

  async function perform(action: () => Promise<void>, close = false) {
    setBusy(true)
    setMessage('')
    try { await action(); if (close) setModal(null) }
    catch (issue) { setMessage(issue instanceof Error && !issue.message.startsWith('Firebase:') && !('code' in issue) ? issue.message : 'Não foi possível concluir a operação. Verifique os dados e tente novamente.') }
    finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (modal === 'account') {
      void perform(() => authenticate(String(data.get('email')), String(data.get('password')), register), true)
    } else if (user) {
      const neighborhood = String(data.get('reportDistrict') ?? '').trim()
      if (!neighborhood) { setMessage('Informe o bairro da ocorrência.'); return }
      const file = data.get('photo')
      const description = String(data.get('description')).trim()
      if (description.length < 10) { setMessage('Descreva a ocorrência em pelo menos 10 caracteres.'); return }
      const reportPlace = { ...place, district: neighborhood }
      void perform(async () => {
        const neighborhoodPoint = await locateDistrict(reportPlace)
        await reportIncident(user, reportPlace, neighborhoodPoint, String(data.get('kind')) as Kind, description, file instanceof File && file.size ? file : null)
        setPage('alerts')
        setMessage('Ocorrência registrada. Status: Em análise.')
      }, true)
    }
  }

  function go(next: Page) { setPage(next); setMessage('') }

  return <div className="shell">
    <header className="topbar">
      <div className="topbar-inner">
        <a href="#inicio" className="brand" onClick={() => go('overview')}><span className="brand-icon"><Radar size={23} /></span>Climora</a>
        <nav className="top-navigation" aria-label="Navegação principal">
          {navigation.map(({ id, label, compact, icon: Icon }) => <button key={id} aria-label={label} onClick={() => go(id)} aria-current={currentPage === id ? 'page' : undefined}><Icon size={16} /><span className="nav-label">{label}</span><span className="nav-compact">{compact}</span></button>)}
          {admin && <button onClick={() => go('admin')} aria-current={currentPage === 'admin' ? 'page' : undefined}><ShieldCheck size={16} />Moderação</button>}
        </nav>
        <Button variant="outline" className="account-action" onClick={() => user ? void perform(logout) : openModal('account')}><UserRound size={16} />{user ? 'Sair' : 'Entrar'}</Button>
      </div>
    </header>
    <main id="inicio">

      <div className="content">
        <div className="heading"><div><div className="eyebrow"><Activity size={16} /> MONITORAMENTO CLIMÁTICO</div>
        <h1>{currentPage === 'overview' ? 'Central do tempo' : currentPage === 'admin' ? 'Moderação' : navigation.find(item => item.id === currentPage)?.label}</h1>
        <p>{({ overview: 'Previsão e condições meteorológicas por cidade.', map: 'Consulte registros validados e envie novas ocorrências.', alerts: 'Acompanhe cidades e bairros de interesse.', risk: 'Antecipe problemas no território com dados climáticos, cenários e evidências.', admin: 'Revise as ocorrências enviadas pela comunidade.' })[currentPage]}</p></div>
        <Button disabled={!canShowLocation} onClick={() => openModal(user ? 'report' : 'account')}><Plus size={19} /> Registrar ocorrência</Button></div>

        <form className={country === 'BR' ? 'location panel' : 'location panel location-international'} onSubmit={applyPlace}>
          <div className="location-title"><span className="soft-icon"><MapPin size={20} /></span><div><strong>Localização</strong><small>Selecione sua região</small></div></div>
          <label>País<span className="select-wrap"><select aria-label="País" value={country} disabled={locating} onChange={event => selectCountry(event.target.value)}>{countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select><ChevronDown size={15} /></span></label>
          {country === 'BR' ? <>
          <label>Estado<span className="select-wrap"><select aria-label="Estado" value={uf} disabled={locating} onChange={event => { setUf(event.target.value); setCity(0); setDistrict(''); setCities([]); setDistrictList([]); setLoadingCities(true); setLocationError('') }}>{states.map(state => <option key={state} value={state}>{stateNames[state]}</option>)}</select><ChevronDown size={15} /></span></label>
          <label>Cidade<span className="select-wrap"><select aria-label="Cidade" value={city} disabled={loadingCities || locating} onChange={event => { setCity(Number(event.target.value)); setDistrict(''); setDistrictList([]) }}><option value={0}>{loadingCities ? 'Carregando…' : 'Selecione uma cidade'}</option>{cities.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><ChevronDown size={15} /></span></label>
          </> : <GlobalCityPicker key={country} country={country} selected={globalCity} onSelect={setGlobalCity} disabled={locating} />}
          <label>Bairro <span className="optional">(opcional)</span><input list="districts" disabled={locating} value={district} onChange={event => setDistrict(event.target.value)} placeholder="Todos os bairros" maxLength={100} /><datalist id="districts">{districtList.map(item => <option key={item.id} value={item.nome} />)}</datalist></label>
          <div className="location-actions"><Button variant="outline" type="button" onClick={clearFilters} disabled={locating}>Limpar filtros</Button><Button variant="outline" className="apply" disabled={(country === 'BR' ? !city : !globalCity) || locating}>{locating ? 'Buscando…' : 'Aplicar filtros'}</Button></div>
          {showReference && <p className="location-reference" role="status">Cidade de referência de {countryName(country)} · {place.city}</p>}
          {locationError && <p className="feedback" role="status">{locationError}</p>}
        </form>

        {!modal && (message || error) && <p className="feedback" role="status">{message || error}</p>}

        {!canShowLocation && currentPage !== 'admin' && <div className="panel page-panel" role="status">
          <p>Escolha uma cidade em {countryName(country)} para ver a previsão e as ocorrências da região.</p>
        </div>}

        {canShowLocation && currentPage === 'overview' && <>
          <div className="overview-grid">
            <section className="weather-hero" aria-label="Condições atuais">
              <div className="weather-copy">
                <span className="weather-location"><MapPin size={16} />{selectedLocation}</span>
                <div className="temperature">{temperature}{forecast && <span>C</span>}</div>
                <div className="weather-description">{forecast ? weatherLabel(forecast.current.weather_code) : weatherStatus}</div>
                <div className="weather-source"><Clock3 size={14} />{forecast ? shortDate(today) + ' · ' + forecast.current.time.slice(11, 16) + ' · Hora local' : 'Open-Meteo'}</div>
              </div>
              <WeatherIcon code={forecast?.current.weather_code} className="hero-cloud" />
              <div className="weather-details">
                <span><Thermometer size={16} />{degrees(upcoming[0]?.min)} / {degrees(upcoming[0]?.max)}</span>
                <span><Droplets size={16} />{forecast ? forecast.current.relative_humidity_2m + '% de umidade' : 'Umidade indisponível'}</span>
                <span><Wind size={16} />{forecast ? forecast.current.wind_speed_10m + ' km/h' : 'Vento indisponível'}</span>
              </div>
            </section>

            <section className="panel briefing" aria-labelledby="briefing-title">
              <div className="panel-heading"><div><h2 id="briefing-title">Resumo da previsão</h2><p>{place.city} · Hoje e próximos 2 dias</p></div><span className="soft-icon"><CloudRain size={21} /></span></div>
              <strong className="briefing-value">{rain === null ? '—' : rain.toFixed(1).replace('.', ',') + ' mm'}</strong>
              <span className="briefing-label">Chuva acumulada prevista</span>
              <dl className="briefing-list">
                <div><dt>Maior chance de chuva</dt><dd>{maximum(upcoming.slice(0, 3).map(row => row.chance), '%')}</dd></div>
                <div><dt>Rajada máxima prevista</dt><dd>{maximum(upcoming.slice(0, 3).map(row => row.gust), ' km/h')}</dd></div>
              </dl>
              <button className="text-link" onClick={() => go('risk')}>Ver análise de risco</button>
            </section>
          </div>

          <WeatherAssistant key={selectedLocation} city={place.city} forecast={forecast} status={weatherStatus}
            aiEnabled={Boolean(user) && import.meta.env.VITE_WEATHER_AI === 'true'} />

          <section className="panel weekly" aria-labelledby="weekly-title">
            <div className="panel-heading"><div><h2 id="weekly-title">Previsão para 7 dias</h2><p>{place.city} · Mínima, máxima e chance de chuva</p></div><CalendarDays size={20} aria-hidden="true" /></div>
            {upcoming.length ? <ul className="week-days">{upcoming.map((row, index) => <li key={row.date}>
              <span>{index === 0 ? 'Hoje' : row.label}</span>
              <WeatherIcon code={row.code} className="day-icon" />
              <strong>{degrees(row.max)} <span>{degrees(row.min)}</span></strong>
              <small><Droplets size={13} />{Number.isFinite(row.chance) ? row.chance + '%' : '—'}</small>
            </li>)}</ul> : <div className="empty"><p>{weatherStatus}</p></div>}
          </section>

          <div className="bottom-grid">
            <section className="panel chart-panel" aria-labelledby="evolution-title">
              <div className="panel-heading"><div><h2 id="evolution-title">Evolução meteorológica</h2><p>{place.city} · {chartMode === 'rain' ? 'Precipitação diária (mm)' : 'Temperaturas mínima e máxima (°C)'}</p></div>
                <div className="segments"><button aria-pressed={!history} onClick={() => setHistory(false)}>Previsão</button><button aria-pressed={history} onClick={() => setHistory(true)}>Histórico</button></div>
              </div>
              <div className="chart-modes"><button aria-pressed={chartMode === 'rain'} onClick={() => setChartMode('rain')}>Chuva</button><button aria-pressed={chartMode === 'temperature'} onClick={() => setChartMode('temperature')}>Temperatura</button></div>
              <div className="chart">{rows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={history ? rows.filter(row => row.date < today) : upcoming} margin={{ top: 14, right: 14, bottom: 0, left: 0 }}>
                <defs><linearGradient id="rain" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2264c8" stopOpacity={0.28} /><stop offset="100%" stopColor="#2264c8" stopOpacity={0.04} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#dbe6f3" strokeDasharray="4 4" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={10} tick={{ fill: '#435b79', fontSize: 13 }} /><YAxis tickLine={false} axisLine={false} width={35} tick={{ fill: '#435b79', fontSize: 13 }} />
                <Tooltip />{chartMode === 'rain' ? <Area type="monotone" dataKey="rain" name="Chuva (mm)" stroke="#2264c8" strokeWidth={2.5} fill="url(#rain)" /> : <>
                  <Line type="monotone" dataKey="max" name="Máxima (°C)" stroke="#ac5515" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="min" name="Mínima (°C)" stroke="#2264c8" strokeWidth={2.5} />
                </>}
              </ComposedChart></ResponsiveContainer> : <div className="empty"><CloudRain size={24} /><p>{weatherStatus}</p></div>}</div>
            </section>
            <section className="panel preview-map" aria-labelledby="regional-reports-title"><div className="panel-heading"><div><h2 id="regional-reports-title">Ocorrências na região</h2><p>{selectedLocation}{firebase && ' · ' + reports.length + ' validadas'}</p></div><Button variant="outline" onClick={() => go('map')}>Abrir mapa</Button></div><IncidentMap point={point} incidents={reports} /></section>
          </div>
        </>}
        {canShowLocation && currentPage === 'map' && <section className="panel page-panel"><div className="panel-heading"><div><h2>Ocorrências validadas</h2><p>{selectedLocation}</p></div><label>Tipo<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas</option>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label></div>
          <IncidentMap point={point} incidents={filtered} />{firebase ? <IncidentList items={filtered} emptyMessage={filter === 'all' ? 'Nenhuma ocorrência validada nesta região.' : 'Nenhuma ocorrência validada desse tipo nesta região.'} /> : <p>Conecte o Firebase para consultar e registrar ocorrências.</p>}
          {user && <><h2>Meus registros</h2>{ownReports.some(item => item.status === 'pending') && <p>Seus registros em análise aparecem aqui. Após aprovação, eles aparecem no mapa público da região.</p>}<IncidentList items={ownReports}>{() => null}</IncidentList></>}</section>}

        {currentPage === 'alerts' && user && <section className="panel page-panel" aria-labelledby="my-alert-reports">
          <h2 id="my-alert-reports">Meus registros</h2>
          <IncidentList items={ownReports} emptyMessage="Você ainda não registrou ocorrências.">{() => null}</IncidentList>
        </section>}
        {canShowLocation && currentPage === 'alerts' && <section className="panel page-panel"><div className="panel-heading"><div><h2>Locais acompanhados</h2><p>{selectedLocation}</p></div><Button disabled={busy} onClick={() => user ? void perform(() => toggleSubscription(user, place, followed)) : openModal('account')}><Bell size={17} />{followed ? 'Parar de acompanhar' : 'Acompanhar local'}</Button></div>
          {user && subscriptions.length ? <ul className="reports">{subscriptions.map(item => <li key={item.id}><div><strong>{locationLabel(item)}</strong><Button variant="outline" disabled={busy} onClick={() => void perform(() => toggleSubscription(user, item, true))}>Remover</Button></div><LocalAlerts place={item} /></li>)}</ul> : <p>{user ? 'Nenhum local acompanhado.' : 'Entre na sua conta para acompanhar locais.'}</p>}
          <h2>Avisos oficiais</h2><p>Consulte os avisos oficiais para a área selecionada. A validade e a cobertura constam em cada aviso.</p><a className="text-link" href={officialPortal.url} target="_blank" rel="noreferrer">Consultar avisos {officialPortal.name === 'OMM' ? 'da' : 'do'} {officialPortal.name}</a></section>}

        {canShowLocation && currentPage === 'risk' && <div className="risk-grid">
          <section className="panel page-panel">
            <h2>Monitoramento local</h2><p>{selectedLocation} · Open-Meteo</p>
            <div className="risk-value">{rain === null ? 'Dados indisponíveis' : rain.toFixed(1).replace('.', ',') + ' mm'}</div>
            <p>Chuva estimada para hoje e os próximos 2 dias.</p>
            {upcoming.length > 0 && <div className="table-scroll"><table className="risk-table">
              <caption>Previsão diária</caption><thead><tr><th scope="col">Data</th><th scope="col">Chuva</th><th scope="col">Chance</th><th scope="col">Rajadas</th></tr></thead>
              <tbody>{upcoming.map(row => <tr key={row.date}><th scope="row">{row.label}</th><td>{maximum([row.rain], ' mm')}</td><td>{maximum([row.chance], '%')}</td><td>{maximum([row.gust], ' km/h')}</td></tr>)}</tbody>
            </table></div>}
          </section>
          <section className="panel page-panel risk-context">
            <span className="soft-icon"><ShieldCheck size={21} /></span>
            <h2>Como interpretar</h2>
            <p>A chance indica a probabilidade de precipitação no ponto de previsão. A chuva acumulada e a rajada máxima descrevem as condições previstas para a cidade.</p>
            <p>A avaliação de risco local depende também de relevo, drenagem e histórico validado. Para decisões de segurança, consulte os avisos oficiais.</p>
            <a className="secondary" href={officialPortal.url} target="_blank" rel="noreferrer">Avisos {officialPortal.name === 'OMM' ? 'da' : 'do'} {officialPortal.name} <ExternalLink size={15} /></a>
          </section>
        </div>}
        {canShowLocation && currentPage === 'risk' && <TerritorialAnalysis />}
        {currentPage === 'admin' && <section className="panel page-panel"><h2>Fila de validação</h2><IncidentList items={queue}>{item => <div className="moderation"><Button disabled={busy} onClick={() => void perform(() => moderate(item.id, 'approved'))}>Aprovar</Button><Button variant="outline" disabled={busy} onClick={() => void perform(() => moderate(item.id, 'rejected'))}>Rejeitar</Button></div>}</IncidentList><Administration reports={reports} locality={selectedLocation} /></section>}

        <footer className="footer"><span>Climora</span><span>Localidades do IBGE e GeoNames · Previsão do Open-Meteo</span></footer>
      </div>
    </main>

    {modal && <Modal onClose={() => { if (!busy) setModal(null) }} title={modal === 'report' ? 'Registrar ocorrência' : register ? 'Criar conta' : 'Entrar no Climora'}>
      {!firebase ? <p>O painel climático está disponível. Acesse a conta e os registros após a configuração do Firebase.</p> : <form onSubmit={submit} className="dialog-form">
        {modal === 'account' ? <><label>E-mail<input name="email" type="email" required autoComplete="email" /></label><label>Senha<input name="password" type="password" required minLength={6} autoComplete={register ? 'new-password' : 'current-password'} /></label></> :
          <><p>{locationLabel({ ...place, district: '' })}</p>
          <label>Bairro<input name="reportDistrict" list="report-districts" defaultValue={place.district} required maxLength={100} placeholder="Escolha ou digite o bairro" /><datalist id="report-districts">{reportDistricts.map(item => <option key={item.id} value={item.nome} />)}</datalist></label>
          <p>O mapa público mostra um ponto aproximado no bairro.</p>
          <label>Tipo<select name="kind">{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label><label>Descrição<textarea name="description" required minLength={10} maxLength={1500} /></label>{blazeEnabled && <label>Foto opcional<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>}</>}
        {message && <p className="feedback" role="status">{message}</p>}<Button disabled={busy}>{busy ? 'Aguarde…' : modal === 'report' ? 'Enviar para validação' : register ? 'Criar conta' : 'Entrar'}</Button>
        {modal === 'account' && <button type="button" className="secondary" onClick={() => { setRegister(!register); setMessage('') }}>{register ? 'Já tenho conta' : 'Criar uma conta'}</button>}
      </form>}
    </Modal>}
  </div>
}

function degrees(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : Math.round(value) + '°'
}

function maximum(values: (number | null | undefined)[], unit: string) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  return valid.length ? Math.max(...valid).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + unit : '—'
}

function WeatherIcon({ code, className }: { code?: number | null; className: string }) {
  const Icon = code == null ? Cloud : code === 0 ? Sun : code < 3 ? CloudSun : code < 51 ? Cloud : code >= 95 ? CloudLightning : CloudRain
  return <Icon className={className} strokeWidth={1.35} aria-hidden="true" />
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  useEffect(() => { dialog?.showModal(); return () => dialog?.close() }, [dialog])
  return <dialog ref={setDialog} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="panel-heading"><h2 id="dialog-title">{title}</h2><Button variant="outline" size="icon" aria-label="Fechar" onClick={onClose}><X size={18} /></Button></div>{children}
  </dialog>
}

export default App




