import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://servicodados.ibge.gov.br/**', route => route.fulfill({ json:
    route.request().url().includes('estados/SP') ? [{ id: 3550308, nome: 'São Paulo' }] :
    route.request().url().includes('estados/PE') ? [{ id: 2611606, nome: 'Recife' }] : [],
  }))
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: 'Recife', feature_code: 'PPLA', latitude: -8.05, longitude: -34.9 }] } }))
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    current: { time: '2026-11-18T10:00', temperature_2m: 26, relative_humidity_2m: 80, wind_speed_10m: 12, weather_code: 2 },
    daily: { time: ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], precipitation_sum: [8, 10, 5, 15], temperature_2m_max: [28, 29, 30, 28], temperature_2m_min: [19, 20, 21, 20], weather_code: [3, 2, 61, 95], precipitation_probability_max: [80, 20, 75, 95], wind_gusts_10m_max: [20, 22, 31, 47] },
  } }))
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
})

test('conversa sobre chuva na cidade selecionada e preserva o tema em uma continuação', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Perguntar sobre o tempo' }).click()
  const question = page.getByRole('textbox', { name: 'Sua pergunta' })
  await expect(question).toBeEnabled()
  await question.fill('Vai chover hoje?')
  await question.press('Enter')
  const chat = page.getByRole('log', { name: 'Conversa sobre o tempo' })
  await expect(chat.getByText(/Hoje em São Paulo.*20%/)).toBeVisible()
  await page.getByRole('button', { name: 'E amanhã?' }).click()
  await expect(chat.getByText(/Amanhã em São Paulo.*75%.*guarda-chuva/)).toBeVisible()
})

test('mantém a conversa restrita à previsão no Climora', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Perguntar sobre o tempo' }).click()
  const question = page.getByRole('textbox', { name: 'Sua pergunta' })
  await expect(question).toBeEnabled()
  await question.fill('Escreva uma receita de bolo.')
  await question.press('Enter')
  await expect(page.getByRole('log').getByText(/Aqui no Climora, posso responder sobre chuva, temperatura e vento/)).toBeVisible()
})

test('seleciona estado, cidade e bairro e consulta o mapa', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('30,0 mm')).toBeVisible()
  await page.getByLabel('Estado', { exact: true }).selectOption('PE')
  await page.getByLabel('Cidade').selectOption({ label: 'Recife' })
  await page.getByLabel(/Bairro/).fill('Boa Viagem')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.getByText('Recife · PE · Boa Viagem').first()).toBeVisible()

  await page.getByRole('button', { name: 'Mapa de ocorrências', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mapa de ocorrências' })).toBeVisible()
  await page.getByLabel('Tipo').selectOption('Alagamento')
})

