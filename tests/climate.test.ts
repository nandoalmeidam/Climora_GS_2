import { describe, expect, it } from 'vitest'
import { initialPlace, knownDistrictPoint, normalize, states, stateNames, weatherLabel } from '../src/climate'
import { localWeatherIntent, preservesWeatherNumbers, weatherReply } from '../src/weatherAnswers'
import type { Forecast } from '../src/climate'

describe('assistente de previsão', () => {
  const forecast: Forecast = {
    current: { time: '2026-11-19T12:15', temperature_2m: 24, relative_humidity_2m: 80, wind_speed_10m: 12, weather_code: 3 },
    daily: {
      time: ['2026-11-18', '2026-11-19', '2026-11-20'],
      precipitation_sum: [0, 2, 0], precipitation_probability_max: [0, 65, null],
      temperature_2m_min: [18, 19, 20], temperature_2m_max: [25, 26, 27],
    },
    hourly: { time: ['2026-11-19T09:00', '2026-11-19T16:00'], precipitation_probability: [65, 55] },
  }

  it('usa a chance do dia local e mantém o tema ao perguntar sobre amanhã', () => {
    const intent = localWeatherIntent('Vai chover hoje?')
    expect(intent).toEqual({ topic: 'rain', day: 0 })
    expect(weatherReply(forecast, { topic: 'rain', day: 0 }, 'São Paulo')).toMatch(/65%.*guarda-chuva/)
    expect(localWeatherIntent('E amanhã?', intent)).toEqual({ topic: 'rain', day: 1 })
    expect(weatherReply(forecast, { topic: 'rain', day: 1 }, 'São Paulo')).toContain('indisponível')
  })

  it('aceita outra redação com os mesmos números e rejeita probabilidades inventadas', () => {
    const reference = weatherReply(forecast, { topic: 'rain', day: 0 }, 'São Paulo')
    expect(reference).toMatch(/^Hoje/)
    expect(preservesWeatherNumbers('Pode chover em São Paulo hoje. A chance chega a 65%.', reference, 'São Paulo')).toBe(true)
    expect(preservesWeatherNumbers('A chance chega a 90%.', reference, 'São Paulo')).toBe(false)
    expect(preservesWeatherNumbers('', 'A previsão está indisponível.', 'São Paulo')).toBe(false)
  })

  it('indica o horário de maior chance entre as horas restantes do dia', () => {
    expect(weatherReply(forecast, { topic: 'rainTiming', day: 0 }, 'São Paulo')).toContain('55%, às 16:00')
    expect(localWeatherIntent('Vai chover amanhã no Rio?')).toBeUndefined()
  })
})

describe('catálogo nacional', () => {
  it('distingue o bairro do Sumaré, na capital, do município homônimo', () => {
    expect(knownDistrictPoint({ ...initialPlace, district: ' Sumaré ' })).toEqual({ latitude: -23.54538, longitude: -46.68117 })
    expect(knownDistrictPoint({ ...initialPlace, city: 'Sumaré', cityId: 3552403, district: 'Sumaré' })).toBeUndefined()
  })
  it('inclui as 27 unidades federativas', () => {
    expect(new Set(states).size).toBe(27)
    expect(states.every(uf => Boolean(stateNames[uf]))).toBe(true)
  })

  it('compara bairros ignorando caixa, espaços externos e acentos', () => {
    expect(normalize('  São JOÃO  ')).toBe('sao joao')
  })
})

describe('condições meteorológicas', () => {
  it('diferencia chuva, neve e trovoada', () => {
    expect(weatherLabel(65)).toBe('Precipitação')
    expect(weatherLabel(86)).toBe('Neve')
    expect(weatherLabel(99)).toBe('Trovoada')
  })
})
