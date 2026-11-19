import { useId, useState, type FormEvent } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { MessageCircle, Send } from 'lucide-react'
import { Button } from './components/ui/button'
import { firebase } from './firebase'
import type { Forecast } from './climate'
import { localWeatherIntent, preservesWeatherNumbers, weatherDays, weatherReply, weatherTopics, type WeatherIntent } from './weatherAnswers'

const suggestions = ['Qual a previsão de hoje?', 'Vai chover hoje?', 'Que horas deve chover?', 'E amanhã?']
const help = 'Aqui no Climora, posso responder sobre chuva, temperatura e vento na cidade selecionada para hoje, amanhã ou depois de amanhã.'

export function WeatherAssistant({ city, forecast, status, aiEnabled }: {
  city: string; forecast?: Forecast; status: string; aiEnabled: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<{ question: string; answer?: string }[]>([])
  const [previous, setPrevious] = useState<WeatherIntent>()
  const [busy, setBusy] = useState(false)

  async function ask(question: string) {
    const text = question.trim()
    if (!text || !forecast || busy) return
    setDraft('')
    setTurns(items => [...items.slice(-7), { question: text }])
    setBusy(true)

    let intent = localWeatherIntent(text, previous)
    let answer = intent ? weatherReply(forecast, intent, city) : help
    try {
      if (aiEnabled && firebase) {
        const references = weatherDays.flatMap(day => weatherTopics.map(topic => ({
          day, topic, forecast: weatherReply(forecast, { day, topic }, city),
        })))
        const generate = httpsCallable<
          { question: string; city: string; previous?: WeatherIntent; references: typeof references },
          (WeatherIntent & { answer: string }) | null
        >(
          getFunctions(firebase, 'southamerica-east1'), 'classifyWeatherQuestion', { timeout: 17000 },
        )
        const generated = (await generate({ question: text, city, previous, references })).data
        if (generated && (!intent || (intent.day === generated.day && intent.topic === generated.topic))) {
          intent = { day: generated.day, topic: generated.topic }
          const reference = weatherReply(forecast, intent, city)
          answer = typeof generated.answer === 'string' && preservesWeatherNumbers(generated.answer, reference, city) ? generated.answer : reference
        }
      }
    } catch {
      if (!intent) answer = 'Não consegui interpretar essa pergunta agora. Tente uma das sugestões abaixo.'
    } finally {
      if (intent) setPrevious(intent)
      setTurns(items => [...items.slice(0, -1), { question: text, answer }])
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(draft)
  }

  return <section className="panel weather-assistant">
    <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <MessageCircle size={17} aria-hidden="true" /> Perguntar sobre o tempo
    </Button>
    <div id={id} hidden={!open}>
      <p className="weather-assistant-source">{city} · Open-Meteo</p>
      {!forecast && <p role="status">{status}</p>}
      <div role="log" aria-label="Conversa sobre o tempo" className="weather-conversation">
        {turns.map(({ question, answer }, index) => <div key={index}>
          <p className="weather-question">{question}</p>
          {answer && <p className="weather-answer">{answer}</p>}
        </div>)}
      </div>
      {busy && <p role="status">Consultando…</p>}
      <div className="weather-suggestions">{suggestions.map(question =>
        <Button key={question} type="button" variant="outline" disabled={!forecast || busy} onClick={() => void ask(question)}>{question}</Button>,
      )}</div>
      <form className="weather-question-form" onSubmit={submit}>
        <label htmlFor={`${id}-question`}>Sua pergunta</label>
        <div>
          <input id={`${id}-question`} value={draft} maxLength={240} onChange={event => setDraft(event.target.value)} disabled={!forecast || busy} />
          <Button type="submit" disabled={!forecast || busy || !draft.trim()}><Send size={16} aria-hidden="true" /> Enviar</Button>
        </div>
      </form>
    </div>
  </section>
}