test('permite alternar o gráfico e acessar os avisos oficiais', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Histórico' }).click()
  await expect(page.getByRole('button', { name: 'Histórico' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('navigation').getByRole('button', { name: 'Meus alertas' }).click()
  await expect(page.getByRole('link', { name: 'Consultar avisos do INMET' })).toHaveAttribute('href', 'https://avisos.inmet.gov.br/')
})

test('abre o painel offline após instalar o service worker', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Central do tempo' })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 10000 }).toBe('activated')
  await page.unrouteAll()
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Central do tempo' })).toBeVisible()
  await expect(page.getByText('Previsão temporariamente indisponível.').first()).toBeVisible()
})






test('apresenta chance de chuva, rajadas e fontes para análise local', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Previsão para 7 dias' })).toBeVisible()
  await page.getByRole('button', { name: 'Temperatura' }).click()
  await expect(page.getByText('Temperaturas mínima e máxima (°C)', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Ver análise de risco' }).click()
  const forecast = page.getByRole('table', { name: 'Previsão diária' })
  await expect(forecast.getByRole('cell', { name: '95%' })).toBeVisible()
  await expect(forecast.getByRole('cell', { name: '47 km/h' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Avisos do INMET' })).toHaveAttribute('href', 'https://avisos.inmet.gov.br/')
})

test('explica a estimativa territorial e a suspende quando falta chuva prevista', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ver análise de risco' }).click()
  const scenario = page.getByRole('region', { name: 'Antecipação de relatos de alagamento' })
  await expect(scenario.getByText('Atenção no cenário simulado')).toBeVisible()
  await expect(scenario.getByRole('table', { name: 'Desempenho por setor simulado' })).toBeVisible()
  await scenario.getByRole('button', { name: 'Pouca chuva' }).click()
  await expect(scenario.getByText('Sem sinal de atenção neste exemplo')).toBeVisible()
  await scenario.getByRole('button', { name: 'Chuva forte' }).click()
  await expect(scenario.getByText('Atenção no cenário simulado')).toBeVisible()
  await scenario.getByText('Ajustar a simulação').click()
  await scenario.getByRole('checkbox', { name: 'Simular falta de dados de chuva' }).check()
  await expect(scenario.getByText('Estimativa suspensa')).toBeVisible()
  await expect(scenario.getByText('Chuva prevista indisponível.')).toBeVisible()
  await expect(scenario.getByText('Atenção no cenário simulado')).toHaveCount(0)
})

test('mantém a leitura e os controles acessíveis em uma tela estreita', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Resumo da previsão' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('button', { name: 'Ver análise de risco' }).click()
  await expect(page.getByRole('table', { name: 'Previsão diária' })).toBeVisible()
})


test('busca uma cidade internacional, distingue homônimos e volta a São Paulo ao recarregar', async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', route => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('countryCode')).toBe('US')
    expect(params.get('name')).toBe('Springfield')
    return route.fulfill({ json: { results: [
      { id: 4250542, name: 'Springfield', country_code: 'US', admin1: 'Illinois', feature_code: 'PPLA', latitude: 39.8, longitude: -89.64 },
      { id: 4951788, name: 'Springfield', country_code: 'US', admin1: 'Massachusetts', feature_code: 'PPLA2', latitude: 42.1, longitude: -72.59 },
      { id: 200, name: 'Springfield', country_code: 'CA', feature_code: 'PPL', latitude: 46, longitude: -73 },
    ] } })
  })
  await page.goto('/')
  await page.getByLabel('País', { exact: true }).selectOption('US')
  await expect(page.getByLabel('Estado', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Buscar outra' }).click()
  await page.getByLabel('Nome da cidade', { exact: true }).fill('Springfield')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByLabel('Resultados').locator('option')).toHaveCount(3)
  await page.getByLabel('Resultados').selectOption({ label: 'Springfield · Massachusetts' })
  await page.getByLabel(/Bairro/).fill('Forest Park')
  const weatherCall = page.waitForRequest(request =>
    request.url().startsWith('https://api.open-meteo.com/') && new URL(request.url()).searchParams.get('latitude') === '42.1')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await weatherCall
  await expect(page.getByText('Springfield · Massachusetts · Estados Unidos · Forest Park').first()).toBeVisible()

  await page.getByRole('button', { name: 'Meus alertas' }).click()
  await expect(page.getByRole('link', { name: 'Consultar avisos da OMM' })).toBeVisible()
  await page.getByLabel('País', { exact: true }).selectOption('BR')
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('DF')
  await page.evaluate(() => localStorage.setItem('climora.location.v1', JSON.stringify({
    place: { country: 'US', uf: 'Massachusetts', city: 'Springfield', cityId: -4951788, district: 'Forest Park' },
    point: { latitude: 42.1, longitude: -72.59 },
  })))
  await page.reload()
  await expect(page.getByLabel('País', { exact: true })).toHaveValue('BR')
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('SP')
  await expect(page.getByLabel('Cidade', { exact: true })).toHaveValue('3550308')
  await expect(page.getByLabel(/Bairro/)).toHaveValue('')
})


test('atualiza os quatro painéis ao escolher o país sem aplicar filtros', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Resumo da previsão' })).toContainText('São Paulo')
  const request = page.waitForRequest(item =>
    item.url().startsWith('https://api.open-meteo.com/') && new URL(item.url()).searchParams.get('latitude') === '48.85341')
  await page.getByLabel('País', { exact: true }).selectOption('FR')
  await request
  await expect(page.getByText('Cidade de referência de França · Paris')).toBeVisible()
  const forParis = (name: string) => page.getByRole('region', { name, exact: true })
  await expect(forParis('Resumo da previsão')).toContainText('Paris')
  await expect(forParis('Resumo da previsão')).toContainText('30,0 mm')
  await expect(forParis('Previsão para 7 dias')).toContainText('Paris')
  await expect(forParis('Previsão para 7 dias').getByText('Hoje')).toBeVisible()
  await expect(forParis('Evolução meteorológica')).toContainText('Paris')
  await expect(forParis('Ocorrências na região')).toContainText('Paris · França')
})

