import { normalize, type Forecast } from './climate'

export type WeatherTopic = 'overview' | 'rain' | 'rainTiming' | 'temperature' | 'wind'
export type WeatherIntent = { topic: WeatherTopic; day: 0 | 1 | 2 }
export const weatherTopics: WeatherTopic[] = ['overview', 'rain', 'rainTiming', 'temperature', 'wind']
export const weatherDays: WeatherIntent['day'][] = [0, 1, 2]

export function preservesWeatherNumbers(answer: string, reference: string, city: string) {
  const numbers = (value: string) => value.replaceAll(city, '').match(/-?\d+(?::\d{2}|[.,]\d+)?/g) ?? []
  if (!answer.trim()) return false
  const expected = numbers(reference).sort()
  const actual = numbers(answer).sort()
  return actual.length === expected.length && actual.every((number, index) => number === expected[index])
}

export function localWeatherIntent(question: string, previous?: WeatherIntent): WeatherIntent | undefined {
  const text = normalize(question).replace(/[?!.]+$/g, '')
  const relativeDay = /\bdepois de amanha\b/.test(text) ? 2 : /\bamanha\b/.test(text) ? 1 : /\bhoje\b/.test(text) ? 0 : undefined
  if (/^(e\s+)?(hoje|amanha|depois de amanha)$/.test(text)) return { topic: previous?.topic ?? 'overview', day: relativeDay ?? 0 }
  const day = relativeDay ?? 0
  const subject = text.replace(/(?: (?:de|para))? (hoje|amanha|depois de amanha)$/, '')
  if (/^(vai chover|chove|qual (e )?a chance de chuva|(?:preciso|devo) levar (?:um )?guarda[ -]chuva)$/.test(subject)) return { topic: 'rain', day }
  if (/^(que horas|quando) (vai|deve) chover$/.test(subject)) return { topic: 'rainTiming', day }
  if (/^(qual (e )?a temperatura|vai fazer (frio|calor)|quantos graus vai fazer)$/.test(subject)) return { topic: 'temperature', day }
  if (/^(vai ventar|como fica o vento|qual (e )?a previsao de vento)$/.test(subject)) return { topic: 'wind', day }
  if (/^(qual (e )?a previsao|como (esta|fica|vai ficar) o tempo|qual (e )?a previsao do tempo)$/.test(subject)) return { topic: 'overview', day }
}

export function weatherReply(forecast: Forecast, intent: WeatherIntent, city: string) {
  const today = forecast.current.time.slice(0, 10)
  const todayIndex = forecast.daily.time.indexOf(today)
  const index = todayIndex + intent.day
  const date = forecast.daily.time[index]
  if (!date || todayIndex < 0) return 'A previsão desse dia está indisponível.'

  const day = ['Hoje', 'Amanhã', 'Depois de amanhã'][intent.day]
  const prefix = `${day} em ${city}`
  const { daily, hourly } = forecast
  const chance = daily.precipitation_probability_max?.[index]
  const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  const min = daily.temperature_2m_min[index]
  const max = daily.temperature_2m_max[index]
  const temperatures = hasNumber(min) && hasNumber(max) ? `mínima de ${Math.round(min)} °C e máxima de ${Math.round(max)} °C` : ''
  const rain = hasNumber(chance) ? `chance máxima de chuva de ${chance}%` : ''
  const umbrella = hasNumber(chance) && chance >= 50 ? ' Se for sair, vale levar um guarda-chuva.' : ''

  switch (intent.topic) {
    case 'rainTiming': {
      let peak = 0
      let peakHour = ''
      let hasHours = false
      hourly?.time.forEach((time, hour) => {
        const probability = hourly.precipitation_probability[hour]
        if (time.slice(0, 10) !== date || time < forecast.current.time.slice(0, 13) || !hasNumber(probability)) return
        hasHours = true
        if (probability > peak) {
          peak = probability
          peakHour = time.slice(11, 16)
        }
      })
      if (peakHour) return `${prefix}, a maior chance de chuva nas horas consultadas é de ${peak}%, às ${peakHour} (hora local).`
      return hasHours ? `${prefix}, a chance de chuva é de 0% nas horas consultadas.` : `Os horários de chuva estão indisponíveis para ${city}.`
    }
    case 'rain':
      return rain ? `${prefix}, a chance de chuva chega a ${chance}%.${umbrella}` : `A chance de chuva está indisponível para ${city}.`
    case 'temperature':
      return temperatures ? `${prefix}, a previsão indica ${temperatures}.` : `A temperatura prevista está indisponível para ${city}.`
    case 'wind': {
      const gust = daily.wind_gusts_10m_max?.[index]
      return hasNumber(gust) ? `${prefix}, as rajadas podem chegar a ${Math.round(gust)} km/h.` : `A previsão de rajadas está indisponível para ${city}.`
    }
    case 'overview': {
      const details = [temperatures, rain].filter(Boolean).join(' e ')
      return details ? `${prefix}, a previsão indica ${details}.` : `A previsão está indisponível para ${city}.`
    }
  }
}