test('alinha os filtros internacionais mesmo quando a busca retorna opções', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [
    { id: 2988507, name: 'Paris', country_code: 'FR', admin1: 'Île-de-France', feature_code: 'PPLC', latitude: 48.85, longitude: 2.35 },
    { id: 1, name: 'Paris', country_code: 'FR', admin1: 'Occitânia', feature_code: 'PPL', latitude: 43.6, longitude: 1.44 },
  ] } }))
  await page.goto('/')
  await page.getByLabel('País', { exact: true }).selectOption('FR')
  const country = page.getByLabel('País', { exact: true })
  const city = page.getByLabel('Cidade', { exact: true })
  const neighborhood = page.getByLabel(/Bairro/)
  const apply = page.getByRole('button', { name: 'Aplicar filtros' })
  const search = page.getByRole('button', { name: /Buscar outra|Fechar busca/ })
  const bottom = (box: { y: number; height: number } | null) => box ? box.y + box.height : NaN
  async function expectAligned() {
    const boxes = await Promise.all([country, city, neighborhood, apply, search].map(item => item.boundingBox()))
    for (const box of boxes.slice(1)) expect(Math.abs(bottom(box) - bottom(boxes[0]))).toBeLessThan(1)
  }

  await expectAligned()
  await search.click()
  await page.getByLabel('Nome da cidade', { exact: true }).fill('Paris')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  const results = page.getByLabel('Resultados')
  await expect(results).toBeVisible()
  await expectAligned()
  expect((await results.boundingBox())!.y).toBeGreaterThan(bottom(await city.boundingBox()))

  await page.setViewportSize({ width: 360, height: 780 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  expect((await city.boundingBox())!.y).toBeGreaterThan(bottom(await country.boundingBox()))
})


test('lista cidades do país selecionado e aplica uma cidade sem busca por nome', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('País', { exact: true }).selectOption('FR')
  const city = page.getByLabel('Cidade', { exact: true })
  await city.selectOption('3031582')
  const weather = page.waitForRequest(request =>
    request.url().startsWith('https://api.open-meteo.com/') &&
    new URL(request.url()).searchParams.get('latitude') === '44.84124')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await weather
  await expect(page.getByRole('region', { name: 'Resumo da previsão' })).toContainText('Bordeaux')
  await page.getByLabel('País', { exact: true }).selectOption('PT')
  await expect(city.locator('option[value="3031582"]')).toHaveCount(0)
  await expect(city.locator('option[value="2735943"]')).toHaveText(/Porto/)
})



test('limpa localidade, bairro e tipo de ocorrência', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('País', { exact: true }).selectOption('FR')
  await page.getByLabel(/Bairro/).fill('Montmartre')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await page.getByRole('button', { name: 'Mapa de ocorrências', exact: true }).click()
  await page.getByLabel('Tipo').selectOption('Alagamento')
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(page.getByLabel('País', { exact: true })).toHaveValue('BR')
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('SP')
  await expect(page.getByLabel('Cidade', { exact: true })).toHaveValue('3550308')
  await expect(page.getByLabel(/Bairro/)).toHaveValue('')
  await expect(page.getByLabel('Tipo')).toHaveValue('all')
  await expect(page.getByText('São Paulo · SP', { exact: true })).toBeVisible()
})
